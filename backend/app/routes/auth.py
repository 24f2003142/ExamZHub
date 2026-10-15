from flask import Blueprint, jsonify

from ..extensions import cache

bp = Blueprint("auth", __name__, url_prefix="/api")


@bp.get("/health")
def health():
	try:
		cache.set("health", "ok", timeout=10)
		redis_ok = cache.get("health") == "ok"
	except Exception:
		redis_ok = False
	return jsonify(status="ok", app="ExamZHub", redis=redis_ok)
