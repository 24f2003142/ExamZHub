from flask import Flask, g, render_template

from .celery_app import init_celery
from .config import Config
from .extensions import cache, db, jwt


def create_app():
	app = Flask(
		__name__,
		template_folder="../../frontend/templates",
		static_folder="../../frontend/static",
	)
	app.config.from_object(Config)

	db.init_app(app)
	jwt.init_app(app)

	@jwt.unauthorized_loader
	def _missing(msg):
		return {"error": "Missing or invalid token"}, 401

	@jwt.expired_token_loader
	def _expired(header, payload):
		return {"error": "Token expired"}, 401

	cache.init_app(app)
	init_celery(app)
	from . import cache_utils  # noqa: registers invalidation hooks

	@app.after_request
	def _cache_header(response):
		if hasattr(g, "cache_hits") or hasattr(g, "cache_misses"):
			response.headers["X-Cache"] = (
				f"hits={getattr(g, 'cache_hits', 0)}; "
				f"misses={getattr(g, 'cache_misses', 0)}"
			)
		return response

	from .routes.auth import bp as auth_bp
	from .routes.admin import bp as admin_bp
	from .routes.examiner import bp as examiner_bp
	from .routes.student import bp as student_bp

	app.register_blueprint(auth_bp)
	app.register_blueprint(admin_bp)
	app.register_blueprint(examiner_bp)
	app.register_blueprint(student_bp)

	from . import tasks

	@app.get("/")
	def index():
		return render_template("index.html")

	with app.app_context():
		from . import models

		db.create_all()
		from .seed import seed_admin

		seed_admin(app)

	return app
