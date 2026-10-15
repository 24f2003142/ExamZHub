import os
from datetime import timedelta

from dotenv import load_dotenv

load_dotenv()


class Config:
	SECRET_KEY = os.getenv("SECRET_KEY", "dev")
	SQLALCHEMY_DATABASE_URI = "sqlite:///examzhub.db"
	SQLALCHEMY_TRACK_MODIFICATIONS = False
	JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt")
	JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
	REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
	CACHE_TYPE = "RedisCache"
	CACHE_REDIS_URL = REDIS_URL
	CACHE_DEFAULT_TIMEOUT = 300
	CELERY_BROKER_URL = REDIS_URL
	CELERY_RESULT_BACKEND = REDIS_URL
	ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@examzhub.com")
	ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123")
	ENFORCE_DATE_WINDOWS = os.getenv("ENFORCE_DATE_WINDOWS", "0") == "1"
	MAIL_SERVER = os.getenv("MAIL_SERVER", "")
	MAIL_PORT = int(os.getenv("MAIL_PORT", "587"))
	MAIL_USE_TLS = os.getenv("MAIL_USE_TLS", "1") == "1"
	MAIL_USER = os.getenv("MAIL_USER", "")
	MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")
	MAIL_FROM = os.getenv("MAIL_FROM", "ExamZHub <noreply@examzhub.com>")
	GCHAT_WEBHOOK_URL = os.getenv("GCHAT_WEBHOOK_URL", "")
	REMINDER_HOUR = int(os.getenv("REMINDER_HOUR", "8"))
	REMINDER_MINUTE = int(os.getenv("REMINDER_MINUTE", "0"))
