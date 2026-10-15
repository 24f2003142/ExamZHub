from datetime import date, datetime, time

from flask import Blueprint, jsonify, request
from flask_jwt_extended import verify_jwt_in_request

from ..extensions import db
from ..models import Booking, Evaluation, EvaluationScore, Exam, Slot
from ..utils import current_user

bp = Blueprint("examiner", __name__, url_prefix="/api/examiner")


@bp.before_request
def examiner_guard():
    if request.method == "OPTIONS":
        return None
    verify_jwt_in_request()
    user = current_user()
    if not user or not user.is_active:
        return jsonify(error="Account disabled or not found"), 401
    if user.role != "examiner":
        return jsonify(error="Forbidden"), 403


def err(msg, code=400):
    return jsonify(error=msg), code


def hm(value):
    return value.strftime("%H:%M")


def slot_dict(slot):
    return dict(
        id=slot.id,
        exam_id=slot.exam_id,
        exam=slot.exam.name,
        date=slot.date.isoformat(),
        start_time=hm(slot.start_time),
        end_time=hm(slot.end_time),
        capacity=slot.capacity,
        available_seats=slot.available_seats,
        booked=slot.capacity - slot.available_seats,
        status=slot.status,
        meeting_link=slot.meeting_link,
    )


def booking_dict(booking):
    student_profile = booking.student.student_profile
    evaluation = booking.evaluation
    return dict(
        id=booking.id,
        status=booking.status,
        student_id=booking.student_id,
        student=booking.student.name,
        email=booking.student.email,
        roll_no=student_profile.roll_no if student_profile else None,
        exam_id=booking.exam_id,
        exam=booking.exam.name,
        slot_id=booking.slot_id,
        date=booking.slot.date.isoformat(),
        start_time=hm(booking.slot.start_time),
        end_time=hm(booking.slot.end_time),
        evaluation_status=evaluation.status if evaluation else "Pending",
        total_marks=(
            evaluation.total_marks
            if evaluation and evaluation.status == "Submitted"
            else None
        ),
    )


def my_bookings(user_id, *statuses):
    query = Booking.query.join(Slot).filter(Slot.examiner_id == user_id)
    if statuses:
        query = query.filter(Booking.status.in_(statuses))
    return query


def read_slot(data, base=None):
    try:
        day = date.fromisoformat(
            str(data.get("date") or (base.date.isoformat() if base else ""))
        )
        start_time = time.fromisoformat(
            str(data.get("start_time") or (hm(base.start_time) if base else ""))
        )
        end_time = time.fromisoformat(
            str(data.get("end_time") or (hm(base.end_time) if base else ""))
        )
    except ValueError:
        raise ValueError("Use date as YYYY-MM-DD and times as HH:MM")
    try:
        capacity = int(data.get("capacity", base.capacity if base else 1))
    except (ValueError, TypeError):
        raise ValueError("Capacity must be a number")
    if capacity < 1:
        raise ValueError("Capacity must be at least 1")
    if day < date.today():
        raise ValueError("Slot date cannot be in the past")
    if end_time <= start_time:
        raise ValueError("End time must be after start time")
    return day, start_time, end_time, capacity


def overlaps(user_id, day, start_time, end_time, exclude_id=None):
    query = Slot.query.filter(
        Slot.examiner_id == user_id,
        Slot.date == day,
        Slot.status != "Cancelled",
        Slot.start_time < end_time,
        Slot.end_time > start_time,
    )
    if exclude_id:
        query = query.filter(Slot.id != exclude_id)
    return query.first() is not None


@bp.get("/dashboard")
def dashboard():
    user = current_user()
    return jsonify(
        assigned_exams=len(user.assigned_exams),
        slots_created=Slot.query.filter_by(examiner_id=user.id).count(),
        booked_students=my_bookings(user.id, "Booked", "Completed").count(),
        pending_evaluations=my_bookings(user.id, "Booked").count(),
    )


@bp.get("/exams")
def my_exams():
    user = current_user()
    return jsonify(
        exams=[
            dict(
                id=exam.id,
                name=exam.name,
                course=exam.course.name,
                exam_type=exam.exam_type,
                duration=exam.duration,
                max_marks=exam.max_marks,
                status=exam.status,
                slots=Slot.query.filter_by(
                    exam_id=exam.id, examiner_id=user.id
                ).count(),
                pending=my_bookings(user.id, "Booked")
                .filter(Booking.exam_id == exam.id)
                .count(),
            )
            for exam in user.assigned_exams
        ]
    )


@bp.get("/slots")
def list_slots():
    user = current_user()
    query = Slot.query.filter_by(examiner_id=user.id)
    if request.args.get("exam_id"):
        query = query.filter(Slot.exam_id == request.args["exam_id"])
    slots = query.order_by(Slot.date, Slot.start_time)
    return jsonify(slots=[slot_dict(slot) for slot in slots])


@bp.post("/slots")
def create_slot():
    user = current_user()
    data = request.get_json(silent=True) or {}
    exam = db.session.get(Exam, data.get("exam_id") or 0)
    if not exam or exam not in user.assigned_exams:
        return err("Exam not found or not assigned to you", 404)
    if exam.status != "Slot Creation":
        return err("Slot creation is not open for this exam", 409)
    try:
        day, start_time, end_time, capacity = read_slot(data)
    except ValueError as error:
        return err(str(error))
    if overlaps(user.id, day, start_time, end_time):
        return err("This overlaps with another of your slots", 409)
    slot = Slot(
        exam_id=exam.id,
        examiner_id=user.id,
        date=day,
        start_time=start_time,
        end_time=end_time,
        capacity=capacity,
        available_seats=capacity,
        status="Available",
        meeting_link=data.get("meeting_link") or None,
    )
    db.session.add(slot)
    db.session.commit()
    return jsonify(slot=slot_dict(slot)), 201


def own_editable_slot(slot_id):
    """Return the examiner's editable slot or a response explaining why not."""
    user = current_user()
    slot = db.session.get(Slot, slot_id)
    if not slot or slot.examiner_id != user.id:
        return None, err("Slot not found", 404)
    if slot.exam.status != "Slot Creation":
        return None, err("Slots can only be changed before student booking begins", 409)
    if Booking.query.filter_by(slot_id=slot_id).first():
        return None, err("Slot already has bookings", 409)
    return slot, None


@bp.put("/slots/<int:sid>")
def update_slot(sid):
    slot, error = own_editable_slot(sid)
    if error:
        return error
    data = request.get_json(silent=True) or {}
    try:
        day, start_time, end_time, capacity = read_slot(data, base=slot)
    except ValueError as value_error:
        return err(str(value_error))
    if overlaps(slot.examiner_id, day, start_time, end_time, exclude_id=sid):
        return err("This overlaps with another of your slots", 409)
    slot.date, slot.start_time, slot.end_time = day, start_time, end_time
    slot.capacity = slot.available_seats = capacity
    slot.meeting_link = data.get("meeting_link", slot.meeting_link) or None
    db.session.commit()
    return jsonify(slot=slot_dict(slot))


@bp.delete("/slots/<int:sid>")
def delete_slot(sid):
    slot, error = own_editable_slot(sid)
    if error:
        return error
    db.session.delete(slot)
    db.session.commit()
    return jsonify(message="Deleted")


@bp.get("/bookings")
def list_bookings():
    user = current_user()
    query = my_bookings(user.id, "Booked", "Completed")
    if request.args.get("exam_id"):
        query = query.filter(Booking.exam_id == request.args["exam_id"])
    if request.args.get("slot_id"):
        query = query.filter(Booking.slot_id == request.args["slot_id"])
    if request.args.get("pending") == "1":
        query = query.filter(Booking.status == "Booked")
    bookings = query.order_by(Slot.date, Slot.start_time)
    return jsonify(bookings=[booking_dict(booking) for booking in bookings])


def own_booking(booking_id):
    user = current_user()
    booking = db.session.get(Booking, booking_id)
    if not booking or booking.slot.examiner_id != user.id:
        return None
    return booking


@bp.get("/bookings/<int:bid>/evaluation")
def get_evaluation(bid):
    booking = own_booking(bid)
    if not booking:
        return err("Booking not found", 404)
    evaluation = booking.evaluation
    given_scores = (
        {score.rubric_id: score.marks for score in evaluation.scores}
        if evaluation
        else {}
    )
    return jsonify(
        booking=booking_dict(booking),
        rubrics=[
            dict(
                id=rubric.id,
                criterion=rubric.criterion,
                max_marks=rubric.max_marks,
                weightage=rubric.weightage,
                description=rubric.description,
                marks=given_scores.get(rubric.id),
            )
            for rubric in booking.exam.rubrics
        ],
        remarks=evaluation.remarks if evaluation else None,
        total_marks=evaluation.total_marks if evaluation else None,
        max_marks=booking.exam.max_marks,
    )


@bp.post("/bookings/<int:bid>/evaluate")
def evaluate(bid):
    user = current_user()
    booking = own_booking(bid)
    if not booking:
        return err("Booking not found", 404)
    exam = booking.exam
    if booking.status == "Cancelled":
        return err("Booking was cancelled", 409)
    if exam.status not in ("Booking Open", "Closed"):
        return err("Evaluation is not open for this exam", 409)
    if exam.results_published:
        return err("Results already published", 409)

    data = request.get_json(silent=True) or {}
    scores = data.get("scores")
    if not isinstance(scores, list):
        return err("scores must be a list of {rubric_id, marks}")
    rubrics = {rubric.id: rubric for rubric in exam.rubrics}
    given_scores = {}
    for score in scores:
        try:
            rubric_id, marks = int(score.get("rubric_id")), float(score.get("marks"))
        except (ValueError, TypeError, AttributeError):
            return err("Each score needs rubric_id and numeric marks")
        if rubric_id not in rubrics:
            return err(f"Rubric {rubric_id} does not belong to this exam")
        if rubric_id in given_scores:
            return err(f"Rubric {rubric_id} scored twice")
        if marks < 0 or marks > rubrics[rubric_id].max_marks:
            criterion = rubrics[rubric_id].criterion
            maximum = rubrics[rubric_id].max_marks
            return err(f"Marks for '{criterion}' must be 0 to {maximum:g}")
        given_scores[rubric_id] = marks
    if set(given_scores) != set(rubrics):
        return err("Score every rubric criterion")

    evaluation = booking.evaluation or Evaluation(
        booking_id=booking.id,
        student_id=booking.student_id,
        examiner_id=user.id,
    )
    evaluation.scores = [
        EvaluationScore(rubric_id=rubric_id, marks=marks)
        for rubric_id, marks in given_scores.items()
    ]
    evaluation.total_marks = round(sum(given_scores.values()), 2)
    evaluation.remarks = (data.get("remarks") or "").strip()
    evaluation.evaluation_date = datetime.utcnow()
    evaluation.status = "Submitted"
    booking.status = "Completed"
    db.session.add(evaluation)
    db.session.commit()
    return jsonify(
        message="Evaluation submitted",
        total_marks=evaluation.total_marks,
        max_marks=exam.max_marks,
    )


@bp.post("/exams/<int:eid>/complete")
def complete_exam(eid):
    user = current_user()
    exam = db.session.get(Exam, eid)
    if not exam or exam not in user.assigned_exams:
        return err("Exam not found or not assigned to you", 404)
    if exam.status != "Closed":
        return err("Exam can be completed only after booking is closed", 409)
    pending = my_bookings(user.id, "Booked").filter(Booking.exam_id == eid).count()
    if pending:
        return err(f"{pending} evaluation(s) still pending", 409)

    for slot in Slot.query.filter_by(exam_id=eid, examiner_id=user.id):
        if slot.status != "Cancelled":
            slot.status = "Completed"
    db.session.flush()
    remaining = Slot.query.filter(
        Slot.exam_id == eid,
        Slot.status.notin_(["Completed", "Cancelled"]),
    ).count()
    if remaining == 0:
        exam.status = "Completed"
    db.session.commit()
    return jsonify(message="Your slots are marked completed", exam_status=exam.status)
