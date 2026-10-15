import csv
import logging
import os
from datetime import date, datetime, timedelta

from flask import current_app, render_template_string
from sqlalchemy import func

from .celery_app import celery
from .extensions import db
from .mailer import post_gchat, send_email
from .models import Booking, Evaluation, ExportJob, Notification, Slot, User

log = logging.getLogger(__name__)


@celery.task(name="examzhub.ping")
def ping():
	return "pong"


REMINDER_HTML = """
<div style="font-family:Arial,sans-serif;max-width:520px">
<h2 style="color:#0d6efd">ExamZHub exam reminder</h2>
<p>Hi {{ name }}, your exam is <b>{{ when }}</b>.</p>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td><b>Examination</b></td><td>{{ exam }} ({{ course }})</td></tr>
<tr><td><b>Date &amp; time</b></td><td>{{ day }}, {{ start }} - {{ end }}</td></tr>
<tr><td><b>Examiner</b></td><td>{{ examiner }}</td></tr>
{% if link %}<tr><td><b>Meeting link</b></td><td>{{ link }}</td></tr>{% endif %}
</table>
<p><b>Instructions:</b> {{ instructions or 'No special instructions.' }}</p>
</div>"""


@celery.task(name="examzhub.daily_reminders")
def send_daily_reminders():
	now = datetime.now()
	today = now.date()
	tomorrow = today + timedelta(days=1)
	rows = (
		Booking.query.join(Slot, Slot.id == Booking.slot_id)
		.filter(Booking.status == "Booked", Slot.date.in_([today, tomorrow]))
		.all()
	)
	sent = 0
	failed = 0
	for booking in rows:
		slot, exam = booking.slot, booking.exam
		if slot.date == today and slot.start_time < now.time():
			continue
		context = dict(
			name=booking.student.name,
			when="today" if slot.date == today else "tomorrow",
			exam=exam.name,
			course=exam.course.name,
			day=slot.date.isoformat(),
			start=slot.start_time.strftime("%H:%M"),
			end=slot.end_time.strftime("%H:%M"),
			examiner=slot.examiner.name,
			link=slot.meeting_link,
			instructions=exam.instructions,
		)
		try:
			send_email(
				booking.student.email,
				f"Reminder: {exam.name} {context['when']}",
				render_template_string(REMINDER_HTML, **context),
			)
			post_gchat(
				f"*Exam reminder* for {context['name']}: {exam.name} "
				f"({context['course']}) {context['when']} {context['day']} "
				f"{context['start']}-{context['end']} with {context['examiner']}. "
				f"{exam.instructions or ''}"
			)
			sent += 1
		except Exception:
			log.exception("Reminder failed for booking %s", booking.id)
			failed += 1
	return dict(sent=sent, failed=failed)


REPORT_HTML = """
<div style="font-family:Arial,sans-serif;max-width:620px">
<h2 style="color:#0d6efd">ExamZHub monthly examination report: {{ label }}</h2>
<table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
<tr><td>Examinations conducted</td><td><b>{{ conducted }}</b></td></tr>
<tr><td>Students evaluated</td><td><b>{{ evaluated }}</b></td></tr>
<tr><td>Completed bookings</td><td><b>{{ completed }}</b></td></tr>
<tr><td>Pending evaluations</td><td><b>{{ pending }}</b></td></tr>
</table>
<h3>Most active examiners</h3>
{% if top %}
<table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
<tr><th align="left">Examiner</th><th align="left">Evaluations</th></tr>
{% for name, count in top %}<tr><td>{{ name }}</td><td>{{ count }}</td></tr>{% endfor %}
</table>
{% else %}<p>No evaluations this month.</p>{% endif %}
</div>"""


@celery.task(name="examzhub.monthly_report")
def send_monthly_report(year=None, month=None):
	if not year or not month:
		previous_month = date.today().replace(day=1) - timedelta(days=1)
		year, month = previous_month.year, previous_month.month
	start = date(year, month, 1)
	end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
	in_month = (Slot.date >= start) & (Slot.date < end)

	conducted = (
		db.session.query(func.count(func.distinct(Booking.exam_id)))
		.select_from(Booking)
		.join(Slot, Slot.id == Booking.slot_id)
		.filter(Booking.status == "Completed", in_month)
		.scalar()
	)
	evaluated = (
		db.session.query(func.count(func.distinct(Evaluation.student_id)))
		.select_from(Evaluation)
		.join(Booking, Booking.id == Evaluation.booking_id)
		.join(Slot, Slot.id == Booking.slot_id)
		.filter(Evaluation.status == "Submitted", in_month)
		.scalar()
	)
	completed = (
		db.session.query(func.count(Booking.id))
		.select_from(Booking)
		.join(Slot, Slot.id == Booking.slot_id)
		.filter(Booking.status == "Completed", in_month)
		.scalar()
	)
	pending = (
		db.session.query(func.count(Booking.id))
		.select_from(Booking)
		.join(Slot, Slot.id == Booking.slot_id)
		.filter(Booking.status == "Booked", Slot.date < end)
		.scalar()
	)
	top = (
		db.session.query(User.name, func.count(Evaluation.id))
		.select_from(Evaluation)
		.join(User, User.id == Evaluation.examiner_id)
		.join(Booking, Booking.id == Evaluation.booking_id)
		.join(Slot, Slot.id == Booking.slot_id)
		.filter(Evaluation.status == "Submitted", in_month)
		.group_by(User.id, User.name)
		.order_by(func.count(Evaluation.id).desc())
		.limit(5)
		.all()
	)
	html = render_template_string(
		REPORT_HTML,
		label=start.strftime("%B %Y"),
		conducted=conducted or 0,
		evaluated=evaluated or 0,
		completed=completed or 0,
		pending=pending or 0,
		top=[(name, count) for name, count in top],
	)
	admin = User.query.filter_by(role="admin").first()
	if admin:
		send_email(admin.email, f"ExamZHub report: {start:%B %Y}", html)
	return dict(
		month=f"{year}-{month:02d}",
		conducted=conducted or 0,
		evaluated=evaluated or 0,
		completed=completed or 0,
		pending=pending or 0,
	)


@celery.task(name="examzhub.export_history")
def export_history_csv(job_id):
	job = db.session.get(ExportJob, job_id)
	if not job:
		return "missing job"
	job.status = "Processing"
	db.session.commit()
	user_id = job.user_id
	try:
		user = db.session.get(User, user_id)
		bookings = Booking.query.filter_by(student_id=user_id).order_by(Booking.id).all()
		folder = os.path.join(current_app.instance_path, "exports")
		os.makedirs(folder, exist_ok=True)
		path = os.path.join(folder, f"history_{user_id}_{job_id}.csv")
		with open(path, "w", newline="", encoding="utf-8") as output:
			writer = csv.writer(output)
			writer.writerow(
				[
					"Student ID",
					"Examination Name",
					"Course",
					"Examination Date",
					"Examiner",
					"Marks Obtained",
					"Booking Status",
				]
			)
			for booking in bookings:
				evaluation = booking.evaluation
				marks = (
					evaluation.total_marks
					if evaluation
					and evaluation.status == "Submitted"
					and booking.exam.results_published
					else ""
				)
				writer.writerow(
					[
						user_id,
						booking.exam.name,
						booking.exam.course.name,
						booking.slot.date.isoformat(),
						booking.slot.examiner.name,
						marks,
						booking.status,
					]
				)
		job.status = "Done"
		job.file_path = path
		job.completed_at = datetime.utcnow()
		db.session.add(
			Notification(
				user_id=user_id,
				kind="export",
				message="Your examination history export is ready.",
				link=f"/api/student/export/{job_id}/download",
			)
		)
		db.session.commit()
		send_email(
			user.email,
			"Your ExamZHub export is ready",
			f"<p>Hi {user.name}, your examination history CSV "
			f"({len(bookings)} record(s)) is ready. Download it from your dashboard.</p>",
		)
		return dict(job=job_id, rows=len(bookings))
	except Exception as error:
		db.session.rollback()
		job = db.session.get(ExportJob, job_id)
		if job:
			job.status = "Failed"
			job.error = str(error)[:250]
			db.session.add(
				Notification(
					user_id=user_id,
					kind="export",
					message="Your examination history export failed.",
				)
			)
			db.session.commit()
		log.exception("Export %s failed", job_id)
		return dict(job=job_id, error=str(error))
