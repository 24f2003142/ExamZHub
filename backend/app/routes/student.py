import os
from datetime import date, datetime, timedelta

from flask import (
    Blueprint,
    Response,
    current_app,
    jsonify,
    request,
    render_template_string,
    send_file,
)
from flask_jwt_extended import verify_jwt_in_request
from sqlalchemy import or_

from ..extensions import db
from ..models import Booking, Course, Exam, ExaminerAllocation, ExportJob, Notification, Slot
from ..tasks import export_history_csv
from ..utils import current_user
from ..cache_utils import TTL_EXAM, TTL_LIST, TTL_RUBRIC, cached

bp = Blueprint("student", __name__, url_prefix="/api/student")


@bp.before_request
def student_guard():
    if request.method == "OPTIONS":
        return None
    verify_jwt_in_request()
    user = current_user()
    if not user or not user.is_active:
        return jsonify(error="Account disabled or not found"), 401
    if user.role != "student":
        return jsonify(error="Forbidden"), 403


def err(msg, code=400):
    return jsonify(error=msg), code


def hm(value):
    return value.strftime("%H:%M")


def iso(value):
    return value.isoformat() if value else None


def in_window(start, end):
    if not current_app.config.get("ENFORCE_DATE_WINDOWS"):
        return True
    now = datetime.now()
    return (not start or now >= start) and (not end or now <= end)


def active_booking(user_id, exam_id):
    return Booking.query.filter(
        Booking.student_id == user_id,
        Booking.exam_id == exam_id,
        Booking.status.in_(["Booked", "Completed"]),
    ).first()


def active_examiner_booking(user_id, exam_id, examiner_id):
    return (
        Booking.query.join(Slot)
        .filter(
            Booking.student_id == user_id,
            Booking.exam_id == exam_id,
            Slot.examiner_id == examiner_id,
            Booking.status.in_(["Booked", "Completed"]),
        )
        .first()
    )


def eligible_for(user, exam):
    profile = user.student_profile
    return bool(
        profile
        and profile.department_id
        and profile.year
        and profile.semester
        and exam.department_id == profile.department_id
        and exam.year == profile.year
        and exam.semester == profile.semester
    )


def result_limit(booking):
    allocation = ExaminerAllocation.query.filter_by(
        exam_id=booking.exam_id, examiner_id=booking.slot.examiner_id
    ).first()
    return allocation.max_marks if allocation else booking.exam.max_marks


def exam_base(exam):
    available_seats = sum(
        slot.available_seats for slot in exam.slots if slot.status == "Available"
    )
    return dict(
        id=exam.id,
        name=exam.name,
        course=exam.course.name,
        course_code=exam.course.code,
        department_id=exam.department_id,
        department=exam.department.name if exam.department else None,
        year=exam.year,
        semester=exam.semester,
        exam_type=exam.exam_type,
        duration=exam.duration,
        max_marks=exam.max_marks,
        status=exam.status,
        instructions=exam.instructions,
        booking_start=iso(exam.booking_start),
        booking_end=iso(exam.booking_end),
        available_seats=available_seats,
    )


def booked_exam_ids(user_id):
    bookings = Booking.query.filter(
        Booking.student_id == user_id,
        Booking.status.in_(["Booked", "Completed"]),
    ).all()
    return {booking.exam_id for booking in bookings}


def slots_for(exam_id):
    slots = Slot.query.filter(
        Slot.exam_id == exam_id,
        Slot.status == "Available",
        Slot.date >= date.today(),
    ).order_by(Slot.date, Slot.start_time)
    return [
        dict(
            id=slot.id,
            examiner_id=slot.examiner_id,
            date=slot.date.isoformat(),
            start_time=hm(slot.start_time),
            end_time=hm(slot.end_time),
            examiner=slot.examiner.name,
            capacity=slot.capacity,
            available_seats=slot.available_seats,
        )
        for slot in slots
    ]


def rubrics_for(exam_id):
    exam = db.session.get(Exam, exam_id)
    return [
        dict(
            criterion=rubric.criterion,
            max_marks=rubric.max_marks,
            description=rubric.description,
        )
        for rubric in exam.rubrics
    ]


def result_dict(booking):
    evaluation = booking.evaluation
    if not (
        booking.exam.results_published
        and evaluation
        and evaluation.status == "Submitted"
    ):
        return None
    return dict(
        total_marks=evaluation.total_marks,
        max_marks=result_limit(booking),
        remarks=evaluation.remarks,
        examiner=booking.slot.examiner.name,
        evaluated_on=iso(evaluation.evaluation_date),
        breakdown=[
            dict(criterion=score.rubric.criterion, marks=score.marks)
            for score in evaluation.scores
        ],
    )


def booking_dict(booking):
    slot = booking.slot
    exam = booking.exam
    return dict(
        id=booking.id,
        status=booking.status,
        booking_date=iso(booking.booking_date),
        exam_id=exam.id,
        exam=exam.name,
        course=exam.course.name,
        exam_type=exam.exam_type,
        exam_status=exam.status,
        slot_id=slot.id,
        date=slot.date.isoformat(),
        start_time=hm(slot.start_time),
        end_time=hm(slot.end_time),
        examiner=slot.examiner.name,
        meeting_link=slot.meeting_link,
        instructions=exam.instructions,
        can_cancel=(
            booking.status == "Booked"
            and exam.status == "Booking Open"
            and in_window(None, exam.booking_end)
        ),
        result=result_dict(booking),
    )


@bp.get("/dashboard")
def dashboard():
    user = current_user()
    mine = Booking.query.filter_by(student_id=user.id)
    booked = mine.filter(Booking.status == "Booked").all()
    completed = mine.filter(Booking.status == "Completed").all()
    upcoming = [booking for booking in booked if booking.slot.date >= date.today()]
    return jsonify(
        available_exams=Exam.query.filter_by(status="Booking Open").count(),
        available_slots=Slot.query.join(Exam)
        .filter(
            Exam.status == "Booking Open",
            Slot.status == "Available",
            Slot.date >= date.today(),
        )
        .count(),
        upcoming=[
            booking_dict(booking)
            for booking in sorted(
                upcoming, key=lambda item: (item.slot.date, item.slot.start_time)
            )
        ],
        booked_slots=len(booked),
        published_results=[
            booking_dict(booking)
            for booking in completed
            if result_dict(booking)
        ],
    )


@bp.get("/exams")
def list_exams():
    user = current_user()
    args = {
        key: request.args.get(key, "").strip()
        for key in ("q", "course_id", "exam_type", "status", "available")
    }

    def produce():
        query = Exam.query.join(Course).filter(Exam.status != "Draft")
        profile = user.student_profile
        if not profile:
            return []
        query = query.filter(
            Exam.department_id == profile.department_id,
            Exam.year == profile.year,
            Exam.semester == profile.semester,
        )
        if args["q"]:
            like = f"%{args['q']}%"
            query = query.filter(
                or_(
                    Exam.name.ilike(like),
                    Course.name.ilike(like),
                    Course.code.ilike(like),
                )
            )
        if args["course_id"]:
            query = query.filter(Exam.course_id == args["course_id"])
        if args["exam_type"]:
            query = query.filter(Exam.exam_type == args["exam_type"])
        if args["status"]:
            query = query.filter(Exam.status == args["status"])
        if args["available"] == "1":
            query = query.filter(Exam.status == "Booking Open")
        return [exam_base(exam) for exam in query.order_by(Exam.id.desc())]

    profile = user.student_profile
    rows = cached(
        "exams",
        ["list", args, profile.department_id if profile else None, profile.year if profile else None, profile.semester if profile else None],
        TTL_LIST,
        produce,
    )
    booked_ids = booked_exam_ids(user.id)
    return jsonify(
        exams=[{**row, "already_booked": row["id"] in booked_ids} for row in rows]
    )


@bp.get("/exams/<int:eid>")
def get_exam(eid):
    user = current_user()
    exam = db.session.get(Exam, eid)
    if not exam or exam.status == "Draft" or not eligible_for(user, exam):
        return err("Exam not found", 404)
    data = dict(cached("exams", ["detail", eid], TTL_EXAM, lambda: exam_base(exam)))
    data["already_booked"] = eid in booked_exam_ids(user.id)
    data["slots"] = cached(
        "schedule",
        ["slots", eid, date.today().isoformat()],
        TTL_LIST,
        lambda: slots_for(eid),
    )
    booked_examiners = {
        slot.examiner_id
        for slot in Slot.query.filter_by(exam_id=eid).all()
        if active_examiner_booking(user.id, eid, slot.examiner_id)
    }
    data["slots"] = [
        {**slot, "already_booked": slot["examiner_id"] in booked_examiners}
        for slot in data["slots"]
    ]
    data["rubrics"] = cached(
        "rubrics", ["exam", eid], TTL_RUBRIC, lambda: rubrics_for(eid)
    )
    return jsonify(exam=data)


@bp.post("/bookings")
def book():
    user = current_user()
    data = request.get_json(silent=True) or {}
    slot = db.session.get(Slot, data.get("slot_id") or 0)
    if not slot:
        return err("Slot not found", 404)
    exam = slot.exam
    if not eligible_for(user, exam):
        return err("This exam is not available for your department, year, or semester", 403)
    if exam.status != "Booking Open" or not in_window(
        exam.booking_start, exam.booking_end
    ):
        return err("Booking is not open for this exam", 409)
    if slot.status in ("Cancelled", "Completed") or slot.date < date.today():
        return err("This slot is not available", 409)
    if active_examiner_booking(user.id, exam.id, slot.examiner_id):
        return err("You already have a booking with this examiner for this exam", 409)

    got = (
        Slot.query.filter(
            Slot.id == slot.id,
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
        return err("Slot is full", 409)
    db.session.refresh(slot)
    if slot.available_seats == 0:
        slot.status = "Full"
    booking = Booking(
        student_id=user.id,
        slot_id=slot.id,
        exam_id=exam.id,
        status="Booked",
    )
    db.session.add(booking)
    db.session.commit()
    return jsonify(booking=booking_dict(booking), message="Slot booked"), 201


@bp.delete("/bookings/<int:bid>")
def cancel(bid):
    user = current_user()
    booking = db.session.get(Booking, bid)
    if not booking or booking.student_id != user.id:
        return err("Booking not found", 404)
    if booking.status != "Booked":
        return err(f"Cannot cancel a booking that is {booking.status}", 409)
    if booking.exam.status != "Booking Open" or not in_window(
        None, booking.exam.booking_end
    ):
        return err("Cancellation deadline has passed", 409)

    Slot.query.filter(Slot.id == booking.slot_id).update(
        {"available_seats": Slot.available_seats + 1},
        synchronize_session=False,
    )
    booking.status = "Cancelled"
    db.session.flush()
    db.session.refresh(booking.slot)
    if booking.slot.status == "Full" and booking.slot.available_seats > 0:
        booking.slot.status = "Available"
    db.session.commit()
    return jsonify(message="Booking cancelled")


@bp.get("/bookings")
def history():
    user = current_user()
    query = Booking.query.filter_by(student_id=user.id)
    if request.args.get("status"):
        query = query.filter(Booking.status == request.args["status"])
    bookings = query.order_by(Booking.id.desc())
    return jsonify(bookings=[booking_dict(booking) for booking in bookings])


@bp.get("/results")
def results():
    user = current_user()
    rows = Booking.query.filter_by(
        student_id=user.id, status="Completed"
    ).order_by(Booking.id.desc())
    return jsonify(results=[booking_dict(booking) for booking in rows if result_dict(booking)])


SCORECARD_HTML = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scorecard</title>
<style>body{font-family:Arial,sans-serif;max-width:680px;margin:30px auto;color:#222}
h1{color:#0d6efd;margin-bottom:0}table{border-collapse:collapse;width:100%;margin:16px 0}
td,th{border:1px solid #ccc;padding:8px;text-align:left}.total{font-size:22px}
.btn{padding:8px 16px;background:#0d6efd;color:#fff;border:0;border-radius:4px;cursor:pointer}
@media print{.btn{display:none}}</style></head><body>
<h1>ExamZHub</h1><p>Examination Scorecard</p>
<table><tr><th>Student</th><td>{{ name }}</td><th>Roll no</th><td>{{ roll or '-' }}</td></tr>
<tr><th>Examination</th><td>{{ exam }}</td><th>Course</th><td>{{ course }}</td></tr>
<tr><th>Date</th><td>{{ date }}</td><th>Examiner</th><td>{{ examiner }}</td></tr></table>
<table><tr><th>Criterion</th><th>Marks obtained</th><th>Maximum</th></tr>
{% for criterion, marks, maximum in rows %}<tr><td>{{ criterion }}</td><td>{{ marks }}</td><td>{{ maximum }}</td></tr>{% endfor %}</table>
<p class="total">Total: <b>{{ total }}</b> / {{ max_marks }} ({{ pct }}%)</p>
<p><b>Examiner remarks:</b> {{ remarks or 'None' }}</p>
<button class="btn" onclick="window.print()">Print / Save as PDF</button></body></html>"""


@bp.get("/bookings/<int:bid>/scorecard")
def scorecard(bid):
    user = current_user()
    booking = db.session.get(Booking, bid)
    if not booking or booking.student_id != user.id:
        return err("Booking not found", 404)
    evaluation = booking.evaluation
    if not (
        booking.exam.results_published
        and evaluation
        and evaluation.status == "Submitted"
    ):
        return err("Result is not published yet", 409)
    profile = user.student_profile
    html = render_template_string(
        SCORECARD_HTML,
        name=user.name,
        roll=profile.roll_no if profile else None,
        exam=booking.exam.name,
        course=booking.exam.course.name,
        date=booking.slot.date.isoformat(),
        examiner=booking.slot.examiner.name,
        rows=[
            (
                score.rubric.criterion,
                f"{score.marks:g}",
                f"{score.rubric.max_marks:g}",
            )
            for score in evaluation.scores
        ],
        total=f"{evaluation.total_marks:g}",
        max_marks=result_limit(booking),
        pct=round(evaluation.total_marks / result_limit(booking) * 100, 1),
        remarks=evaluation.remarks,
    )
    return Response(
        html,
        mimetype="text/html",
        headers={"Content-Disposition": f'attachment; filename="scorecard_{booking.id}.html"'},
    )


def job_dict(job):
    return dict(
        id=job.id,
        status=job.status,
        error=job.error,
        created_at=iso(job.created_at),
        completed_at=iso(job.completed_at),
        download=f"/api/student/export/{job.id}/download"
        if job.status == "Done"
        else None,
    )


@bp.post("/export")
def start_export():
    user = current_user()
    recent = datetime.utcnow() - timedelta(minutes=5)
    running = ExportJob.query.filter(
        ExportJob.user_id == user.id,
        ExportJob.status.in_(["Pending", "Processing"]),
        ExportJob.created_at > recent,
    ).first()
    if running:
        return jsonify(
            job=job_dict(running), message="An export is already in progress"
        ), 202
    job = ExportJob(user_id=user.id)
    db.session.add(job)
    db.session.commit()
    try:
        export_history_csv.delay(job.id)
    except Exception:
        job.status = "Failed"
        job.error = "Job queue unavailable"
        db.session.commit()
        return err("Could not queue the export. Try again shortly.", 503)
    return jsonify(
        job=job_dict(job),
        message="Export started. You will be notified when it is ready.",
    ), 202


@bp.get("/export/<int:jid>")
def export_status(jid):
    job = db.session.get(ExportJob, jid)
    if not job or job.user_id != current_user().id:
        return err("Export not found", 404)
    return jsonify(job=job_dict(job))


@bp.get("/export/<int:jid>/download")
def export_download(jid):
    job = db.session.get(ExportJob, jid)
    if not job or job.user_id != current_user().id:
        return err("Export not found", 404)
    if job.status != "Done" or not job.file_path or not os.path.exists(job.file_path):
        return err("Export is not ready", 409)
    return send_file(
        job.file_path,
        as_attachment=True,
        download_name="examination_history.csv",
        mimetype="text/csv",
    )


@bp.get("/notifications")
def notifications():
    user = current_user()
    rows = (
        Notification.query.filter_by(user_id=user.id)
        .order_by(Notification.id.desc())
        .limit(20)
        .all()
    )
    unread = Notification.query.filter_by(user_id=user.id, is_read=False).count()
    return jsonify(
        unread=unread,
        notifications=[
            dict(
                id=notification.id,
                kind=notification.kind,
                message=notification.message,
                link=notification.link,
                is_read=notification.is_read,
                created_at=iso(notification.created_at),
            )
            for notification in rows
        ],
    )


@bp.post("/notifications/read")
def mark_read():
    Notification.query.filter_by(
        user_id=current_user().id, is_read=False
    ).update({"is_read": True})
    db.session.commit()
    return jsonify(message="Marked as read")
