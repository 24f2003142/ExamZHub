from .celery_app import celery


@celery.task
def ping():
	return "pong"
