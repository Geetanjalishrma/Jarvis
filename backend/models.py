"""
models.py — Complete final version
Includes all original tables + DailySchedule + ChatSession + ChatMessage
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Text, ForeignKey
try:
    from sqlalchemy.orm import declarative_base      # SQLAlchemy 2.x (no deprecation warning)
except ImportError:
    from sqlalchemy.ext.declarative import declarative_base  # SQLAlchemy 1.4
from datetime import datetime

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id         = Column(Integer, primary_key=True)
    name       = Column(String)
    email      = Column(String, unique=True)
    password   = Column(String)
    semester   = Column(Integer, default=1)
    branch     = Column(String, nullable=True)
    university = Column(String, nullable=True)      # profile: University / college
    course     = Column(String, nullable=True)      # profile: e.g. "B.Tech · Computer Science"
    student_id = Column(String, nullable=True)      # profile: Student ID
    avatar     = Column(Text,   nullable=True)      # profile photo as a small data-URL
    prefs      = Column(Text,   nullable=True)      # JSON: palette, notification toggles, goals…
    created_at = Column(DateTime, default=datetime.utcnow)


class AttendanceSubject(Base):
    __tablename__ = "attendance_subjects"
    id             = Column(Integer, primary_key=True)
    user_id        = Column(Integer, ForeignKey("users.id"))
    name           = Column(String)
    professor      = Column(String, nullable=True)
    min_percentage = Column(Float, default=75)
    total_planned  = Column(Integer, default=60)
    credits        = Column(Float, default=4)
    schedule       = Column(String, nullable=True)
    room           = Column(String, nullable=True)   # e.g. "Room 302"
    created_at     = Column(DateTime, default=datetime.utcnow)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"
    id         = Column(Integer, primary_key=True)
    subject_id = Column(Integer, ForeignKey("attendance_subjects.id"))
    user_id    = Column(Integer, ForeignKey("users.id"))
    date       = Column(Date)
    present    = Column(Boolean, default=True)
    status     = Column(String, default="present")  # present/absent/cancelled
    period     = Column(Integer, nullable=True)     # timetable period (P1, P2…) — None on old rows
    created_at = Column(DateTime, default=datetime.utcnow)


class TimetableSlot(Base):
    __tablename__ = "timetable_slots"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    day        = Column(String)
    period     = Column(Integer)
    subject_id = Column(Integer, ForeignKey("attendance_subjects.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class DailySchedule(Base):
    """How many periods each day — entered once during setup."""
    __tablename__ = "daily_schedule"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    day        = Column(String)    # Mon/Tue/Wed/Thu/Fri/Sat
    periods    = Column(Integer)   # total periods that day
    created_at = Column(DateTime, default=datetime.utcnow)


class Score(Base):
    __tablename__ = "scores"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    subject    = Column(String)
    exam_type  = Column(String)
    score      = Column(Float)
    total      = Column(Float)
    percentage = Column(Float)
    date       = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow)


class Streak(Base):
    __tablename__ = "streaks"
    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id"))
    name        = Column(String)
    description = Column(String, nullable=True)
    color       = Column(String, default="#40916C")
    active      = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)


class StreakCheckIn(Base):
    __tablename__ = "streak_checkins"
    id         = Column(Integer, primary_key=True)
    streak_id  = Column(Integer, ForeignKey("streaks.id"))
    user_id    = Column(Integer, ForeignKey("users.id"))
    date       = Column(Date)
    done       = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Expense(Base):
    __tablename__ = "expenses"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    category   = Column(String)
    amount     = Column(Float)
    note       = Column(String, nullable=True)
    date       = Column(Date)
    kind       = Column(String, default="expense")   # "expense" | "income"
    created_at = Column(DateTime, default=datetime.utcnow)


class MonthlyBudget(Base):
    __tablename__ = "monthly_budgets"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    month      = Column(Integer)
    year       = Column(Integer)
    amount     = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)


class CareerGoal(Base):
    __tablename__ = "career_goals"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    direction  = Column(String)
    item       = Column(String)
    status     = Column(String, default="pending")
    note       = Column(String, nullable=True)
    due_label  = Column(String, nullable=True)       # e.g. "Feb – Apr"
    created_at = Column(DateTime, default=datetime.utcnow)


class WeeklyCheckIn(Base):
    __tablename__ = "weekly_checkins"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    week_start = Column(Date)
    mood       = Column(Integer)
    win        = Column(Text, nullable=True)
    improve    = Column(Text, nullable=True)
    energy     = Column(Integer, nullable=True)      # 1–10 slider
    reflection = Column(Text, nullable=True)         # "what's taking up the most space"
    created_at = Column(DateTime, default=datetime.utcnow)


class ChatSession(Base):
    """One conversation — like a Claude or ChatGPT chat with a title."""
    __tablename__ = "chat_sessions"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    title      = Column(String, default="New chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)


class ChatMessage(Base):
    """One message in a chat session. role = user or assistant."""
    __tablename__ = "chat_messages"
    id         = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    user_id    = Column(Integer, ForeignKey("users.id"))
    role       = Column(String)
    content    = Column(Text)
    tokens     = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


# ══════════════════════════════════════════════
# NEW TABLES (Figma redesign)
# ══════════════════════════════════════════════

class Task(Base):
    """Priority list on the dashboard — assignments, to-dos and deadlines."""
    __tablename__ = "tasks"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    title      = Column(String)
    subject    = Column(String, nullable=True)
    due_date   = Column(Date, nullable=True)
    due_time   = Column(String, nullable=True)       # "HH:MM"
    priority   = Column(String, default="medium")    # low | medium | high
    done       = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Skill(Base):
    """Career 'Skill profile' — a skill and how strong you are at it (0–100)."""
    __tablename__ = "skills"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    name       = Column(String)
    level      = Column(Integer, default=50)
    created_at = Column(DateTime, default=datetime.utcnow)


class RecurringPayment(Base):
    """Bills / subscriptions that repeat every month ('Next payment' on Expenses)."""
    __tablename__ = "recurring_payments"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    name       = Column(String)
    amount     = Column(Float)
    due_day    = Column(Integer, default=1)          # day of month, 1–28
    category   = Column(String, default="subscription")
    active     = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class StudySession(Base):
    """Minutes of focused study logged by the 'Study with me' timer."""
    __tablename__ = "study_sessions"
    id         = Column(Integer, primary_key=True)
    user_id    = Column(Integer, ForeignKey("users.id"))
    date       = Column(Date)
    minutes    = Column(Float, default=0)
    label      = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
