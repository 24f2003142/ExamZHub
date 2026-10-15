from celery import Celery
from celery.schedules import crontab

celery = Celery("examzhub")


def init_celery(app):
	celery.conf.update(
		broker_url=app.config["CELERY_BROKER_URL"],
		result_backend=app.config["CELERY_RESULT_BACKEND"],
		timezone="Asia/Kolkata",
	)
	celery.conf.beat_schedule = {
		"daily-exam-reminder": {
			"task": "examzhub.daily_reminders",
			"schedule": crontab(
				hour=app.config["REMINDER_HOUR"],
				minute=app.config["REMINDER_MINUTE"],
			),
		},
		"monthly-exam-report": {
			"task": "examzhub.monthly_report",
			"schedule": crontab(day_of_month=1, hour=8, minute=0),
		},
	}

	class ContextTask(celery.Task):
		def __call__(self, *args, **kwargs):
			with app.app_context():
				return self.run(*args, **kwargs)

	celery.Task = ContextTask
	return celery
