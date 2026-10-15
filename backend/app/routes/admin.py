from datetime import datetime

from flask import Blueprint, jsonify, request
from flask_jwt_extended import verify_jwt_in_request
from sqlalchemy import or_

from ..extensions import db
from ..cache_utils import TTL_STATS, cached
from ..models import (
    Booking,
    Course,
    Evaluation,
    Exam,
    ExaminerProfile,
    Rubric,
    Slot,
    User,
)
from ..utils import EMAIL_RE, current_user
from .examiner import overlaps

bp = Blueprint("admin", __name__, url_prefix="/api/admin")

EXAM_TYPES = {"Viva", "Practical", "Project Demo", "Assessment"}
DT_FIELDS = ["slot_creation_start", "slot_creation_end", "booking_start", "booking_end"]


@bp.before_request
def admin_guard():
    if request.method == "OPTIONS":
        return None
    verify_jwt_in_request()
    user = current_user()
    if not user or not user.is_active:
        return jsonify(error="Account disabled or not found"), 401
    if user.role != "admin":
        return jsonify(error="Forbidden"), 403


def err(msg, code=400):
    return jsonify(error=msg), code


def iso(value):
    return value.isoformat() if value else None


def parse_dt(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except (ValueError, TypeError):
        raise ValueError(f"Invalid date/time: {value}")


def pos_int(value, label):
    try:
        value = int(value)
    except (ValueError, TypeError):
        raise ValueError(f"{label} must be a number")
    if value <= 0:
        raise ValueError(f"{label} must be greater than 0")
    return value


def course_dict(course):
    return dict(
        id=course.id,
        code=course.code,
        name=course.name,
        description=course.description,
        status=course.status,
        exam_count=len(course.exams),
    )


def rubric_dict(rubric):
    return dict(
        id=rubric.id,
        exam_id=rubric.exam_id,
        criterion=rubric.criterion,
        max_marks=rubric.max_marks,
        weightage=rubric.weightage,
        description=rubric.description,
    )


def exam_dict(exam, detail=False):
    data = dict(
        id=exam.id,
        course_id=exam.course_id,
        course=exam.course.name if exam.course else None,
        course_code=exam.course.code if exam.course else None,
        name=exam.name,
        exam_type=exam.exam_type,
        duration=exam.duration,
        max_marks=exam.max_marks,
        status=exam.status,
        results_published=exam.results_published,
        instructions=exam.instructions,
        **{field: iso(getattr(exam, field)) for field in DT_FIELDS},
    )
    if detail:
        data["rubrics"] = [rubric_dict(rubric) for rubric in exam.rubrics]
        data["examiners"] = [
            dict(id=user.id, name=user.name, email=user.email)
            for user in exam.examiners
        ]
    return data


@bp.get("/stats")
def stats():
    def produce():
        return dict(
            courses=Course.query.count(),
            exams=Exam.query.count(),
            students=User.query.filter_by(role="student").count(),
            examiners=User.query.filter_by(role="examiner").count(),
            slots=Slot.query.count(),
            bookings=Booking.query.count(),
        )

    return jsonify(cached("stats", ["admin"], TTL_STATS, produce))


@bp.get("/courses")
def list_courses():
    query = Course.query
    search_term = request.args.get("q", "").strip()
    if search_term:
        query = query.filter(
            or_(
                Course.code.ilike(f"%{search_term}%"),
                Course.name.ilike(f"%{search_term}%"),
            )
        )
    courses = query.order_by(Course.id.desc())
    return jsonify(courses=[course_dict(course) for course in courses])


@bp.post("/courses")
def create_course():
    data = request.get_json(silent=True) or {}
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or "").strip()
    if not code or not name:
        return err("Course code and name are required")
    if Course.query.filter_by(code=code).first():
        return err("Course code already exists", 409)
    course = Course(
        code=code,
        name=name,
        description=data.get("description"),
        status=data.get("status", "Active"),
    )
    db.session.add(course)
    db.session.commit()
    return jsonify(course=course_dict(course)), 201


@bp.put("/courses/<int:cid>")
def update_course(cid):
    course = db.session.get(Course, cid)
    if not course:
        return err("Course not found", 404)
    data = request.get_json(silent=True) or {}
    if "code" in data:
        code = (data["code"] or "").strip().upper()
        if not code:
            return err("Course code cannot be empty")
        duplicate = Course.query.filter(
            Course.code == code, Course.id != cid
        ).first()
        if duplicate:
            return err("Course code already exists", 409)
        course.code = code
    if "name" in data:
        if not (data["name"] or "").strip():
            return err("Course name cannot be empty")
        course.name = data["name"].strip()
    if "status" in data:
        if data["status"] not in ("Active", "Inactive"):
            return err("Status must be Active or Inactive")
        course.status = data["status"]
    course.description = data.get("description", course.description)
    db.session.commit()
    return jsonify(course=course_dict(course))


@bp.delete("/courses/<int:cid>")
def delete_course(cid):
    course = db.session.get(Course, cid)
    if not course:
        return err("Course not found", 404)
    if course.exams:
        return err("Course has exams. Set it to Inactive instead.", 409)
    db.session.delete(course)
    db.session.commit()
    return jsonify(message="Deleted")


def fill_exam(exam, data, creating):
    if creating or "course_id" in data:
        if not db.session.get(Course, data.get("course_id") or 0):
            raise ValueError("Invalid course")
        exam.course_id = data["course_id"]
    if creating or "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise ValueError("Exam name is required")
        exam.name = name
    if creating or "exam_type" in data:
        if data.get("exam_type") not in EXAM_TYPES:
            allowed = ", ".join(sorted(EXAM_TYPES))
            raise ValueError(f"Exam type must be one of: {allowed}")
        exam.exam_type = data["exam_type"]
    if creating or "duration" in data:
        exam.duration = pos_int(data.get("duration"), "Duration")
    if creating or "max_marks" in data:
        exam.max_marks = pos_int(data.get("max_marks"), "Maximum marks")
    for field in DT_FIELDS:
        if field in data:
            setattr(exam, field, parse_dt(data[field]))
    if (
        exam.slot_creation_start
        and exam.slot_creation_end
        and exam.slot_creation_end <= exam.slot_creation_start
    ):
        raise ValueError("Slot creation end must be after start")
    if exam.booking_start and exam.booking_end and exam.booking_end <= exam.booking_start:
        raise ValueError("Booking end must be after start")
    if "instructions" in data:
        exam.instructions = data["instructions"]


@bp.get("/exams")
def list_exams():
    query = Exam.query
    search_term = request.args.get("q", "").strip()
    if search_term:
        query = query.filter(Exam.name.ilike(f"%{search_term}%"))
    if request.args.get("course_id"):
        query = query.filter(Exam.course_id == request.args["course_id"])
    if request.args.get("status"):
        query = query.filter(Exam.status == request.args["status"])
    if request.args.get("exam_type"):
        query = query.filter(Exam.exam_type == request.args["exam_type"])
    exams = query.order_by(Exam.id.desc())
    return jsonify(exams=[exam_dict(exam) for exam in exams])


@bp.get("/exams/<int:eid>")
def get_exam(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    return jsonify(exam=exam_dict(exam, detail=True))


@bp.post("/exams")
def create_exam():
    data = request.get_json(silent=True) or {}
    exam = Exam()
    try:
        fill_exam(exam, data, creating=True)
    except ValueError as error:
        return err(str(error))
    db.session.add(exam)
    db.session.commit()
    return jsonify(exam=exam_dict(exam, detail=True)), 201


@bp.put("/exams/<int:eid>")
def update_exam(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    data = request.get_json(silent=True) or {}
    try:
        fill_exam(exam, data, creating=False)
    except ValueError as error:
        db.session.rollback()
        return err(str(error))
    db.session.commit()
    return jsonify(exam=exam_dict(exam, detail=True))


@bp.delete("/exams/<int:eid>")
def delete_exam(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    if Booking.query.filter_by(exam_id=eid).first():
        return err("Exam has bookings and cannot be deleted", 409)
    exam.examiners = []
    db.session.delete(exam)
    db.session.commit()
    return jsonify(message="Deleted")


ACTIONS = {
    "open-slots": ({"Draft", "Closed"}, "Slot Creation"),
    "close-slots": ({"Slot Creation"}, "Closed"),
    "open-booking": ({"Slot Creation", "Closed"}, "Booking Open"),
    "close-booking": ({"Booking Open"}, "Closed"),
    "complete": ({"Closed"}, "Completed"),
}


@bp.post("/exams/<int:eid>/<action>")
def exam_action(eid, action):
    if action not in ACTIONS:
        return err("Unknown action", 404)
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    allowed, new_status = ACTIONS[action]
    if exam.status not in allowed:
        readable_action = action.replace("-", " ")
        return err(
            f"Cannot {readable_action} while status is '{exam.status}'", 409
        )

    if action == "open-slots":
        if not exam.examiners:
            return err("Assign at least one examiner first")
        total = sum(rubric.max_marks for rubric in exam.rubrics)
        if not exam.rubrics or total != exam.max_marks:
            return err(
                f"Rubric marks must add up to {exam.max_marks} (currently {total})"
            )
        if exam.status == "Closed" and Booking.query.filter_by(exam_id=eid).first():
            return err("Bookings already exist; slot creation cannot be reopened", 409)
    if action == "open-booking" and Slot.query.filter_by(exam_id=eid).count() == 0:
        return err("No slots created yet")

    exam.status = new_status
    db.session.commit()
    return jsonify(exam=exam_dict(exam))


@bp.put("/exams/<int:eid>/examiners")
def assign_examiners(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    examiner_ids = (request.get_json(silent=True) or {}).get("examiner_ids")
    if not isinstance(examiner_ids, list):
        return err("examiner_ids must be a list")
    examiners = User.query.filter(
        User.id.in_(examiner_ids), User.role == "examiner", User.is_active.is_(True)
    ).all()
    if len(examiners) != len(set(examiner_ids)):
        return err("One or more examiner ids are invalid or inactive")
    exam.examiners = examiners
    db.session.commit()
    return jsonify(exam=exam_dict(exam, detail=True))


def rubric_editable(exam):
    return exam.status in ("Draft", "Slot Creation")


def read_rubric(data, exam, exclude_id=None, existing=None):
    criterion = (
        data.get("criterion", existing.criterion if existing else "") or ""
    ).strip()
    if not criterion:
        raise ValueError("Criterion name is required")
    max_marks = data.get(
        "max_marks", existing.max_marks if existing else None
    )
    try:
        max_marks = float(max_marks)
    except (ValueError, TypeError):
        raise ValueError("Maximum marks must be a number")
    if max_marks <= 0:
        raise ValueError("Maximum marks must be greater than 0")
    weightage = data.get("weightage", existing.weightage if existing else 1.0)
    try:
        weightage = float(weightage)
    except (ValueError, TypeError):
        raise ValueError("Weightage must be a number")
    if weightage <= 0:
        raise ValueError("Weightage must be greater than 0")
    other_marks = sum(
        rubric.max_marks for rubric in exam.rubrics if rubric.id != exclude_id
    )
    if other_marks + max_marks > exam.max_marks:
        raise ValueError(
            f"Rubric total would exceed exam maximum of {exam.max_marks}"
        )
    return criterion, max_marks, weightage


@bp.get("/exams/<int:eid>/rubrics")
def list_rubrics(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    return jsonify(rubrics=[rubric_dict(rubric) for rubric in exam.rubrics])


@bp.post("/exams/<int:eid>/rubrics")
def create_rubric(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    if not rubric_editable(exam):
        return err("Rubrics cannot be changed once booking has started", 409)
    data = request.get_json(silent=True) or {}
    try:
        criterion, max_marks, weightage = read_rubric(data, exam)
    except ValueError as error:
        return err(str(error))
    rubric = Rubric(
        exam_id=eid,
        criterion=criterion,
        max_marks=max_marks,
        weightage=weightage,
        description=data.get("description"),
    )
    db.session.add(rubric)
    db.session.commit()
    return jsonify(rubric=rubric_dict(rubric)), 201


@bp.put("/rubrics/<int:rid>")
def update_rubric(rid):
    rubric = db.session.get(Rubric, rid)
    if not rubric:
        return err("Rubric not found", 404)
    if not rubric_editable(rubric.exam):
        return err("Rubrics cannot be changed once booking has started", 409)
    data = request.get_json(silent=True) or {}
    try:
        (
            rubric.criterion,
            rubric.max_marks,
            rubric.weightage,
        ) = read_rubric(data, rubric.exam, exclude_id=rid, existing=rubric)
    except ValueError as error:
        return err(str(error))
    rubric.description = data.get("description", rubric.description)
    db.session.commit()
    return jsonify(rubric=rubric_dict(rubric))


@bp.delete("/rubrics/<int:rid>")
def delete_rubric(rid):
    rubric = db.session.get(Rubric, rid)
    if not rubric:
        return err("Rubric not found", 404)
    if not rubric_editable(rubric.exam):
        return err("Rubrics cannot be changed once booking has started", 409)
    db.session.delete(rubric)
    db.session.commit()
    return jsonify(message="Deleted")


@bp.get("/examiners")
def list_examiners():
    query = User.query.filter_by(role="examiner")
    search_term = request.args.get("q", "").strip()
    if search_term:
        query = query.filter(
            or_(User.name.ilike(f"%{search_term}%"), User.email.ilike(f"%{search_term}%"))
        )
    examiners = query.order_by(User.id.desc())
    return jsonify(examiners=[user.to_dict() for user in examiners])


@bp.post("/examiners")
def create_examiner():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if len(name) < 2:
        return err("Name must be at least 2 characters")
    if not EMAIL_RE.match(email):
        return err("Invalid email")
    if len(password) < 6:
        return err("Password must be at least 6 characters")
    if User.query.filter_by(email=email).first():
        return err("Email already registered", 409)
    user = User(name=name, email=email, role="examiner")
    user.set_password(password)
    db.session.add(user)
    db.session.flush()
    db.session.add(
        ExaminerProfile(
            user_id=user.id,
            department=data.get("department"),
            phone=data.get("phone"),
        )
    )
    db.session.commit()
    return jsonify(examiner=user.to_dict()), 201


@bp.put("/examiners/<int:uid>")
def update_examiner(uid):
    user = db.session.get(User, uid)
    if not user or user.role != "examiner":
        return err("Examiner not found", 404)
    data = request.get_json(silent=True) or {}
    if "name" in data:
        if len((data["name"] or "").strip()) < 2:
            return err("Name must be at least 2 characters")
        user.name = data["name"].strip()
    if data.get("password"):
        if len(data["password"]) < 6:
            return err("Password must be at least 6 characters")
        user.set_password(data["password"])
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
    profile = user.examiner_profile or ExaminerProfile(user_id=user.id)
    profile.department = data.get("department", profile.department)
    profile.phone = data.get("phone", profile.phone)
    db.session.add(profile)
    db.session.commit()
    return jsonify(examiner=user.to_dict())


@bp.delete("/examiners/<int:uid>")
def delete_examiner(uid):
    user = db.session.get(User, uid)
    if not user or user.role != "examiner":
        return err("Examiner not found", 404)
    if Slot.query.filter_by(examiner_id=uid).first():
        return err("Examiner has slots. Deactivate instead (is_active=false).", 409)
    user.assigned_exams = []
    if user.examiner_profile:
        db.session.delete(user.examiner_profile)
    db.session.delete(user)
    db.session.commit()
    return jsonify(message="Deleted")


@bp.get("/students")
def list_students():
    query = User.query.filter_by(role="student")
    search_term = request.args.get("q", "").strip()
    if search_term:
        query = query.filter(
            or_(User.name.ilike(f"%{search_term}%"), User.email.ilike(f"%{search_term}%"))
        )
    students = query.order_by(User.id.desc())
    return jsonify(students=[user.to_dict() for user in students])


@bp.put("/students/<int:uid>")
def update_student(uid):
    user = db.session.get(User, uid)
    if not user or user.role != "student":
        return err("Student not found", 404)
    data = request.get_json(silent=True) or {}
    if "is_active" in data:
        user.is_active = bool(data["is_active"])
    db.session.commit()
    return jsonify(student=user.to_dict())


@bp.get("/search")
def search():
    search_term = request.args.get("q", "").strip()
    kind = request.args.get("type", "all")
    if not search_term:
        return err("Query 'q' is required")
    like = f"%{search_term}%"
    results = {}
    if kind in ("all", "students"):
        results["students"] = [
            user.to_dict()
            for user in User.query.filter(
                User.role == "student",
                or_(User.name.ilike(like), User.email.ilike(like)),
            ).limit(20)
        ]
    if kind in ("all", "examiners"):
        results["examiners"] = [
            user.to_dict()
            for user in User.query.filter(
                User.role == "examiner",
                or_(User.name.ilike(like), User.email.ilike(like)),
            ).limit(20)
        ]
    if kind in ("all", "exams"):
        results["exams"] = [
            exam_dict(exam)
            for exam in Exam.query.filter(Exam.name.ilike(like)).limit(20)
        ]
    if kind in ("all", "bookings"):
        bookings = (
            Booking.query.join(User, Booking.student_id == User.id)
            .join(Exam, Booking.exam_id == Exam.id)
            .filter(
                or_(
                    User.name.ilike(like),
                    User.email.ilike(like),
                    Exam.name.ilike(like),
                )
            )
            .limit(20)
        )
        results["bookings"] = [
            dict(
                id=booking.id,
                student=booking.student.name,
                exam=booking.exam.name,
                status=booking.status,
                slot_id=booking.slot_id,
            )
            for booking in bookings
        ]
    return jsonify(results)


def hm(value):
    return value.strftime("%H:%M")


def slot_dict(slot):
    return dict(
        id=slot.id,
        exam_id=slot.exam_id,
        exam=slot.exam.name,
        examiner_id=slot.examiner_id,
        examiner=slot.examiner.name,
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
    evaluation = booking.evaluation
    return dict(
        id=booking.id,
        status=booking.status,
        booking_date=iso(booking.booking_date),
        student_id=booking.student_id,
        student=booking.student.name,
        email=booking.student.email,
        exam_id=booking.exam_id,
        exam=booking.exam.name,
        slot_id=booking.slot_id,
        examiner=booking.slot.examiner.name,
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


@bp.get("/slots")
def list_slots():
    query = Slot.query
    for argument, column in (
        ("exam_id", Slot.exam_id),
        ("examiner_id", Slot.examiner_id),
        ("status", Slot.status),
    ):
        if request.args.get(argument):
            query = query.filter(column == request.args[argument])
    slots = query.order_by(Slot.date, Slot.start_time)
    return jsonify(slots=[slot_dict(slot) for slot in slots])


@bp.get("/bookings")
def list_bookings():
    query = Booking.query
    for argument, column in (
        ("exam_id", Booking.exam_id),
        ("student_id", Booking.student_id),
        ("status", Booking.status),
        ("slot_id", Booking.slot_id),
    ):
        if request.args.get(argument):
            query = query.filter(column == request.args[argument])
    bookings = query.order_by(Booking.id.desc())
    return jsonify(bookings=[booking_dict(booking) for booking in bookings])


@bp.post("/bookings/<int:bid>/reschedule")
def reschedule(bid):
    booking = db.session.get(Booking, bid)
    if not booking:
        return err("Booking not found", 404)
    if booking.status != "Booked":
        return err(f"Cannot reschedule a booking that is {booking.status}", 409)
    if booking.exam.status not in ("Booking Open", "Closed") or booking.exam.results_published:
        return err("This exam no longer allows rescheduling", 409)

    data = request.get_json(silent=True) or {}
    new_slot = db.session.get(Slot, data.get("slot_id") or 0)
    if not new_slot:
        return err("Target slot not found", 404)
    if new_slot.id == booking.slot_id:
        return err("Booking is already in this slot")
    if new_slot.exam_id != booking.exam_id:
        return err("Target slot belongs to a different exam")
    if new_slot.status != "Available":
        return err("Target slot is not available", 409)

    old_slot = booking.slot
    got = (
        Slot.query.filter(
            Slot.id == new_slot.id,
            Slot.available_seats > 0,
            Slot.status == "Available",
        )
        .update(
            {"available_seats": Slot.available_seats - 1},
            synchronize_session=False,
        )
    )
    if got == 0:
        db.session.rollback()
        return err("Target slot is full", 409)
    Slot.query.filter(Slot.id == old_slot.id).update(
        {"available_seats": Slot.available_seats + 1},
        synchronize_session=False,
    )
    booking.slot_id = new_slot.id
    db.session.flush()
    db.session.refresh(old_slot)
    db.session.refresh(new_slot)
    if new_slot.available_seats == 0:
        new_slot.status = "Full"
    if old_slot.status == "Full" and old_slot.available_seats > 0:
        old_slot.status = "Available"
    db.session.commit()
    return jsonify(booking=booking_dict(booking), message="Booking rescheduled")


@bp.put("/slots/<int:sid>/examiner")
def reassign_slot_examiner(sid):
    slot = db.session.get(Slot, sid)
    if not slot:
        return err("Slot not found", 404)
    if slot.status in ("Completed", "Cancelled"):
        return err(f"Cannot change examiner of a {slot.status} slot", 409)
    data = request.get_json(silent=True) or {}
    examiner = db.session.get(User, data.get("examiner_id") or 0)
    if not examiner or examiner.role != "examiner" or not examiner.is_active:
        return err("Invalid or inactive examiner")
    if examiner.id == slot.examiner_id:
        return err("Slot already belongs to this examiner")
    if examiner not in slot.exam.examiners:
        return err("Examiner is not assigned to this exam")
    if overlaps(examiner.id, slot.date, slot.start_time, slot.end_time):
        return err("New examiner has an overlapping slot", 409)
    slot.examiner_id = examiner.id
    db.session.commit()
    return jsonify(slot=slot_dict(slot), message="Examiner changed")


@bp.get("/exams/<int:eid>/results")
def exam_results(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    evaluations = Evaluation.query.join(Booking).filter(Booking.exam_id == eid).all()
    return jsonify(
        exam=exam.name,
        max_marks=exam.max_marks,
        results_published=exam.results_published,
        results=[
            dict(
                booking_id=evaluation.booking_id,
                student=evaluation.booking.student.name,
                examiner=db.session.get(User, evaluation.examiner_id).name,
                total_marks=evaluation.total_marks,
                remarks=evaluation.remarks,
                status=evaluation.status,
                evaluated_on=iso(evaluation.evaluation_date),
            )
            for evaluation in evaluations
        ],
    )


@bp.post("/exams/<int:eid>/publish-results")
def publish_results(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    if exam.results_published:
        return err("Results already published", 409)
    if exam.status not in ("Closed", "Completed"):
        return err("Close booking before publishing results", 409)
    pending = Booking.query.filter_by(exam_id=eid, status="Booked").count()
    if pending:
        return err(f"{pending} evaluation(s) still pending", 409)
    if not Booking.query.filter_by(exam_id=eid, status="Completed").first():
        return err("No evaluated bookings to publish", 409)
    exam.results_published = True
    db.session.commit()
    return jsonify(exam=exam_dict(exam), message="Results published")


@bp.post("/exams/<int:eid>/unpublish-results")
def unpublish_results(eid):
    exam = db.session.get(Exam, eid)
    if not exam:
        return err("Exam not found", 404)
    if not exam.results_published:
        return err("Results are not published", 409)
    exam.results_published = False
    db.session.commit()
    return jsonify(exam=exam_dict(exam), message="Results unpublished")


@bp.post("/jobs/monthly-report")
def run_monthly_report():
    from ..tasks import send_monthly_report

    data = request.get_json(silent=True) or {}
    try:
        year = int(data["year"]) if data.get("year") else None
        month = int(data["month"]) if data.get("month") else None
        if month is not None and not 1 <= month <= 12:
            raise ValueError
    except (ValueError, TypeError):
        return err("year and month must be valid numbers")
    send_monthly_report.delay(year, month)
    return jsonify(message="Monthly report queued"), 202


@bp.post("/jobs/daily-reminders")
def run_daily_reminders():
    from ..tasks import send_daily_reminders

    send_daily_reminders.delay()
    return jsonify(message="Reminder job queued"), 202
