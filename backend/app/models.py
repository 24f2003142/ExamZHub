from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


class User(db.Model):
	__tablename__ = "users"

	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(100), nullable=False)
	email = db.Column(db.String(120), unique=True, nullable=False, index=True)
	password_hash = db.Column(db.String(255), nullable=False)
	role = db.Column(db.String(20), nullable=False)
	is_active = db.Column(db.Boolean, default=True)
	created_at = db.Column(db.DateTime, default=datetime.utcnow)

	examiner_profile = db.relationship("ExaminerProfile", backref="user", uselist=False)
	student_profile = db.relationship("StudentProfile", backref="user", uselist=False)

	def set_password(self, password):
		self.password_hash = generate_password_hash(password)

	def check_password(self, password):
		return check_password_hash(self.password_hash, password)

	def to_dict(self):
		data = {
			"id": self.id,
			"name": self.name,
			"email": self.email,
			"role": self.role,
			"is_active": self.is_active,
		}
		if self.role == "student" and self.student_profile:
			data.update(roll_no=self.student_profile.roll_no, phone=self.student_profile.phone)
		if self.role == "examiner" and self.examiner_profile:
			data.update(
				department=self.examiner_profile.department,
				phone=self.examiner_profile.phone,
			)
		return data


class ExaminerProfile(db.Model):
	__tablename__ = "examiner_profiles"

	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
	department = db.Column(db.String(100))
	phone = db.Column(db.String(20))


class StudentProfile(db.Model):
	__tablename__ = "student_profiles"

	id = db.Column(db.Integer, primary_key=True)
	user_id = db.Column(db.Integer, db.ForeignKey("users.id"), unique=True, nullable=False)
	roll_no = db.Column(db.String(50))
	phone = db.Column(db.String(20))


class Course(db.Model):
	__tablename__ = "courses"

	id = db.Column(db.Integer, primary_key=True)
	code = db.Column(db.String(20), unique=True, nullable=False)
	name = db.Column(db.String(150), nullable=False)
	description = db.Column(db.Text)
	status = db.Column(db.String(20), default="Active")
	exams = db.relationship("Exam", backref="course")


exam_examiners = db.Table(
	"exam_examiners",
	db.Column("exam_id", db.Integer, db.ForeignKey("exams.id"), primary_key=True),
	db.Column("examiner_id", db.Integer, db.ForeignKey("users.id"), primary_key=True),
)


class Exam(db.Model):
	__tablename__ = "exams"

	id = db.Column(db.Integer, primary_key=True)
	course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False)
	name = db.Column(db.String(150), nullable=False)
	exam_type = db.Column(db.String(30), nullable=False)
	duration = db.Column(db.Integer, nullable=False)
	max_marks = db.Column(db.Integer, nullable=False)
	slot_creation_start = db.Column(db.DateTime)
	slot_creation_end = db.Column(db.DateTime)
	booking_start = db.Column(db.DateTime)
	booking_end = db.Column(db.DateTime)
	status = db.Column(db.String(20), default="Draft")
	instructions = db.Column(db.Text)
	results_published = db.Column(db.Boolean, default=False)
	created_at = db.Column(db.DateTime, default=datetime.utcnow)

	rubrics = db.relationship("Rubric", backref="exam", cascade="all, delete-orphan")
	slots = db.relationship("Slot", backref="exam", cascade="all, delete-orphan")
	examiners = db.relationship(
		"User", secondary=exam_examiners, backref="assigned_exams"
	)


class Rubric(db.Model):
	__tablename__ = "rubrics"

	id = db.Column(db.Integer, primary_key=True)
	exam_id = db.Column(db.Integer, db.ForeignKey("exams.id"), nullable=False)
	criterion = db.Column(db.String(150), nullable=False)
	max_marks = db.Column(db.Float, nullable=False)
	weightage = db.Column(db.Float, default=1.0)
	description = db.Column(db.Text)


class Slot(db.Model):
	__tablename__ = "slots"

	id = db.Column(db.Integer, primary_key=True)
	exam_id = db.Column(db.Integer, db.ForeignKey("exams.id"), nullable=False)
	examiner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	date = db.Column(db.Date, nullable=False)
	start_time = db.Column(db.Time, nullable=False)
	end_time = db.Column(db.Time, nullable=False)
	capacity = db.Column(db.Integer, nullable=False, default=1)
	available_seats = db.Column(db.Integer, nullable=False, default=1)
	status = db.Column(db.String(20), default="Available")
	meeting_link = db.Column(db.String(255))

	examiner = db.relationship("User", foreign_keys=[examiner_id])
	bookings = db.relationship("Booking", backref="slot")


class Booking(db.Model):
	__tablename__ = "bookings"

	id = db.Column(db.Integer, primary_key=True)
	student_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	slot_id = db.Column(db.Integer, db.ForeignKey("slots.id"), nullable=False)
	exam_id = db.Column(db.Integer, db.ForeignKey("exams.id"), nullable=False)
	booking_date = db.Column(db.DateTime, default=datetime.utcnow)
	status = db.Column(db.String(20), default="Booked")

	student = db.relationship("User", foreign_keys=[student_id])
	exam = db.relationship("Exam")
	evaluation = db.relationship("Evaluation", backref="booking", uselist=False)


class Evaluation(db.Model):
	__tablename__ = "evaluations"

	id = db.Column(db.Integer, primary_key=True)
	booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), unique=True, nullable=False)
	student_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	examiner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
	total_marks = db.Column(db.Float, default=0)
	remarks = db.Column(db.Text)
	evaluation_date = db.Column(db.DateTime)
	status = db.Column(db.String(20), default="Pending")
	scores = db.relationship(
		"EvaluationScore", backref="evaluation", cascade="all, delete-orphan"
	)


class EvaluationScore(db.Model):
	__tablename__ = "evaluation_scores"

	id = db.Column(db.Integer, primary_key=True)
	evaluation_id = db.Column(db.Integer, db.ForeignKey("evaluations.id"), nullable=False)
	rubric_id = db.Column(db.Integer, db.ForeignKey("rubrics.id"), nullable=False)
	marks = db.Column(db.Float, nullable=False)
	rubric = db.relationship("Rubric")
