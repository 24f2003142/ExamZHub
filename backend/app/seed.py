from .extensions import db
from .models import User


def seed_admin(app):
	if not User.query.filter_by(role="admin").first():
		admin = User(name="Admin", email=app.config["ADMIN_EMAIL"], role="admin")
		admin.set_password(app.config["ADMIN_PASSWORD"])
		db.session.add(admin)
		db.session.commit()
