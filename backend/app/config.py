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
