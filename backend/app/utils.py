import re
from functools import wraps

from flask import jsonify
from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request

from .extensions import db
from .models import User

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def current_user():
    return db.session.get(User, int(get_jwt_identity()))


def role_required(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            verify_jwt_in_request()
            user = current_user()
            if not user or not user.is_active:
                return jsonify(error="Account disabled or not found"), 401
            if user.role not in roles:
                return jsonify(error="Forbidden"), 403
            return fn(*args, **kwargs)

        return wrapper

    return decorator
