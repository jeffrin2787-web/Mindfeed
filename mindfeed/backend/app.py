from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Generator, Optional
from urllib.parse import urlparse
from urllib.request import Request as URLRequest, urlopen

from dotenv import load_dotenv

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, UploadFile, File, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import (Boolean, Date, DateTime, ForeignKey, Integer, JSON, String,
                        Text, UniqueConstraint, create_engine, func, select)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker
from starlette.staticfiles import StaticFiles
from starlette.responses import FileResponse, PlainTextResponse


APP_DIR = Path(__file__).resolve().parent
ROOT_DIR = APP_DIR.parent
# Load project-local configuration for a simple local setup; existing process environment wins.
load_dotenv(ROOT_DIR / ".env", override=False)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{ROOT_DIR / 'mindfeed.db'}")
SECRET_KEY = os.getenv("SECRET_KEY", "local-development-key-change-before-deployment-9de08f")
APP_ENV = os.getenv("APP_ENV", "development").lower()
ENABLE_DEMO_LOGIN = os.getenv("ENABLE_DEMO_LOGIN", "true").lower() in {"1", "true", "yes"}
PUBLIC_SITE_URL = os.getenv("PUBLIC_SITE_URL", "http://localhost:8000").rstrip("/")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODERATION_MODEL = os.getenv("OPENAI_MODERATION_MODEL", "omni-moderation-latest").strip() or "omni-moderation-latest"
SMS_MODE = os.getenv("SMS_MODE", "development").lower()
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "").strip()
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "20")) * 1024 * 1024

engine_kwargs: dict[str, Any] = {"pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(300), nullable=False)
    role: Mapped[str] = mapped_column(String(24), default="member", nullable=False)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    bio: Mapped[str] = mapped_column(String(300), default="Curious by nature.", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    preferences: Mapped["UserPreference"] = relationship(back_populates="user", cascade="all, delete-orphan", uselist=False)


class UserPreference(Base):
    __tablename__ = "user_preferences"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    interests: Mapped[list] = mapped_column(JSON, default=lambda: ["Technology", "Design", "Science"], nullable=False)
    blocked_topics: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    profile_type: Mapped[str] = mapped_column(String(20), default="standard", nullable=False)
    child_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allow_public_posts: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_external_links: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    content_restriction_level: Mapped[str] = mapped_column(String(16), default="standard", nullable=False)
    languages: Mapped[list] = mapped_column(JSON, default=lambda: ["English"], nullable=False)
    content_formats: Mapped[list] = mapped_column(JSON, default=lambda: ["Videos", "Posts", "Images"], nullable=False)
    feed_mode: Mapped[str] = mapped_column(String(24), default="balanced", nullable=False)
    reduce_repetition: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    study_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    study_topics: Mapped[list] = mapped_column(JSON, default=lambda: ["Science", "Technology", "Learning"], nullable=False)
    daily_limit_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)
    session_limit_minutes: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    break_reminder_minutes: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)
    user: Mapped[User] = relationship(back_populates="preferences")




class GuardianLink(Base):
    __tablename__ = "guardian_links"
    __table_args__ = (UniqueConstraint("guardian_user_id", "child_user_id", name="uq_guardian_child_link"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    guardian_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    child_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    topic: Mapped[str] = mapped_column(String(60), default="General", index=True, nullable=False)
    format: Mapped[str] = mapped_column(String(24), default="Post", nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    status: Mapped[str] = mapped_column(String(24), default="approved", index=True, nullable=False)
    likes_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    moderation_reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_sample: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True, nullable=False)
    author: Mapped[User] = relationship()


class PostLike(Base):
    __tablename__ = "post_likes"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_like_user"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class PhoneVerification(Base):
    __tablename__ = "phone_verifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(24), unique=True, index=True, nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class PostComment(Base):
    __tablename__ = "post_comments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    content: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    author: Mapped[User] = relationship()


class SavedPost(Base):
    __tablename__ = "saved_posts"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_saved_post_user"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class UserFollow(Base):
    __tablename__ = "user_follows"
    __table_args__ = (UniqueConstraint("follower_id", "followed_id", name="uq_user_follow"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    follower_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    followed_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class FeedbackEvent(Base):
    __tablename__ = "feedback_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True, nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    topic: Mapped[str] = mapped_column(String(60), default="General", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class FactCheck(Base):
    __tablename__ = "fact_checks"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    claim: Mapped[str] = mapped_column(Text, nullable=False)
    result_status: Mapped[str] = mapped_column(String(32), nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    source_mode: Mapped[str] = mapped_column(String(32), default="curated_demo", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    target_type: Mapped[str] = mapped_column(String(24), nullable=False)
    target_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(String(80), nullable=False)
    details: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="open", index=True, nullable=False)
    reviewer_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Appeal(Base):
    __tablename__ = "appeals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    post_id: Mapped[int] = mapped_column(ForeignKey("posts.id", ondelete="CASCADE"), index=True, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="open", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class VerificationRequest(Base):
    __tablename__ = "verification_requests"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    verification_type: Mapped[str] = mapped_column(String(40), default="account_authenticity", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="pending_review", nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class UsageSession(Base):
    __tablename__ = "usage_sessions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    active_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class UsageDaily(Base):
    __tablename__ = "usage_daily"
    __table_args__ = (UniqueConstraint("user_id", "usage_date", name="uq_usage_daily_user_date"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    usage_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    active_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


# ---------- Database dependency and authentication ----------
def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str, salt: Optional[bytes] = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 310_000)
    return f"pbkdf2_sha256$310000${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds, salt_b64, hash_b64 = stored.split("$", 3)
        salt, expected = _unb64(salt_b64), _unb64(hash_b64)
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(rounds))
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_token(user: User) -> str:
    now = int(time.time())
    payload = {"sub": user.id, "role": user.role, "iat": now, "exp": now + 60 * 60 * 24 * 7}
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = _b64(hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{signature}"


def decode_token(token: str) -> dict[str, Any]:
    try:
        body, signature = token.split(".", 1)
        expected = _b64(hmac.new(SECRET_KEY.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            raise ValueError("Invalid token signature")
        data = json.loads(_unb64(body))
        if int(data.get("exp", 0)) < int(time.time()):
            raise ValueError("Token expired")
        return data
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.") from exc


bearer = HTTPBearer(auto_error=False)


def current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Sign in to continue.")
    payload = decode_token(credentials.credentials)
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="This account is unavailable.")
    return user


def require_moderator(user: User = Depends(current_user)) -> User:
    if user.role not in {"moderator", "admin"}:
        raise HTTPException(status_code=403, detail="Moderator access is required for this action.")
    return user


# ---------- DTOs ----------
class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = Field(default=None, min_length=8, max_length=24)

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None or not value.strip():
            return None
        cleaned = re.sub(r"[\s().-]", "", value.strip())
        if not re.fullmatch(r"\+[1-9]\d{7,14}", cleaned):
            raise ValueError("Use an international phone number, including country code, e.g. +14155552671.")
        return cleaned

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.split()).strip()
        if not cleaned:
            raise ValueError("Name cannot be empty")
        return cleaned


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PostInput(BaseModel):
    content: str = Field(default="", max_length=4000)
    topic: str = Field(default="Culture", min_length=2, max_length=60)
    format: str = Field(default="Post", pattern="^(Post|Photo|Video|Link)$")
    image_url: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("content")
    @classmethod
    def trim_content(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def require_caption_or_media(self) -> "PostInput":
        if self.content and len(self.content) < 3:
            raise ValueError("Write a little more before publishing.")
        if not self.content and not self.image_url:
            raise ValueError("Add a caption or upload media before publishing.")
        return self

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value: Optional[str]) -> Optional[str]:
        if value is not None:
            if value.startswith("/uploads/") and ".." not in value.split("/"):
                return value
            if urlparse(value).scheme not in {"http", "https"}:
                raise ValueError("Media URLs must use HTTPS/HTTP or a MindFeed upload path.")
        return value


class ModerationInput(BaseModel):
    content: str = Field(min_length=3, max_length=4000)


class PreferencesInput(BaseModel):
    interests: Optional[list[str]] = None
    blocked_topics: Optional[list[str]] = None
    profile_type: Optional[str] = Field(default=None, pattern="^(standard|student|child|parent)$")
    child_mode: Optional[bool] = None
    allow_public_posts: Optional[bool] = None
    allow_external_links: Optional[bool] = None
    content_restriction_level: Optional[str] = Field(default=None, pattern="^(standard|strict)$")
    languages: Optional[list[str]] = None
    content_formats: Optional[list[str]] = None
    feed_mode: Optional[str] = Field(default=None, pattern="^(balanced|relevance|latest|diverse)$")
    reduce_repetition: Optional[bool] = None
    study_mode: Optional[bool] = None
    study_topics: Optional[list[str]] = None
    daily_limit_minutes: Optional[int] = Field(default=None, ge=5, le=720)
    session_limit_minutes: Optional[int] = Field(default=None, ge=5, le=240)
    break_reminder_minutes: Optional[int] = Field(default=None, ge=1, le=30)

    @field_validator("interests", "blocked_topics", "languages", "content_formats", "study_topics")
    @classmethod
    def clean_lists(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        cleaned = list(dict.fromkeys(" ".join(str(v).split()).strip() for v in value if str(v).strip()))
        if len(cleaned) > 40 or any(len(x) > 60 for x in cleaned):
            raise ValueError("Please keep preference lists concise.")
        return cleaned


class FactCheckInput(BaseModel):
    claim: str = Field(min_length=8, max_length=2000)


class FeedbackInput(BaseModel):
    action: str = Field(pattern="^(show_more|show_less|not_relevant|block_topic|save)$")


class ReportInput(BaseModel):
    target_type: str = Field(pattern="^(post|account|factcheck|other)$")
    target_id: Optional[int] = Field(default=None, ge=1)
    reason: str = Field(min_length=3, max_length=80)
    details: str = Field(default="", max_length=2000)


class AppealInput(BaseModel):
    post_id: int = Field(ge=1)
    reason: str = Field(min_length=10, max_length=2000)


class VerifyInput(BaseModel):
    verification_type: str = Field(default="account_authenticity", pattern="^(account_authenticity|creator|organization)$")
    note: str = Field(default="", max_length=500)


class UsageTickInput(BaseModel):
    session_id: int = Field(ge=1)
    active_seconds: int = Field(default=30, ge=1, le=60)


class FamilyLinkRequestInput(BaseModel):
    child_email: EmailStr


class FamilyLinkResponseInput(BaseModel):
    accept: bool


class ParentalSettingsInput(BaseModel):
    daily_limit_minutes: Optional[int] = Field(default=None, ge=5, le=180)
    session_limit_minutes: Optional[int] = Field(default=None, ge=5, le=120)
    break_reminder_minutes: Optional[int] = Field(default=None, ge=1, le=30)
    blocked_topics: Optional[list[str]] = None
    reduce_repetition: Optional[bool] = None
    allow_public_posts: Optional[bool] = None
    allow_external_links: Optional[bool] = None
    content_restriction_level: Optional[str] = Field(default=None, pattern="^(standard|strict)$")

    @field_validator("blocked_topics")
    @classmethod
    def clean_blocked_topics(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        if value is None:
            return None
        cleaned = list(dict.fromkeys(" ".join(str(v).split()).strip() for v in value if str(v).strip()))
        if len(cleaned) > 40 or any(len(x) > 60 for x in cleaned):
            raise ValueError("Please keep blocked topics concise.")
        return cleaned


class UsageStartInput(BaseModel):
    pass


class ReviewInput(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    note: str = Field(default="", max_length=1000)


# ---------- Helpers and services ----------
def user_to_dict(user: User) -> dict[str, Any]:
    return {
        "id": user.id, "name": user.name, "email": user.email, "role": user.role,
        "avatar_url": user.avatar_url, "bio": user.bio,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def preferences_to_dict(p: UserPreference) -> dict[str, Any]:
    return {
        "interests": p.interests or [], "blocked_topics": p.blocked_topics or [],
        "profile_type": p.profile_type or "standard", "child_mode": p.child_mode,
        "allow_public_posts": p.allow_public_posts, "allow_external_links": p.allow_external_links,
        "content_restriction_level": p.content_restriction_level or "standard",
        "languages": p.languages or [], "content_formats": p.content_formats or [],
        "feed_mode": p.feed_mode, "reduce_repetition": p.reduce_repetition,
        "study_mode": p.study_mode, "study_topics": p.study_topics or [],
        "daily_limit_minutes": p.daily_limit_minutes,
        "session_limit_minutes": p.session_limit_minutes,
        "break_reminder_minutes": p.break_reminder_minutes,
    }


def get_preferences(db: Session, user: User) -> UserPreference:
    prefs = db.get(UserPreference, user.id)
    if not prefs:
        prefs = UserPreference(user_id=user.id)
        db.add(prefs)
        db.flush()
    return prefs


def post_to_dict(db: Session, post: Post, viewer_id: Optional[int] = None) -> dict[str, Any]:
    liked = False
    if viewer_id:
        liked = db.scalar(select(PostLike.id).where(PostLike.post_id == post.id, PostLike.user_id == viewer_id).limit(1)) is not None
    saved = bool(viewer_id and db.scalar(select(SavedPost.id).where(SavedPost.post_id == post.id, SavedPost.user_id == viewer_id).limit(1)) is not None)
    following = bool(viewer_id and viewer_id != post.user_id and db.scalar(select(UserFollow.id).where(UserFollow.follower_id == viewer_id, UserFollow.followed_id == post.user_id).limit(1)) is not None)
    return {
        "id": post.id, "author": user_to_dict(post.author), "content": post.content,
        "topic": post.topic, "format": post.format, "image_url": post.image_url,
        "status": post.status, "moderation_reason": post.moderation_reason,
        "likes_count": post.likes_count,
        "liked_by_me": liked, "saved_by_me": saved, "following_author": following,
        "comments_count": db.scalar(select(func.count(PostComment.id)).where(PostComment.post_id == post.id)) or 0,
        "is_sample": post.is_sample,
        "created_at": post.created_at.isoformat() if post.created_at else None,
    }


def moderation_assessment(content: str) -> dict[str, Any]:
    """Use the configured moderation API when available, otherwise transparent local demo rules.

    When an explicitly configured provider fails, content is held for review rather than silently
    approved. Local heuristics are only a development fallback, not a trained safety classifier.
    """
    text = content.strip()
    if not text:
        return {
            "status": "approved",
            "score": 0,
            "reasons": [],
            "engine": "text_only_media_not_analyzed",
            "message": "No caption was provided. MindFeed's text moderation does not analyze uploaded media.",
        }
    if OPENAI_API_KEY:
        try:
            payload = json.dumps({"model": OPENAI_MODERATION_MODEL, "input": text}).encode("utf-8")
            req = URLRequest(
                "https://api.openai.com/v1/moderations",
                data=payload,
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=12) as response:
                data = json.loads(response.read().decode("utf-8"))
            result = (data.get("results") or [{}])[0]
            categories = result.get("categories") or {}
            scores = result.get("category_scores") or {}
            label_map = {
                "harassment": "Harassment",
                "harassment_threatening": "Threatening harassment",
                "hate": "Hateful content",
                "hate_threatening": "Threatening hateful content",
                "illicit": "Potentially illicit content",
                "illicit_violent": "Potentially violent illicit content",
                "self_harm": "Self-harm related content",
                "self_harm_intent": "Self-harm intent indicators",
                "self_harm_instructions": "Self-harm instruction indicators",
                "sexual": "Sexual content",
                "sexual_minors": "Sexual content involving minors",
                "violence": "Violence-related content",
                "violence_graphic": "Graphic violence",
            }
            flagged_categories = [name for name, flagged in categories.items() if flagged]
            reasons = [label_map.get(name, name.replace("_", " ").capitalize()) for name in flagged_categories]
            raw_scores = [float(value) for value in scores.values() if isinstance(value, (int, float))]
            score = min(100, round(max(raw_scores, default=0.0) * 100))
            flagged = bool(result.get("flagged"))
            return {
                "status": "needs_review" if flagged else "approved",
                "score": score,
                "reasons": reasons,
                "engine": "openai_moderation_api",
                "message": "The configured moderation model flagged this content for review." if flagged else "The configured moderation model did not flag this text. This is not a guarantee that content is safe.",
            }
        except Exception:
            return {
                "status": "needs_review",
                "score": 50,
                "reasons": ["The configured moderation provider could not be reached or returned an invalid response."],
                "engine": "provider_unavailable",
                "message": "Content is held for human review because the configured moderation provider is unavailable.",
            }

    reasons: list[str] = []
    links = re.findall(r"https?://\S+", text, flags=re.I)
    repeated_chunks = re.search(r"(.{12,})\1{2,}", re.sub(r"\s+", " ", text), flags=re.I)
    spam_markers = ["guaranteed cash", "free money now", "send payment to unlock", "claim prize immediately"]
    if len(links) > 3:
        reasons.append("Several links in one post can indicate promotional spam.")
    if repeated_chunks:
        reasons.append("Repeated text was detected.")
    if any(marker in text.casefold() for marker in spam_markers):
        reasons.append("The post matches a known promotional-spam pattern in the local demo rules.")
    if re.search(r"\b(i will hurt you|i am going to attack you)\b", text, flags=re.I):
        reasons.append("Potentially threatening language needs human review.")
    if reasons:
        return {"status": "needs_review", "score": 64, "reasons": reasons,
                "engine": "local_rules_demo", "message": "This post needs a closer look before it can be published."}
    return {"status": "approved", "score": 96, "reasons": [],
            "engine": "local_rules_demo", "message": "No configured demo-rule flags were found. This is not a guarantee that content is safe."}


FACT_CATALOG: list[dict[str, Any]] = [
    {
        "match": ["earth orbits the sun", "earth revolves around the sun", "earth goes around the sun"],
        "status": "supported", "confidence": 98,
        "explanation": "This claim is supported by standard astronomical descriptions of Earth's orbit around the Sun. The result comes from MindFeed's small curated demonstration catalogue, not a live multi-source search.",
        "evidence": [
            {"source": "NASA — Earth", "domain": "science.nasa.gov", "url": "https://science.nasa.gov/earth/", "relationship": "Primary science reference", "note": "NASA's Earth overview provides authoritative planetary context."},
            {"source": "NASA Solar System Exploration", "domain": "science.nasa.gov", "url": "https://science.nasa.gov/solar-system/", "relationship": "Related institutional reference", "note": "NASA's solar-system material describes the planets and their orbits."},
        ],
    },
    {
        "match": ["water boils at 100 c", "water boils at 100°c", "water boils at 100 degrees celsius"],
        "status": "supported", "confidence": 94,
        "explanation": "The claim is broadly correct at standard atmospheric pressure. Boiling temperature changes with pressure, so the pressure condition is important context.",
        "evidence": [
            {"source": "Encyclopaedia Britannica — Boiling point", "domain": "britannica.com", "url": "https://www.britannica.com/science/boiling-point", "relationship": "Reference overview", "note": "Explains boiling point and its dependence on pressure."},
        ],
    },
    {
        "match": ["the great wall is visible from the moon", "great wall of china visible from the moon", "visible from the moon with the naked eye"],
        "status": "contradicted", "confidence": 88,
        "explanation": "The common claim that the Great Wall can be seen from the Moon with the naked eye is not supported by the available curated reference summary. Visibility depends on distance, contrast, weather, and the observation system; this demo result should not replace a fresh source review.",
        "evidence": [
            {"source": "NASA — Earth observation resources", "domain": "nasa.gov", "url": "https://www.nasa.gov/", "relationship": "Institutional starting point", "note": "A starting point for checking NASA material; this page is not a dedicated fact-check article."},
        ],
    },
]


def assess_claim(claim: str) -> dict[str, Any]:
    normalized = re.sub(r"\s+", " ", claim.casefold()).strip().rstrip(".!? ")
    for item in FACT_CATALOG:
        if any(pattern in normalized for pattern in item["match"]):
            return {"status": item["status"], "confidence": item["confidence"],
                    "explanation": item["explanation"], "evidence": item["evidence"],
                    "source_mode": "curated_demo", "limitations": "This result used MindFeed's small demonstration catalogue. It did not perform a live web search or establish source independence automatically."}
    return {"status": "insufficient_evidence", "confidence": 18,
            "explanation": "MindFeed could not find a matching entry in its small curated demonstration catalogue. This does not mean the claim is false; it means this local demo cannot establish a conclusion from the available references.",
            "evidence": [], "source_mode": "curated_demo",
            "limitations": "No live search provider is configured. Add a permitted search or fact-checking API for production evidence retrieval."}


def daily_usage(db: Session, user_id: int) -> int:
    today = datetime.now(timezone.utc).date()
    value = db.scalar(select(UsageDaily).where(UsageDaily.user_id == user_id, UsageDaily.usage_date == today))
    return value.active_seconds if value else 0


def usage_summary(db: Session, user: User) -> dict[str, Any]:
    prefs = get_preferences(db, user)
    today = datetime.now(timezone.utc).date()
    daily = db.scalar(select(UsageDaily).where(UsageDaily.user_id == user.id, UsageDaily.usage_date == today))
    session_row = db.scalar(select(UsageSession).where(UsageSession.user_id == user.id, UsageSession.ended_at.is_(None)).order_by(UsageSession.started_at.desc()).limit(1))
    daily_seconds = daily.active_seconds if daily else 0
    session_seconds = session_row.active_seconds if session_row else 0
    daily_limit = prefs.daily_limit_minutes * 60
    session_limit = prefs.session_limit_minutes * 60
    return {
        "date": today.isoformat(), "daily_active_seconds": daily_seconds,
        "daily_limit_seconds": daily_limit, "daily_remaining_seconds": max(0, daily_limit - daily_seconds),
        "session_active_seconds": session_seconds, "session_limit_seconds": session_limit,
        "session_remaining_seconds": max(0, session_limit - session_seconds),
        "daily_limit_reached": daily_seconds >= daily_limit,
        "session_limit_reached": session_seconds >= session_limit,
        "session_id": session_row.id if session_row else None,
        "limits_enforced_in_app_only": True,
    }


def auth_payload(user: User) -> dict[str, Any]:
    return {"access_token": create_token(user), "token_type": "bearer", "user": user_to_dict(user)}


@asynccontextmanager
async def app_lifespan(_app: FastAPI):
    # The seed/schema initializer is defined later in this module; it is available before
    # ASGI startup runs because module import completes first.
    startup()
    yield


app = FastAPI(
    title="MindFeed API",
    description="API for the MindFeed user-controlled AI social platform demonstrator.",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=app_lifespan,
)

allowed_origins = [x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if x.strip()]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type"])
app.add_middleware(GZipMiddleware, minimum_size=700)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if APP_ENV == "production":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute(select(1))
        ai_mode = "openai-moderation+curated-truthcheck" if OPENAI_API_KEY else "local-demo-fallback"
        return {"status": "ok", "database": "connected", "environment": APP_ENV, "ai_mode": ai_mode}
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Database health check failed.") from exc


def startup() -> None:
    if APP_ENV == "production" and (len(SECRET_KEY) < 32 or "replace-with" in SECRET_KEY.casefold() or "local-development" in SECRET_KEY.casefold()):
        raise RuntimeError("Set a unique random SECRET_KEY of at least 32 characters before using production mode.")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        demo = db.scalar(select(User).where(User.email == "demo@mindfeed.local"))
        if not demo:
            demo = User(name="Alex Morgan", email="demo@mindfeed.local", password_hash=hash_password(secrets.token_urlsafe(24)), role="moderator", avatar_url="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&h=160&fit=crop&crop=faces", bio="Curious by nature. Building a healthier corner of the internet.")
            db.add(demo)
            db.flush()
            db.add(UserPreference(user_id=demo.id))
            db.flush()
        demo_id = demo.id
        sample_users = [
            ("Maya Chen", "maya.sample@mindfeed.local", "Designing little things that make daily life better.", "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=160&h=160&fit=crop&crop=faces"),
            ("Jordan Lee", "jordan.sample@mindfeed.local", "Science, slow mornings, and asking better questions.", "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=160&h=160&fit=crop&crop=faces"),
            ("Priya Raman", "priya.sample@mindfeed.local", "Learning in public, one small idea at a time.", "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=160&h=160&fit=crop&crop=faces"),
            ("Sam Rivera", "sam.sample@mindfeed.local", "A little less noise. A little more wonder.", "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=160&h=160&fit=crop&crop=faces"),
        ]
        author_ids: list[int] = [demo_id]
        for name, email, bio, avatar in sample_users:
            person = db.scalar(select(User).where(User.email == email))
            if not person:
                person = User(name=name, email=email, password_hash=hash_password(secrets.token_urlsafe(24)), role="member", avatar_url=avatar, bio=bio)
                db.add(person)
                db.flush()
                db.add(UserPreference(user_id=person.id))
            author_ids.append(person.id)
        if (db.scalar(select(func.count(Post.id))) or 0) == 0:
            now = datetime.now(timezone.utc)
            samples = [
                (author_ids[1], "A tiny design change can make a digital space feel completely different: give people room to breathe, make choices visible, and keep the important action obvious.", "Design", "Post", None, 18),
                (author_ids[2], "A reminder from science: curiosity is more useful than pretending to know everything. The best questions often start with ‘what would change my mind?’", "Science", "Post", None, 42),
                (author_ids[3], "My favorite study trick lately: write one question before opening a lesson, then close the tab and answer it in my own words.", "Learning", "Post", None, 31),
                (author_ids[4], "A weekend walk, a camera roll full of little details, and no pressure to turn every moment into content.", "Culture", "Photo", "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1200&auto=format&fit=crop&q=80", 67),
                (author_ids[2], "The best technology is often the kind that quietly gives people more choice, not less.", "Technology", "Post", None, 55),
                (author_ids[1], "A gentle design principle: explain the recommendation, let the person change it, and make the setting easy to find again.", "Design", "Post", None, 24),
                (author_ids[3], "Today’s small learning goal: ten focused minutes, one useful note, and a real break afterwards.", "Learning", "Post", None, 14),
            ]
            for index, (author_id, content, topic, fmt, image, likes) in enumerate(samples):
                # Initial engagement values are part of the explicitly seeded demonstration dataset.
                post = Post(user_id=author_id, content=content, topic=topic, format=fmt, image_url=image, status="approved", is_sample=True, likes_count=likes, created_at=now - timedelta(minutes=14 * index))
                db.add(post)
        db.commit()
    finally:
        db.close()


@app.post("/api/auth/demo")
def login_demo(db: Session = Depends(get_db)):
    if not ENABLE_DEMO_LOGIN:
        raise HTTPException(status_code=403, detail="Demo access is disabled.")
    user = db.scalar(select(User).where(User.email == "demo@mindfeed.local"))
    if not user:
        raise HTTPException(status_code=503, detail="Demo account is not initialized yet.")
    return auth_payload(user)


def _otp_digest(user_id: int, phone: str, code: str) -> str:
    return hmac.new(SECRET_KEY.encode(), f"{user_id}:{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def _send_sms_otp(phone: str, code: str) -> bool:
    """Send via Twilio REST when configured; development mode never claims a real SMS was sent."""
    if SMS_MODE == "twilio" and TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER:
        from urllib.parse import urlencode
        import base64 as _base64
        url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
        data = urlencode({"To": phone, "From": TWILIO_FROM_NUMBER, "Body": f"Your MindFeed verification code is {code}. It expires in 5 minutes."}).encode()
        credentials = _base64.b64encode(f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode()).decode()
        req = URLRequest(url, data=data, headers={"Authorization": f"Basic {credentials}", "Content-Type": "application/x-www-form-urlencoded"}, method="POST")
        try:
            with urlopen(req, timeout=10) as response:
                return 200 <= response.status < 300
        except Exception:
            return False
    return SMS_MODE == "development"


def _start_phone_verification(db: Session, user: User, phone: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    row = db.scalar(select(PhoneVerification).where(PhoneVerification.user_id == user.id))
    if row and row.verified_at:
        if row.phone == phone:
            return {"verification_required": False}
        raise HTTPException(status_code=409, detail="A verified phone is already associated with this account.")
    if row and row.phone != phone:
        conflict = db.scalar(select(PhoneVerification.id).where(PhoneVerification.phone == phone))
        if conflict:
            raise HTTPException(status_code=409, detail="This phone number is already in use.")
        row.phone = phone
    elif not row:
        if db.scalar(select(PhoneVerification.id).where(PhoneVerification.phone == phone)):
            raise HTTPException(status_code=409, detail="This phone number is already in use.")
        row = PhoneVerification(user_id=user.id, phone=phone, otp_hash="pending", expires_at=now, last_sent_at=now - timedelta(seconds=60))
        db.add(row)
        db.flush()
    if row.last_sent_at and (now - row.last_sent_at).total_seconds() < 45:
        raise HTTPException(status_code=429, detail="Please wait 45 seconds before requesting another code.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    sent = _send_sms_otp(phone, code)
    if not sent:
        raise HTTPException(status_code=502, detail="SMS delivery failed. Check the SMS provider configuration and try again.")
    row.otp_hash = _otp_digest(user.id, phone, code)
    row.expires_at = now + timedelta(minutes=5)
    row.attempts = 0
    row.last_sent_at = now
    db.commit()
    response = {"verification_required": True, "message": "Verification code submitted to the SMS provider." if SMS_MODE == "twilio" else "Development mode: no SMS was sent. Configure Twilio for real delivery.", "expires_in_seconds": 300, "delivery_mode": SMS_MODE}
    if SMS_MODE == "development" and APP_ENV != "production" and os.getenv("DEV_EXPOSE_OTP", "true").lower() in {"1", "true", "yes"}:
        response["development_code"] = code
    return response


@app.post("/api/auth/register", status_code=201)
def register(body: RegisterInput, db: Session = Depends(get_db)):
    email = str(body.email).lower().strip()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(name=body.name, email=email, password_hash=hash_password(body.password), role="member", bio="New to MindFeed.")
    if body.phone and db.scalar(select(PhoneVerification.id).where(PhoneVerification.phone == body.phone)):
        raise HTTPException(status_code=409, detail="This phone number is already in use.")
    db.add(user)
    db.flush()
    db.add(UserPreference(user_id=user.id))
    if body.phone:
        try:
            result = _start_phone_verification(db, user, body.phone)
        except Exception:
            db.rollback()
            raise
        return {"user_id": user.id, "email": user.email, **result}
    db.commit()
    db.refresh(user)
    return auth_payload(user)


@app.post("/api/auth/verify-phone")
def verify_phone(body: dict[str, Any], db: Session = Depends(get_db)):
    user_id, code = body.get("user_id"), str(body.get("code", "")).strip()
    if not isinstance(user_id, int) or not re.fullmatch(r"\d{6}", code):
        raise HTTPException(status_code=422, detail="Enter the six-digit verification code.")
    row = db.scalar(select(PhoneVerification).where(PhoneVerification.user_id == user_id))
    if not row:
        raise HTTPException(status_code=400, detail="No pending phone verification was found.")
    if row.verified_at:
        user = db.get(User, user_id)
        return auth_payload(user)
    now = datetime.now(timezone.utc)
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    if expires < now:
        raise HTTPException(status_code=400, detail="This code has expired. Request a new one.")
    if row.attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many attempts. Request a new code later.")
    row.attempts += 1
    if not hmac.compare_digest(row.otp_hash, _otp_digest(user_id, row.phone, code)):
        db.commit()
        raise HTTPException(status_code=400, detail="The verification code is invalid.")
    row.verified_at = now
    row.otp_hash = "consumed"
    db.commit()
    return auth_payload(db.get(User, user_id))


@app.post("/api/auth/resend-phone-otp")
def resend_phone_otp(body: dict[str, Any], db: Session = Depends(get_db)):
    user_id = body.get("user_id")
    row = db.scalar(select(PhoneVerification).where(PhoneVerification.user_id == user_id)) if isinstance(user_id, int) else None
    if not row or row.verified_at:
        raise HTTPException(status_code=400, detail="No pending phone verification was found.")
    user = db.get(User, row.user_id)
    return _start_phone_verification(db, user, row.phone)


@app.post("/api/auth/login")
def login(body: LoginInput, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(body.email).lower().strip()))
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    verification = db.scalar(select(PhoneVerification).where(PhoneVerification.user_id == user.id))
    if verification and not verification.verified_at:
        raise HTTPException(status_code=403, detail="Verify your phone number before signing in.")
    return auth_payload(user)


@app.get("/api/auth/me")
def get_me(user: User = Depends(current_user)):
    return {"user": user_to_dict(user)}


@app.patch("/api/auth/profile")
def update_profile(body: dict[str, Any], db: Session = Depends(get_db), user: User = Depends(current_user)):
    name = body.get("name")
    bio = body.get("bio")
    if name is not None:
        if not isinstance(name, str) or not 2 <= len(name.strip()) <= 80:
            raise HTTPException(status_code=422, detail="Name must be between 2 and 80 characters.")
        user.name = " ".join(name.split())
    if bio is not None:
        if not isinstance(bio, str) or len(bio) > 300:
            raise HTTPException(status_code=422, detail="Bio must be 300 characters or fewer.")
        user.bio = bio.strip()
    db.commit()
    db.refresh(user)
    return {"user": user_to_dict(user)}


@app.get("/api/preferences")
def read_preferences(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return {"preferences": preferences_to_dict(get_preferences(db, user))}


@app.put("/api/preferences")
def update_preferences(body: PreferencesInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    prefs = get_preferences(db, user)
    changes = body.model_dump(exclude_unset=True)
    if "profile_type" in changes and changes["profile_type"] != prefs.profile_type:
        active_child_link = db.scalar(select(GuardianLink.id).where(GuardianLink.child_user_id == user.id, GuardianLink.status == "active").limit(1))
        active_parent_link = db.scalar(select(GuardianLink.id).where(GuardianLink.guardian_user_id == user.id, GuardianLink.status == "active").limit(1))
        if active_child_link or active_parent_link:
            raise HTTPException(status_code=409, detail="Profile type cannot be changed while an active family link exists. End the family relationship through an authorized workflow first.")
    for key, value in changes.items():
        if value is not None:
            setattr(prefs, key, value)
    if prefs.profile_type == "child":
        prefs.child_mode = True
        if "profile_type" in changes and changes["profile_type"] == "child":
            prefs.content_restriction_level = "strict"
            prefs.allow_external_links = False
    elif prefs.profile_type != "child":
        prefs.child_mode = False
    db.commit()
    db.refresh(prefs)
    return {"preferences": preferences_to_dict(prefs), "message": "Your preferences are saved."}


@app.get("/api/dashboard/stats")
def dashboard_stats(db: Session = Depends(get_db), user: User = Depends(current_user)):
    approved_posts = db.scalar(select(func.count(Post.id)).where(Post.status == "approved")) or 0
    members = db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0
    checks = db.scalar(select(func.count(FactCheck.id))) or 0
    mine = db.scalar(select(func.count(Post.id)).where(Post.user_id == user.id)) or 0
    report_count = db.scalar(select(func.count(Report.id)).where(Report.reporter_id == user.id)) or 0
    return {"approved_posts": approved_posts, "community_members": members, "fact_checks_run": checks, "my_posts": mine, "my_reports": report_count}


@app.get("/api/feed")
def get_feed(mode: str = Query(default="for-you", pattern="^(for-you|latest|learn|following)$"), limit: int = Query(default=30, ge=1, le=60), db: Session = Depends(get_db), user: User = Depends(current_user)):
    usage = usage_summary(db, user)
    if usage["daily_limit_reached"] or usage["session_limit_reached"]:
        return {"items": [], "mode": mode, "limit": usage, "message": "Your configured viewing limit has been reached."}
    prefs = get_preferences(db, user)
    query = select(Post).where(Post.status == "approved")
    posts = list(db.scalars(query).all())
    blocked = {str(x).casefold() for x in (prefs.blocked_topics or [])}
    posts = [p for p in posts if p.topic.casefold() not in blocked]
    learning_mode = mode == "learn" or prefs.study_mode
    interests = {str(x).casefold() for x in (prefs.study_topics if learning_mode else prefs.interests or [])}
    posts = [p for p in posts if p.topic.casefold() in interests]
    if learning_mode:
        posts.sort(key=lambda p: (p.topic.casefold() in interests, p.created_at), reverse=True)
    elif mode == "latest":
        posts.sort(key=lambda p: p.created_at, reverse=True)
    elif mode == "following":
        # Following is intentionally a compact demo mode: show posts from other community members, with no personalized boost.
        posts = [p for p in posts if p.user_id != user.id]
        posts.sort(key=lambda p: p.created_at, reverse=True)
    else:
        def score(p: Post) -> tuple[int, float]:
            topic_match = 2 if p.topic.casefold() in interests else 0
            recency = p.created_at.timestamp() if p.created_at else 0
            return topic_match, recency
        posts.sort(key=score, reverse=True)
        # De-duplicate same topic runs when a second topic is available, preserving relevance.
        if prefs.reduce_repetition:
            arranged: list[Post] = []
            remaining = posts[:]
            last_topic = None
            while remaining:
                pick_index = next((i for i, item in enumerate(remaining) if item.topic != last_topic), 0)
                item = remaining.pop(pick_index)
                arranged.append(item)
                last_topic = item.topic
            posts = arranged
    posts = posts[:limit]
    return {"items": [post_to_dict(db, post, user.id) for post in posts], "mode": mode, "limit": usage, "message": None}


@app.get("/api/posts/mine")
def my_posts(db: Session = Depends(get_db), user: User = Depends(current_user)):
    posts = list(db.scalars(select(Post).where(Post.user_id == user.id).order_by(Post.created_at.desc()).limit(100)).all())
    return {"items": [post_to_dict(db, x, user.id) for x in posts]}


@app.post("/api/moderation/check")
def check_moderation(body: ModerationInput, user: User = Depends(current_user)):
    assessment = moderation_assessment(body.content)
    if assessment.get("engine") == "local_rules_demo":
        assessment["disclaimer"] = "This local rule-based demonstration is not a trained multimodal moderation model and does not guarantee safety."
    elif assessment.get("engine") == "openai_moderation_api":
        assessment["disclaimer"] = "This is a model-assisted moderation signal. It can make mistakes and should be interpreted alongside MindFeed policy and appropriate review."
    else:
        assessment["disclaimer"] = "The configured moderation provider is unavailable; this content should receive human review before publication."
    return assessment


@app.post("/api/media/upload", status_code=201)
async def upload_media(file: UploadFile = File(...), user: User = Depends(current_user)):
    allowed = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov"}
    suffix = allowed.get((file.content_type or "").lower())
    if not suffix:
        raise HTTPException(status_code=415, detail="Upload a JPG, PNG, WEBP, GIF, MP4, WEBM, or MOV file.")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if not data:
        raise HTTPException(status_code=400, detail="The selected file is empty.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Files must be {MAX_UPLOAD_BYTES // (1024 * 1024)} MB or smaller.")
    # Basic signature checks reduce accidental/mislabelled content-type uploads.
    signatures = {".jpg": (b"\xff\xd8\xff",), ".png": (b"\x89PNG\r\n\x1a\n",), ".gif": (b"GIF87a", b"GIF89a"), ".webp": (b"RIFF",), ".mp4": (b"\x00\x00\x00",), ".mov": (b"\x00\x00\x00",), ".webm": (b"\x1aE\xdf\xa3",)}
    if not any(data.startswith(sig) for sig in signatures[suffix]):
        raise HTTPException(status_code=415, detail="The file content does not match its declared media type.")
    filename = f"{user.id}-{secrets.token_hex(16)}{suffix}"
    (UPLOAD_DIR / filename).write_bytes(data)
    return {"url": f"/uploads/{filename}", "media_type": "video" if suffix in {".mp4", ".webm", ".mov"} else "image", "size": len(data), "filename": filename}


@app.post("/api/posts", status_code=201)
def create_post(body: PostInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    prefs = get_preferences(db, user)
    if prefs.child_mode and not prefs.allow_public_posts:
        raise HTTPException(status_code=403, detail="Public posting is disabled by the active child-safety settings.")
    if prefs.child_mode and not prefs.allow_external_links and (body.format == "Link" or re.search(r"https?://\S+", body.content, re.I)):
        raise HTTPException(status_code=422, detail="External links are disabled by the active child-safety settings.")
    assessment = moderation_assessment(body.content)
    child_review_reason = "Child Mode posts require human review before publication." if prefs.child_mode else None
    post_status = "pending_review" if prefs.child_mode or assessment["status"] != "approved" else "approved"
    model_reason = "; ".join(assessment["reasons"]) if assessment["reasons"] else None
    moderation_reason = "; ".join(x for x in [child_review_reason, model_reason] if x) or None
    post = Post(user_id=user.id, content=body.content, topic=body.topic.strip(), format=body.format,
                image_url=body.image_url, status=post_status, moderation_reason=moderation_reason)
    db.add(post)
    db.commit()
    db.refresh(post)
    return {"post": post_to_dict(db, post, user.id), "moderation": assessment,
            "message": "Post published." if post.status == "approved" else "Post saved for moderator review."}


@app.patch("/api/posts/{post_id}")
def edit_post(post_id: int, body: PostInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(Post, post_id)
    if not post or post.user_id != user.id:
        raise HTTPException(status_code=404, detail="You can edit only your own post.")
    if post.status == "pending_review":
        raise HTTPException(status_code=409, detail="This post is already awaiting moderation review.")
    assessment = moderation_assessment(body.content)
    post.content = body.content
    post.topic = body.topic
    post.format = body.format
    post.image_url = body.image_url
    post.status = "approved" if assessment["status"] == "approved" else "pending_review"
    post.moderation_reason = assessment.get("message") if post.status != "approved" else None
    db.commit(); db.refresh(post)
    return {"post": post_to_dict(db, post, user.id), "message": "Post updated." if post.status == "approved" else "Updated post sent for moderation review."}


@app.delete("/api/posts/{post_id}", status_code=204)
def delete_post(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(Post, post_id)
    if not post or post.user_id != user.id:
        raise HTTPException(status_code=404, detail="You can delete only your own post.")
    db.delete(post); db.commit()
    return Response(status_code=204)


@app.post("/api/posts/{post_id}/like")
def toggle_like(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(Post, post_id)
    if not post or post.status != "approved":
        raise HTTPException(status_code=404, detail="This post is not available.")
    existing = db.scalar(select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == user.id))
    if existing:
        db.delete(existing)
        post.likes_count = max(0, post.likes_count - 1)
        liked = False
    else:
        db.add(PostLike(post_id=post_id, user_id=user.id))
        post.likes_count += 1
        liked = True
    db.commit()
    return {"liked": liked, "likes_count": post.likes_count}


@app.get("/api/posts/{post_id}/comments")
def list_comments(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(Post, post_id)
    if not post or post.status != "approved":
        raise HTTPException(status_code=404, detail="Post not found.")
    rows = db.scalars(select(PostComment).where(PostComment.post_id == post_id).order_by(PostComment.created_at.asc()).limit(100)).all()
    return {"items": [{"id": r.id, "content": r.content, "author": user_to_dict(r.author), "created_at": r.created_at.isoformat()} for r in rows]}


@app.post("/api/posts/{post_id}/comments", status_code=201)
def add_comment(post_id: int, body: dict[str, Any], db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(Post, post_id)
    content = body.get("content")
    if not post or post.status != "approved":
        raise HTTPException(status_code=404, detail="Post not found.")
    if not isinstance(content, str) or not 1 <= len(content.strip()) <= 1000:
        raise HTTPException(status_code=422, detail="Comments must contain 1–1000 characters.")
    row = PostComment(post_id=post_id, user_id=user.id, content=content.strip())
    db.add(row); db.commit(); db.refresh(row)
    return {"comment": {"id": row.id, "content": row.content, "author": user_to_dict(user), "created_at": row.created_at.isoformat()}}


@app.post("/api/posts/{post_id}/save")
def toggle_save(post_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(Post, post_id)
    if not post or post.status != "approved":
        raise HTTPException(status_code=404, detail="Post not found.")
    row = db.scalar(select(SavedPost).where(SavedPost.post_id == post_id, SavedPost.user_id == user.id))
    if row:
        db.delete(row); saved = False
    else:
        db.add(SavedPost(post_id=post_id, user_id=user.id)); saved = True
    db.commit()
    return {"saved": saved}


@app.get("/api/posts/saved")
def saved_posts(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(select(Post).join(SavedPost, SavedPost.post_id == Post.id).where(SavedPost.user_id == user.id, Post.status == "approved").order_by(SavedPost.created_at.desc()).limit(60)).all()
    return {"items": [post_to_dict(db, row, user.id) for row in rows]}


@app.post("/api/users/{target_user_id}/follow")
def toggle_follow(target_user_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if target_user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot follow your own account.")
    target = db.get(User, target_user_id)
    if not target or not target.is_active:
        raise HTTPException(status_code=404, detail="User not found.")
    row = db.scalar(select(UserFollow).where(UserFollow.follower_id == user.id, UserFollow.followed_id == target_user_id))
    if row:
        db.delete(row); following = False
    else:
        db.add(UserFollow(follower_id=user.id, followed_id=target_user_id)); following = True
    db.commit()
    return {"following": following, "followers_count": db.scalar(select(func.count(UserFollow.id)).where(UserFollow.followed_id == target_user_id)) or 0}


@app.get("/api/users/{target_user_id}/profile")
def public_profile(target_user_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    target = db.get(User, target_user_id)
    if not target or not target.is_active:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user": user_to_dict(target), "followers_count": db.scalar(select(func.count(UserFollow.id)).where(UserFollow.followed_id == target_user_id)) or 0, "following_count": db.scalar(select(func.count(UserFollow.id)).where(UserFollow.follower_id == target_user_id)) or 0, "following": bool(db.scalar(select(UserFollow.id).where(UserFollow.follower_id == user.id, UserFollow.followed_id == target_user_id).limit(1))), "posts": [post_to_dict(db, p, user.id) for p in db.scalars(select(Post).where(Post.user_id == target_user_id, Post.status == "approved").order_by(Post.created_at.desc()).limit(30)).all()]}


@app.post("/api/posts/{post_id}/feedback")
def post_feedback(post_id: int, body: FeedbackInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(Post, post_id)
    if not post or post.status != "approved":
        raise HTTPException(status_code=404, detail="This post is not available.")
    db.add(FeedbackEvent(user_id=user.id, post_id=post.id, action=body.action, topic=post.topic))
    prefs = get_preferences(db, user)
    if body.action == "block_topic":
        existing = {x.casefold() for x in (prefs.blocked_topics or [])}
        if post.topic.casefold() not in existing:
            prefs.blocked_topics = list(prefs.blocked_topics or []) + [post.topic]
    elif body.action == "show_more":
        if post.topic.casefold() not in {x.casefold() for x in (prefs.interests or [])}:
            prefs.interests = list(prefs.interests or []) + [post.topic]
    db.commit()
    return {"message": "Feedback saved and your feed preferences updated where applicable.", "preferences": preferences_to_dict(prefs)}


@app.get("/api/search")
def search_posts(q: str = Query(min_length=1, max_length=120), db: Session = Depends(get_db), user: User = Depends(current_user)):
    cleaned = q.strip()
    if len(cleaned) < 1:
        return {"items": []}
    matches = list(db.scalars(select(Post).where(Post.status == "approved", (Post.content.ilike(f"%{cleaned}%") | Post.topic.ilike(f"%{cleaned}%"))).order_by(Post.created_at.desc()).limit(30)).all())
    prefs = get_preferences(db, user)
    blocked = {str(x).casefold() for x in (prefs.blocked_topics or [])}
    matches = [p for p in matches if p.topic.casefold() not in blocked]
    return {"items": [post_to_dict(db, p, user.id) for p in matches], "query": cleaned}


@app.post("/api/truthcheck")
def create_fact_check(body: FactCheckInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    assessment = assess_claim(body.claim)
    item = FactCheck(user_id=user.id, claim=body.claim.strip(), result_status=assessment["status"], confidence=assessment["confidence"], explanation=assessment["explanation"], evidence=assessment["evidence"], source_mode=assessment["source_mode"])
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "claim": item.claim, "status": item.result_status, "confidence": item.confidence,
            "explanation": item.explanation, "evidence": item.evidence, "source_mode": item.source_mode,
            "limitations": assessment["limitations"], "created_at": item.created_at.isoformat()}


@app.get("/api/truthcheck/history")
def fact_check_history(db: Session = Depends(get_db), user: User = Depends(current_user)):
    items = list(db.scalars(select(FactCheck).where(FactCheck.user_id == user.id).order_by(FactCheck.created_at.desc()).limit(20)).all())
    return {"items": [{"id": x.id, "claim": x.claim, "status": x.result_status, "confidence": x.confidence, "explanation": x.explanation, "evidence": x.evidence, "source_mode": x.source_mode, "created_at": x.created_at.isoformat()} for x in items]}


@app.get("/api/trust/overview")
def trust_overview(db: Session = Depends(get_db), user: User = Depends(current_user)):
    count_posts = db.scalar(select(func.count(Post.id)).where(Post.user_id == user.id)) or 0
    verifications = list(db.scalars(select(VerificationRequest).where(VerificationRequest.user_id == user.id).order_by(VerificationRequest.created_at.desc()).limit(5)).all())
    total_days = max(0, (datetime.now(timezone.utc).date() - user.created_at.date()).days) if user.created_at else 0
    # This is an explainable account-signal summary, not identity verification.
    signals = [
        {"label": "Email account", "state": "Account registered", "status": "complete", "note": "MindFeed account exists; email ownership has not been independently verified."},
        {"label": "Account activity", "state": "Getting started" if count_posts < 3 else "Active contributor", "status": "info", "note": f"{count_posts} posts published from this account."},
        {"label": "Profile details", "state": "Profile present" if len(user.name) >= 2 else "Incomplete", "status": "complete" if len(user.name) >= 2 else "pending", "note": "Profile completeness is a weak signal, not proof of identity."},
    ]
    return {"account": user_to_dict(user), "account_age_days": total_days, "posts_published": count_posts,
            "trust_status": "not_verified", "risk_score": None,
            "summary": "No independent identity verification has been completed. MindFeed avoids inventing a trust score from insufficient data.",
            "signals": signals,
            "verification_requests": [{"id": v.id, "type": v.verification_type, "status": v.status, "created_at": v.created_at.isoformat()} for v in verifications]}


@app.post("/api/trust/verification-requests", status_code=201)
def request_verification(body: VerifyInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    pending = db.scalar(select(VerificationRequest).where(VerificationRequest.user_id == user.id, VerificationRequest.status == "pending_review"))
    if pending:
        raise HTTPException(status_code=409, detail="You already have a verification request awaiting review.")
    req = VerificationRequest(user_id=user.id, verification_type=body.verification_type, note=body.note.strip())
    db.add(req)
    db.commit()
    db.refresh(req)
    return {"id": req.id, "status": req.status, "message": "Your request has been recorded. No verification badge is granted automatically."}


@app.get("/api/trust/bot-assessment")
def bot_assessment(db: Session = Depends(get_db), user: User = Depends(current_user)):
    posts = list(db.scalars(select(Post).where(Post.user_id == user.id).order_by(Post.created_at.desc()).limit(40)).all())
    if len(posts) < 3:
        return {"risk_score": None, "confidence_label": "Not enough signal", "label": "Insufficient behavioral data",
                "explanation": "BotShield needs more posting and interaction history before it can responsibly estimate behavioral patterns. A sparse account is not evidence of automation.",
                "signals": [{"label": "Posting pattern", "status": "neutral"}, {"label": "Repeated content", "status": "neutral"}, {"label": "Coordinated activity", "status": "neutral"}],
                "method": "Local demo heuristics; no external or platform-wide behavioral data is available."}
    texts = [p.content.casefold().strip() for p in posts]
    duplicate_ratio = 1 - (len(set(texts)) / max(1, len(texts)))
    topic_counts: dict[str, int] = {}
    for p in posts:
        topic_counts[p.topic] = topic_counts.get(p.topic, 0) + 1
    repeated_topic_ratio = max(topic_counts.values()) / len(posts)
    score = min(85, round(duplicate_ratio * 65 + max(0, repeated_topic_ratio - .7) * 30))
    signals = [
        {"label": "Repeated content", "status": "flag" if duplicate_ratio > .15 else "positive"},
        {"label": "Topic concentration", "status": "flag" if repeated_topic_ratio > .8 else "positive"},
        {"label": "Posting pattern", "status": "neutral"},
    ]
    return {"risk_score": score, "confidence_label": "Low confidence", "label": "Pattern assessment only",
            "explanation": "This estimate uses only the account's recent MindFeed posts. It does not prove that the account is automated; platform-wide coordination and timing evidence are unavailable in this demo.",
            "signals": signals, "method": "Local heuristics over recent posts; no model inference."}


@app.post("/api/reports", status_code=201)
def create_report(body: ReportInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if body.target_type == "post" and body.target_id:
        target = db.get(Post, body.target_id)
        if not target:
            raise HTTPException(status_code=404, detail="The reported post was not found.")
    if body.target_type == "account" and body.target_id and not db.get(User, body.target_id):
        raise HTTPException(status_code=404, detail="The reported account was not found.")
    report = Report(reporter_id=user.id, target_type=body.target_type, target_id=body.target_id, reason=body.reason.strip(), details=body.details.strip())
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"id": report.id, "status": report.status, "message": "Report submitted for review."}


@app.get("/api/reports/mine")
def reports_mine(db: Session = Depends(get_db), user: User = Depends(current_user)):
    items = list(db.scalars(select(Report).where(Report.reporter_id == user.id).order_by(Report.created_at.desc()).limit(100)).all())
    return {"items": [{"id": x.id, "target_type": x.target_type, "target_id": x.target_id, "reason": x.reason, "details": x.details, "status": x.status, "created_at": x.created_at.isoformat()} for x in items]}


@app.post("/api/appeals", status_code=201)
def create_appeal(body: AppealInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    post = db.get(Post, body.post_id)
    if not post or post.user_id != user.id:
        raise HTTPException(status_code=404, detail="You can appeal only a post owned by your account.")
    if post.status not in {"pending_review", "rejected"}:
        raise HTTPException(status_code=409, detail="This post does not currently have a decision that can be appealed.")
    open_existing = db.scalar(select(Appeal).where(Appeal.post_id == post.id, Appeal.user_id == user.id, Appeal.status == "open"))
    if open_existing:
        raise HTTPException(status_code=409, detail="An appeal for this post is already open.")
    item = Appeal(user_id=user.id, post_id=post.id, reason=body.reason.strip())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "status": item.status, "message": "Appeal submitted."}


@app.get("/api/appeals/mine")
def appeals_mine(db: Session = Depends(get_db), user: User = Depends(current_user)):
    items = list(db.scalars(select(Appeal).where(Appeal.user_id == user.id).order_by(Appeal.created_at.desc()).limit(100)).all())
    return {"items": [{"id": x.id, "post_id": x.post_id, "reason": x.reason, "status": x.status, "created_at": x.created_at.isoformat()} for x in items]}


@app.get("/api/moderation/queue")
def moderation_queue(db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    posts = list(db.scalars(select(Post).where(Post.status == "pending_review").order_by(Post.created_at.asc()).limit(100)).all())
    reports = list(db.scalars(select(Report).where(Report.status == "open").order_by(Report.created_at.asc()).limit(100)).all())
    return {"posts": [{**post_to_dict(db, p, user.id), "moderation_reason": p.moderation_reason} for p in posts],
            "reports": [{"id": r.id, "target_type": r.target_type, "target_id": r.target_id, "reason": r.reason, "details": r.details, "status": r.status, "created_at": r.created_at.isoformat()} for r in reports]}


@app.post("/api/moderation/posts/{post_id}/decision")
def review_post(post_id: int, body: ReviewInput, db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    post = db.get(Post, post_id)
    if not post or post.status != "pending_review":
        raise HTTPException(status_code=404, detail="Pending post not found.")
    post.status = body.decision
    post.moderation_reason = body.note.strip() or ("Approved by moderator." if body.decision == "approved" else "Rejected by moderator.")
    db.commit()
    return {"id": post.id, "status": post.status, "message": "Review decision saved."}


@app.post("/api/moderation/reports/{report_id}/resolve")
def resolve_report(report_id: int, body: dict[str, str], db: Session = Depends(get_db), user: User = Depends(require_moderator)):
    report = db.get(Report, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")
    report.status = "resolved"
    report.reviewer_note = (body.get("note") or "Reviewed.")[:1000]
    report.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": report.id, "status": report.status, "message": "Report marked as reviewed."}


def _family_link_dict(db: Session, row: GuardianLink) -> dict[str, Any]:
    guardian = db.get(User, row.guardian_user_id)
    child = db.get(User, row.child_user_id)
    return {
        "id": row.id, "status": row.status,
        "guardian": user_to_dict(guardian) if guardian else None,
        "child": user_to_dict(child) if child else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "responded_at": row.responded_at.isoformat() if row.responded_at else None,
    }


@app.get("/api/family/links")
def family_links(db: Session = Depends(get_db), user: User = Depends(current_user)):
    incoming = list(db.scalars(select(GuardianLink).where(GuardianLink.child_user_id == user.id).order_by(GuardianLink.created_at.desc()).limit(50)).all())
    outgoing = list(db.scalars(select(GuardianLink).where(GuardianLink.guardian_user_id == user.id).order_by(GuardianLink.created_at.desc()).limit(50)).all())
    prefs = get_preferences(db, user)
    return {"profile_type": prefs.profile_type, "incoming": [_family_link_dict(db, x) for x in incoming],
            "outgoing": [_family_link_dict(db, x) for x in outgoing],
            "active_children": [_family_link_dict(db, x) for x in outgoing if x.status == "active"]}


@app.post("/api/family/link-requests", status_code=201)
def create_family_link(body: FamilyLinkRequestInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    guardian_prefs = get_preferences(db, user)
    if guardian_prefs.profile_type != "parent":
        raise HTTPException(status_code=403, detail="Set your profile type to Parent in Settings before requesting a family link.")
    child = db.scalar(select(User).where(User.email == str(body.child_email).lower().strip()))
    if not child:
        raise HTTPException(status_code=404, detail="No MindFeed account was found for that email. The child must register and choose Child profile first.")
    if child.id == user.id:
        raise HTTPException(status_code=422, detail="You cannot link an account to itself.")
    child_prefs = get_preferences(db, child)
    if child_prefs.profile_type != "child" or not child_prefs.child_mode:
        raise HTTPException(status_code=409, detail="The target account must select Child profile before a family link can be requested.")
    existing = db.scalar(select(GuardianLink).where(GuardianLink.guardian_user_id == user.id, GuardianLink.child_user_id == child.id))
    if existing:
        if existing.status in {"pending", "active"}:
            raise HTTPException(status_code=409, detail="A pending or active family link already exists.")
        existing.status = "pending"
        existing.created_at = datetime.now(timezone.utc)
        existing.responded_at = None
        row = existing
    else:
        row = GuardianLink(guardian_user_id=user.id, child_user_id=child.id, status="pending")
        db.add(row)
    db.commit()
    db.refresh(row)
    return {"link": _family_link_dict(db, row), "message": "Request sent. The child account must accept before parent controls become active."}


@app.post("/api/family/link-requests/{link_id}/respond")
def respond_family_link(link_id: int, body: FamilyLinkResponseInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(GuardianLink, link_id)
    if not row or row.child_user_id != user.id:
        raise HTTPException(status_code=404, detail="Family-link request not found.")
    if row.status != "pending":
        raise HTTPException(status_code=409, detail="This family-link request has already been answered.")
    row.status = "active" if body.accept else "rejected"
    row.responded_at = datetime.now(timezone.utc)
    if body.accept:
        prefs = get_preferences(db, user)
        prefs.profile_type = "child"
        prefs.child_mode = True
        prefs.content_restriction_level = "strict"
        prefs.allow_external_links = False
    db.commit()
    return {"link": _family_link_dict(db, row), "message": "Family link accepted." if body.accept else "Family link declined."}


def _authorized_family_child(db: Session, guardian: User, child_id: int) -> tuple[User, UserPreference]:
    link = db.scalar(select(GuardianLink).where(GuardianLink.guardian_user_id == guardian.id, GuardianLink.child_user_id == child_id, GuardianLink.status == "active"))
    if not link:
        raise HTTPException(status_code=404, detail="No active parent-child link was found.")
    child = db.get(User, child_id)
    if not child:
        raise HTTPException(status_code=404, detail="Child account not found.")
    return child, get_preferences(db, child)


@app.delete("/api/family/links/{link_id}")
def revoke_family_link(link_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(GuardianLink, link_id)
    if not row or user.id not in {row.guardian_user_id, row.child_user_id}:
        raise HTTPException(status_code=404, detail="Family link not found.")
    if row.status not in {"pending", "active"}:
        raise HTTPException(status_code=409, detail="This family link is already inactive.")
    row.status = "revoked"
    row.responded_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": row.id, "status": row.status, "message": "Family link ended. Either account can request a new link later."}


@app.get("/api/family/children/{child_id}/settings")
def read_child_settings(child_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    child, prefs = _authorized_family_child(db, user, child_id)
    return {"child": user_to_dict(child), "preferences": preferences_to_dict(prefs)}


@app.put("/api/family/children/{child_id}/settings")
def update_child_settings(child_id: int, body: ParentalSettingsInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    child, prefs = _authorized_family_child(db, user, child_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(prefs, key, value)
    prefs.profile_type = "child"
    prefs.child_mode = True
    if prefs.content_restriction_level == "strict":
        prefs.allow_external_links = False
    db.commit()
    db.refresh(prefs)
    return {"child": user_to_dict(child), "preferences": preferences_to_dict(prefs), "message": "Child safety settings saved."}


@app.get("/api/usage/summary")
def usage_summary_api(db: Session = Depends(get_db), user: User = Depends(current_user)):
    return usage_summary(db, user)


@app.post("/api/usage/start", status_code=201)
def usage_start(db: Session = Depends(get_db), user: User = Depends(current_user)):
    existing = db.scalar(select(UsageSession).where(UsageSession.user_id == user.id, UsageSession.ended_at.is_(None)).order_by(UsageSession.started_at.desc()).limit(1))
    if existing and existing.last_seen_at and (datetime.now(timezone.utc) - (existing.last_seen_at.replace(tzinfo=timezone.utc) if existing.last_seen_at.tzinfo is None else existing.last_seen_at)).total_seconds() < 600:
        return {"session_id": existing.id, **usage_summary(db, user)}
    if existing:
        existing.ended_at = datetime.now(timezone.utc)
    row = UsageSession(user_id=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"session_id": row.id, **usage_summary(db, user)}


@app.post("/api/usage/tick")
def usage_tick(body: UsageTickInput, db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(UsageSession, body.session_id)
    if not row or row.user_id != user.id or row.ended_at is not None:
        raise HTTPException(status_code=404, detail="Active usage session not found.")
    now = datetime.now(timezone.utc)
    row.active_seconds += body.active_seconds
    row.last_seen_at = now
    today = now.date()
    daily = db.scalar(select(UsageDaily).where(UsageDaily.user_id == user.id, UsageDaily.usage_date == today))
    if not daily:
        daily = UsageDaily(user_id=user.id, usage_date=today, active_seconds=0)
        db.add(daily)
    daily.active_seconds += body.active_seconds
    db.flush()
    current = usage_summary(db, user)
    if current["session_active_seconds"] >= current["session_limit_seconds"] or current["daily_active_seconds"] >= current["daily_limit_seconds"]:
        row.ended_at = now
    db.commit()
    return usage_summary(db, user)


@app.post("/api/usage/end")
def usage_end(body: dict[str, int], db: Session = Depends(get_db), user: User = Depends(current_user)):
    row = db.get(UsageSession, int(body.get("session_id", 0)))
    if not row or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Usage session not found.")
    if row.ended_at is None:
        row.ended_at = datetime.now(timezone.utc)
        db.commit()
    return usage_summary(db, user)


@app.get("/api/profile/summary")
def profile_summary(db: Session = Depends(get_db), user: User = Depends(current_user)):
    prefs = get_preferences(db, user)
    stats = dashboard_stats(db, user)
    return {"user": user_to_dict(user), "preferences": preferences_to_dict(prefs), "stats": stats, "usage": usage_summary(db, user)}


# Root-level machine-readable site resources for production. The frontend dev server proxies these paths.
@app.get("/robots.txt", include_in_schema=False, response_class=PlainTextResponse)
def robots_txt():
    private_paths = [
        "/api/", "/signin", "/register", "/feed", "/truth-check", "/trust-center",
        "/review-center", "/my-posts", "/distraction-shield", "/study-mode", "/timeguard",
        "/settings", "/search", "/activity", "/family-controls",
    ]
    rules = "".join(f"Disallow: {path}\n" for path in private_paths)
    return f"User-agent: *\nAllow: /\n{rules}Sitemap: {PUBLIC_SITE_URL}/sitemap.xml\n"


@app.get("/llms.txt", include_in_schema=False, response_class=PlainTextResponse)
def llms_txt():
    return "# MindFeed\n\nMindFeed is an adaptive, explainable, user-controlled social media platform focused on account trust, pre-publication safety, evidence-aware claim assessment, personalized discovery, and digital well-being.\n\n## Public information\n- / : Product overview\n- /about : Product principles and limitations\n- /privacy : Privacy principles\n\nAuthenticated feeds, account details, moderation records, and personal settings are private and should not be indexed or summarized.\n\nAI limitations: demonstration-mode moderation and fact-checking are not substitutes for independent review or live evidence retrieval.\n"


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml():
    pages = ["/", "/about", "/privacy"]
    from xml.sax.saxutils import escape as xml_escape
    urls = "".join(f"<url><loc>{xml_escape(PUBLIC_SITE_URL + path)}</loc></url>" for path in pages)
    return Response(content=f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>', media_type="application/xml")


# If a production frontend build is present, serve it from the FastAPI origin.
DIST_DIR = ROOT_DIR / "frontend" / "dist"
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/favicon.svg", include_in_schema=False)
    def favicon():
        file = DIST_DIR / "favicon.svg"
        if file.exists():
            return FileResponse(file)
        raise HTTPException(status_code=404)

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_frontend(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        candidate = (DIST_DIR / full_path).resolve()
        if candidate.is_file() and str(candidate).startswith(str(DIST_DIR.resolve())):
            return FileResponse(candidate)
        index = DIST_DIR / "index.html"
        if index.exists():
            # Known client routes use the SPA entry point. Unknown paths receive that same
            # branded client-side 404 experience but preserve an HTTP 404 status for crawlers.
            known_routes = {
                "", "about", "privacy", "signin", "register", "feed", "truth-check",
                "trust-center", "review-center", "my-posts", "distraction-shield",
                "study-mode", "timeguard", "settings", "search", "activity", "family-controls", "404.html",
            }
            clean_path = full_path.strip("/")
            is_known = clean_path in known_routes or clean_path.startswith("search/")
            return FileResponse(index, status_code=200 if is_known else 404)
        raise HTTPException(status_code=404, detail="Page not found")
