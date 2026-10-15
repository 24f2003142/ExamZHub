import hashlib
import json

from flask import g, has_request_context
from sqlalchemy import event
from sqlalchemy.orm import Session

from .extensions import cache

TTL_LIST = 120
TTL_EXAM = 300
TTL_RUBRIC = 600
TTL_STATS = 60
_FOREVER = 60 * 60 * 24 * 30


def _ver(namespace):
    version = cache.get(f"ver:{namespace}")
    if version is None:
        version = 1
        cache.set(f"ver:{namespace}", version, timeout=_FOREVER)
    return int(version)


def bump(*namespaces):
    for namespace in namespaces:
        try:
            cache.set(
                f"ver:{namespace}",
                _ver(namespace) + 1,
                timeout=_FOREVER,
            )
        except Exception:
            pass


def _note(kind):
    if has_request_context():
        setattr(g, kind, getattr(g, kind, 0) + 1)


def cached(namespace, parts, ttl, producer):
    """Return the cached value or compute and optionally store it."""
    key = None
    try:
        digest = hashlib.md5(
            json.dumps(parts, sort_keys=True, default=str).encode()
        ).hexdigest()
        key = f"{namespace}:{_ver(namespace)}:{digest}"
        hit = cache.get(key)
        if hit is not None:
            _note("cache_hits")
            return hit
    except Exception:
        key = None
    _note("cache_misses")
    value = producer()
    if key:
        try:
            cache.set(key, value, timeout=ttl)
        except Exception:
            pass
    return value


NS_MAP = {
    "Course": ["exams", "stats"],
    "Exam": ["exams", "schedule", "stats"],
    "Slot": ["exams", "schedule", "stats"],
    "Booking": ["exams", "schedule", "stats"],
    "Rubric": ["rubrics"],
    "User": ["stats"],
}


@event.listens_for(Session, "after_flush")
def _track(session, _context):
    touched = session.info.setdefault("touched", set())
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        touched.add(type(obj).__name__)


@event.listens_for(Session, "after_commit")
def _invalidate(session):
    touched = session.info.pop("touched", set())
    namespaces = set()
    for model_name in touched:
        namespaces.update(NS_MAP.get(model_name, []))
    if namespaces:
        bump(*namespaces)


@event.listens_for(Session, "after_rollback")
def _forget(session):
    session.info.pop("touched", None)
