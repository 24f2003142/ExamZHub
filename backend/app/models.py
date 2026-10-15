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

	def set_password(self, password):
		self.password_hash = generate_password_hash(password)

	def check_password(self, password):
		return check_password_hash(self.password_hash, password)
