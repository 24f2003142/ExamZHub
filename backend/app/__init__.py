from flask import Flask, render_template

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
	cache.init_app(app)
	init_celery(app)

	from .routes.auth import bp as auth_bp

	app.register_blueprint(auth_bp)

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
