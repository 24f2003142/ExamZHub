from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, jwt_required

from ..extensions import cache, db
from ..models import Department, StudentProfile, User
from ..utils import EMAIL_RE, current_user

bp = Blueprint("auth", __name__, url_prefix="/api")


@bp.get("/departments")
def departments():
	rows = Department.query.filter_by(is_active=True).order_by(Department.name).all()
	return jsonify(
		departments=[dict(id=row.id, code=row.code, name=row.name) for row in rows]
	)


@bp.get("/health")
def health():
	try:
		cache.set("health", "ok", timeout=10)
		redis_ok = cache.get("health") == "ok"
	except Exception:
		redis_ok = False
	return jsonify(status="ok", app="ExamZHub", redis=redis_ok)


def _token_response(user):
	token = create_access_token(
		identity=str(user.id), additional_claims={"role": user.role}
	)
	return jsonify(token=token, user=user.to_dict())


@bp.post("/auth/register")
def register():
	data = request.get_json(silent=True) or {}
	name = (data.get("name") or "").strip()
	email = (data.get("email") or "").strip().lower()
	password = data.get("password") or ""

	if len(name) < 2:
		return jsonify(error="Name must be at least 2 characters"), 400
	if not EMAIL_RE.match(email):
		return jsonify(error="Invalid email"), 400
	if len(password) < 6:
		return jsonify(error="Password must be at least 6 characters"), 400
	department = db.session.get(Department, data.get("department_id") or 0)
	if not department or not department.is_active:
		return jsonify(error="Select an active department"), 400
	try:
		year = int(data.get("year"))
		semester = int(data.get("semester"))
	except (ValueError, TypeError):
		return jsonify(error="Year and semester are required"), 400
	if year < 1 or semester < 1:
		return jsonify(error="Year and semester must be greater than 0"), 400
	if User.query.filter_by(email=email).first():
		return jsonify(error="Email already registered"), 409

	user = User(name=name, email=email, role="student")
	user.set_password(password)
	db.session.add(user)
	db.session.flush()
	db.session.add(
		StudentProfile(
			user_id=user.id,
			roll_no=data.get("roll_no"),
			phone=data.get("phone"),
			department_id=department.id,
			year=year,
			semester=semester,
		)
	)
	db.session.commit()
	return _token_response(user), 201


@bp.post("/auth/login")
def login():
	data = request.get_json(silent=True) or {}
	email = (data.get("email") or "").strip().lower()
	user = User.query.filter_by(email=email).first()
	if not user or not user.check_password(data.get("password") or ""):
		return jsonify(error="Invalid email or password"), 401
	if not user.is_active:
		return jsonify(error="Account disabled"), 403
	return _token_response(user)


@bp.get("/auth/me")
@jwt_required()
def me():
	return jsonify(user=current_user().to_dict())


@bp.put("/auth/me")
@jwt_required()
def update_me():
	user = current_user()
	data = request.get_json(silent=True) or {}
	if "name" in data:
		if len((data["name"] or "").strip()) < 2:
			return jsonify(error="Name must be at least 2 characters"), 400
		user.name = data["name"].strip()
	if data.get("password"):
		if len(data["password"]) < 6:
			return jsonify(error="Password must be at least 6 characters"), 400
		user.set_password(data["password"])
	if user.role == "student" and user.student_profile:
		user.student_profile.roll_no = data.get(
			"roll_no", user.student_profile.roll_no
		)
		user.student_profile.phone = data.get("phone", user.student_profile.phone)
		if "department_id" in data:
			department = db.session.get(Department, data.get("department_id") or 0)
			if not department or not department.is_active:
				return jsonify(error="Select an active department"), 400
			user.student_profile.department_id = department.id
		try:
			if "year" in data:
				user.student_profile.year = int(data["year"])
			if "semester" in data:
				user.student_profile.semester = int(data["semester"])
		except (ValueError, TypeError):
			return jsonify(error="Year and semester must be numbers"), 400
		if (user.student_profile.year or 0) < 1 or (user.student_profile.semester or 0) < 1:
			return jsonify(error="Year and semester must be greater than 0"), 400
	if user.role == "examiner" and user.examiner_profile:
		user.examiner_profile.phone = data.get("phone", user.examiner_profile.phone)
	db.session.commit()
	return jsonify(user=user.to_dict())
