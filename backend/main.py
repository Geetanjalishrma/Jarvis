"""
main.py — All Jarvis API routes

Run with: uvicorn main:app --reload
API docs: http://localhost:8000/docs
"""
import os
import shutil
import tempfile
from datetime import date, datetime, timedelta
from typing import Optional, List
from collections import defaultdict

from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from pydantic import BaseModel

from database import get_db
from models import (User, AttendanceSubject, AttendanceRecord,
                    Score, Streak, StreakCheckIn, Expense,
                    MonthlyBudget, CareerGoal, WeeklyCheckIn,
                    TimetableSlot, DailySchedule,
                    ChatSession, ChatMessage)
from auth import hash_password, verify_password, create_token, get_current_user
from intelligence import (
    calculate_safe_bunks, calculate_streak, predict_cgpa,
    detect_burnout, attendance_marks_correlation,
    streak_marks_correlation, stress_spending_insight,
    placement_readiness_score, mood_performance_correlation,
    semester_timeline
)
from model import (
    train_all_models, predict_all_subjects,
    predict_next_score, predict_at_risk,
    log_prediction, resolve_prediction,
    get_model_status, get_accuracy_summary
)
from ai_tools import (
    build_student_context, chat_with_gemini,
    transcribe_audio, parse_voice_command,
    analyze_checkin_text, check_ai_tools_status
)

from extras import router as extras_router, user_public

app = FastAPI(title="Jarvis API", version="3.0")

# Allowed websites. Local dev ports are always allowed; when deployed, set CORS_ORIGINS to your
# frontend address (comma-separated for more than one), e.g. https://jarvis-app.vercel.app
_LOCAL_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:5174", "http://127.0.0.1:5174",
    "http://localhost:5175", "http://127.0.0.1:5175",
    "http://localhost:3000", "http://127.0.0.1:3000",
]
_EXTRA_ORIGINS = [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_LOCAL_ORIGINS + _EXTRA_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# New Figma-redesign features: profile, preferences, tasks, skills, recurring payments,
# study sessions, reports, calendar export, CSV import …  (see extras.py)
app.include_router(extras_router)


def _spend_only(expenses):
    """Income rows are stored in the same table — leave them out of 'spending' maths."""
    return [e for e in expenses if (getattr(e, "kind", None) or "expense") != "income"]


def _record_status(r) -> str:
    """Old rows have no status -> derive it from `present`."""
    return r.status if r.status in ("present", "absent", "cancelled") else ("present" if r.present else "absent")


def _count_attendance(records):
    """-> (attended, held, cancelled). Cancelled classes don't count against the student."""
    attended  = sum(1 for r in records if _record_status(r) == "present")
    cancelled = sum(1 for r in records if _record_status(r) == "cancelled")
    held      = len(records) - cancelled
    return attended, held, cancelled


@app.get("/")
def root():
    return {"app": "Jarvis API", "status": "running", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


# ══════════════════════════════════════════════
# SCHEMAS
# ══════════════════════════════════════════════

class RegisterIn(BaseModel):
    name     : str
    email    : str
    password : str
    semester : Optional[int] = 1
    branch   : Optional[str] = None

class AttendanceSubjectIn(BaseModel):
    name           : str
    professor      : Optional[str] = None
    min_percentage : float = 75
    total_planned  : int = 60
    credits        : float = 4
    schedule       : Optional[str] = None
    room           : Optional[str] = None

class AttendanceSubjectUpdate(BaseModel):
    """Every field optional -> change only what you send (edit one thing, not everything)."""
    name           : Optional[str]   = None
    professor      : Optional[str]   = None
    min_percentage : Optional[float] = None
    total_planned  : Optional[int]   = None
    credits        : Optional[float] = None
    schedule       : Optional[str]   = None
    room           : Optional[str]   = None

class AttendanceMarkIn(BaseModel):
    subject_id : int
    date       : date
    present    : bool
    status     : Optional[str] = None      # "present" | "absent" | "cancelled"
    period     : Optional[int] = None      # timetable period (1, 2, 3…) so P1 and P4 are tracked separately

class ScoreIn(BaseModel):
    subject   : str
    exam_type : str
    score     : float
    total     : float
    date      : date

class StreakIn(BaseModel):
    name        : str
    description : Optional[str] = None
    color       : Optional[str] = "#40916C"

class CheckInIn(BaseModel):
    date : date

class ExpenseIn(BaseModel):
    category : str
    amount   : float
    note     : Optional[str] = None
    date     : date
    kind     : Optional[str] = "expense"      # "expense" | "income"

class BudgetIn(BaseModel):
    month  : int
    year   : int
    amount : float

class CareerGoalIn(BaseModel):
    direction : str
    item      : str
    note      : Optional[str] = None
    due_label : Optional[str] = None

class WeeklyCheckInIn(BaseModel):
    week_start : date
    mood       : int
    win        : Optional[str] = None
    improve    : Optional[str] = None
    energy     : Optional[int] = None
    reflection : Optional[str] = None

class SemesterIn(BaseModel):
    start : date
    end   : date


# ══════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════

@app.post("/auth/register")
def register(data: RegisterIn, db: Session = Depends(get_db)):
    name  = (data.name or "").strip()
    email = (data.email or "").strip().lower()
    if not name:
        raise HTTPException(400, "Please enter your name")
    if "@" not in email or "." not in email.split("@")[-1] or " " in email:
        raise HTTPException(400, "Please enter a valid email address")
    if len(data.password or "") < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(400, "Email already registered — try signing in")
    user = User(
        name     = name,
        email    = email,                                   # always stored lower-case
        password = hash_password(data.password),
        semester = max(1, min(12, data.semester or 1)),
        branch   = (data.branch or "").strip() or None
    )
    db.add(user)
    db.commit()                                             # <- the account is saved to jarvis.db here
    db.refresh(user)
    return {"token": create_token(user.id), "name": user.name, "id": user.id}


@app.post("/auth/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    email = (form.username or "").strip().lower()
    user  = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(form.password, user.password):
        raise HTTPException(401, "Wrong email or password")
    return {
        "access_token": create_token(user.id),
        "token_type"  : "bearer",
        "name"        : user.name,
        "semester"    : user.semester,
        "branch"      : user.branch
    }


@app.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return user_public(user)


# ══════════════════════════════════════════════
# DASHBOARD — everything in one call
# ══════════════════════════════════════════════

@app.get("/dashboard")
def dashboard(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today     = date.today()
    week_ago  = today - timedelta(days=7)
    month_ago = today - timedelta(days=30)

    # Attendance
    subjects     = db.query(AttendanceSubject).filter(AttendanceSubject.user_id == user.id).all()
    all_records  = db.query(AttendanceRecord).filter(AttendanceRecord.user_id == user.id).all()
    att_summary  = []
    danger_subs  = []

    for s in subjects:
        records  = [r for r in all_records if r.subject_id == s.id]
        attended, held, _ = _count_attendance(records)
        result   = calculate_safe_bunks(attended, held, s.total_planned, s.min_percentage)
        att_summary.append({"name": s.name, **result})
        if result["status"] in ("danger", "careful"):
            danger_subs.append(s.name)

    # Scores
    scores    = db.query(Score).filter(Score.user_id == user.id).all()
    avg_score = round(sum(s.percentage for s in scores) / len(scores), 1) if scores else 0

    # Streaks
    streaks      = db.query(Streak).filter(Streak.user_id == user.id, Streak.active == True).all()
    all_checkins = db.query(StreakCheckIn).filter(StreakCheckIn.user_id == user.id).all()
    streak_data  = []
    broken_count = 0

    for st in streaks:
        checkins      = [c for c in all_checkins if c.streak_id == st.id and c.done]
        checkin_dates = [c.date for c in checkins]
        stats         = calculate_streak(checkin_dates, [])
        done_today    = any(str(c.date) == str(today) for c in checkins)
        streak_data.append({
            "id"        : st.id,
            "name"      : st.name,
            "color"     : st.color,
            "done_today": done_today,
            **stats
        })
        if stats["status"] == "broken":
            broken_count += 1

    # Expenses
    month_start = today.replace(day=1)
    expenses    = _spend_only(db.query(Expense).filter(Expense.user_id == user.id, Expense.date >= month_start).all())
    total_spent = sum(e.amount for e in expenses)

    budget = db.query(MonthlyBudget).filter(
        MonthlyBudget.user_id == user.id,
        MonthlyBudget.month == today.month,
        MonthlyBudget.year  == today.year
    ).first()

    # Burnout check
    all_expenses = _spend_only(db.query(Expense).filter(Expense.user_id == user.id).all())
    all_weekly   = db.query(WeeklyCheckIn).filter(WeeklyCheckIn.user_id == user.id).all()
    burnout      = detect_burnout(all_records, all_checkins, all_expenses, all_weekly, scores)

    return {
        "user"           : {"name": user.name, "semester": user.semester},
        "attendance"     : att_summary,
        "danger_subjects": danger_subs,
        "avg_score"      : avg_score,
        "streaks"        : streak_data,
        "broken_streaks" : broken_count,
        "total_spent"    : round(total_spent, 2),
        "budget"         : budget.amount if budget else 0,
        "burnout"        : burnout,
    }


# ══════════════════════════════════════════════
# ATTENDANCE
# ══════════════════════════════════════════════

@app.get("/attendance/subjects")
def get_subjects(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subjects    = db.query(AttendanceSubject).filter(AttendanceSubject.user_id == user.id).all()
    all_records = db.query(AttendanceRecord).filter(AttendanceRecord.user_id == user.id).all()
    result      = []

    for s in subjects:
        records  = [r for r in all_records if r.subject_id == s.id]
        attended, held, cancelled = _count_attendance(records)
        stats    = calculate_safe_bunks(attended, held, s.total_planned, s.min_percentage)
        result.append({
            "id"           : s.id,
            "name"         : s.name,
            "professor"    : s.professor,
            "min_pct"      : s.min_percentage,
            "total_planned": s.total_planned,
            "credits"      : s.credits,
            "schedule"     : s.schedule,
            "room"         : s.room,
            "attended"     : attended,
            "total_held"   : held,
            "cancelled"    : cancelled,
            **stats,
            "recent": [
                {"date": str(r.date), "present": r.present, "status": _record_status(r), "period": r.period}
                for r in sorted(records, key=lambda x: (x.date, x.period or 0), reverse=True)[:400]
            ]
        })
    return result


@app.post("/attendance/subjects")
def add_subject(data: AttendanceSubjectIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subject = AttendanceSubject(user_id=user.id, **data.model_dump())
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject


@app.put("/attendance/subjects/{subject_id}")
def update_subject(subject_id: int, data: AttendanceSubjectUpdate,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Edit ONE subject in place — only the fields you send are changed."""
    s = db.query(AttendanceSubject).filter(
        AttendanceSubject.id == subject_id,
        AttendanceSubject.user_id == user.id
    ).first()
    if not s:
        raise HTTPException(404, "Subject not found")

    changes = data.model_dump(exclude_unset=True)

    if "name" in changes:
        changes["name"] = (changes["name"] or "").strip()
        if not changes["name"]:
            raise HTTPException(400, "Subject name can't be empty")
    if "min_percentage" in changes and not (0 <= changes["min_percentage"] <= 100):
        raise HTTPException(400, "Minimum % must be between 0 and 100")
    if "total_planned" in changes:
        recs = db.query(AttendanceRecord).filter(AttendanceRecord.subject_id == s.id).all()
        _, held, _ = _count_attendance(recs)
        if changes["total_planned"] < max(1, held):
            raise HTTPException(400, f"Total classes can't be less than classes already held ({held})")
    if "credits" in changes and changes["credits"] is not None and changes["credits"] < 0:
        raise HTTPException(400, "Credits can't be negative")

    for k, v in changes.items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    return s


@app.delete("/attendance/subjects/{subject_id}")
def delete_subject(subject_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(AttendanceSubject).filter(
        AttendanceSubject.id == subject_id,
        AttendanceSubject.user_id == user.id
    ).first()
    if not s:
        raise HTTPException(404, "Not found")
    # Clean up what points at this subject: its history + its timetable slots become "free"
    db.query(AttendanceRecord).filter(AttendanceRecord.subject_id == s.id).delete()
    db.query(TimetableSlot).filter(TimetableSlot.subject_id == s.id).update({TimetableSlot.subject_id: None})
    db.delete(s)
    db.commit()
    return {"deleted": True}


@app.post("/attendance/mark")
def mark_attendance(data: AttendanceMarkIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subject = db.query(AttendanceSubject).filter(
        AttendanceSubject.id == data.subject_id,
        AttendanceSubject.user_id == user.id
    ).first()
    if not subject:
        raise HTTPException(404, "Subject not found")

    # "cancelled" classes are stored but never counted as held or absent
    status  = data.status if data.status in ("present", "absent", "cancelled") \
              else ("present" if data.present else "absent")
    present = (status == "present")

    day_q = db.query(AttendanceRecord).filter(
        AttendanceRecord.subject_id == data.subject_id,
        AttendanceRecord.user_id    == user.id,
        AttendanceRecord.date       == data.date
    )
    if data.period is not None:
        # one record per period (P1, P4…). An old record with no period is adopted by the first period saved,
        # so nothing is counted twice.
        existing = day_q.filter(AttendanceRecord.period == data.period).first() \
                   or day_q.filter(AttendanceRecord.period.is_(None)).first()
    else:
        existing = day_q.filter(AttendanceRecord.period.is_(None)).first() or day_q.first()
    if existing:
        existing.present = present
        existing.status  = status
        if data.period is not None:
            existing.period = data.period
        db.commit()
        db.refresh(existing)
        return existing
    record = AttendanceRecord(user_id=user.id, subject_id=data.subject_id, date=data.date,
                              present=present, status=status, period=data.period)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


# ══════════════════════════════════════════════
# MARKS
# ══════════════════════════════════════════════

@app.get("/scores")
def get_scores(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Score).filter(Score.user_id == user.id).order_by(Score.date.desc()).all()


@app.post("/scores")
def add_score(data: ScoreIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    percentage = round((data.score / data.total) * 100, 1)
    score      = Score(user_id=user.id, percentage=percentage, **data.model_dump())
    db.add(score)
    db.commit()
    db.refresh(score)
    return score


@app.delete("/scores/{score_id}")
def delete_score(score_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Score).filter(Score.id == score_id, Score.user_id == user.id).first()
    if not s:
        raise HTTPException(404, "Not found")
    db.delete(s)
    db.commit()
    return {"deleted": True}


@app.get("/scores/cgpa")
def get_cgpa(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scores   = db.query(Score).filter(Score.user_id == user.id).all()
    subjects = db.query(AttendanceSubject).filter(AttendanceSubject.user_id == user.id).all()
    credits  = {s.name: s.credits for s in subjects}
    return predict_cgpa(scores, credits)


# ══════════════════════════════════════════════
# STREAKS
# ══════════════════════════════════════════════

@app.get("/streaks")
def get_streaks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    streaks      = db.query(Streak).filter(Streak.user_id == user.id, Streak.active == True).all()
    all_checkins = db.query(StreakCheckIn).filter(StreakCheckIn.user_id == user.id).all()
    today        = date.today()
    result       = []

    for st in streaks:
        checkins      = [c for c in all_checkins if c.streak_id == st.id and c.done]
        checkin_dates = [c.date for c in checkins]
        days_28       = [(today - timedelta(days=i)) for i in range(27, -1, -1)]
        heatmap       = [d in checkin_dates for d in days_28]
        days_84       = [(today - timedelta(days=i)) for i in range(83, -1, -1)]
        date_set      = set(checkin_dates)
        history       = [d in date_set for d in days_84]       # 12 weeks, for the big heatmap
        stats         = calculate_streak(checkin_dates, days_28)
        done_today    = today in checkin_dates

        result.append({
            "id"         : st.id,
            "name"       : st.name,
            "description": st.description,
            "color"      : st.color,
            "heatmap"    : heatmap,
            "history"    : history,
            "done_today" : done_today,
            **stats
        })
    return result


@app.post("/streaks")
def add_streak(data: StreakIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    streak = Streak(user_id=user.id, **data.model_dump())
    db.add(streak)
    db.commit()
    db.refresh(streak)
    return streak


@app.post("/streaks/{streak_id}/checkin")
def checkin(streak_id: int, data: CheckInIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    streak = db.query(Streak).filter(Streak.id == streak_id, Streak.user_id == user.id).first()
    if not streak:
        raise HTTPException(404, "Streak not found")
    existing = db.query(StreakCheckIn).filter(
        StreakCheckIn.streak_id == streak_id,
        StreakCheckIn.date      == data.date
    ).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"done": False, "message": "Unchecked"}
    checkin_obj = StreakCheckIn(streak_id=streak_id, user_id=user.id, date=data.date, done=True)
    db.add(checkin_obj)
    db.commit()
    return {"done": True, "message": "Checked in"}


@app.delete("/streaks/{streak_id}")
def delete_streak(streak_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    st = db.query(Streak).filter(Streak.id == streak_id, Streak.user_id == user.id).first()
    if not st:
        raise HTTPException(404, "Not found")
    st.active = False
    db.commit()
    return {"deleted": True}


# ══════════════════════════════════════════════
# EXPENSES
# ══════════════════════════════════════════════

@app.get("/expenses")
def get_expenses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Expense).filter(Expense.user_id == user.id).order_by(Expense.date.desc()).all()


@app.post("/expenses")
def add_expense(data: ExpenseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be greater than 0")
    payload = data.model_dump()
    payload["kind"] = "income" if payload.get("kind") == "income" else "expense"
    expense = Expense(user_id=user.id, **payload)
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@app.delete("/expenses/{expense_id}")
def delete_expense(expense_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e = db.query(Expense).filter(Expense.id == expense_id, Expense.user_id == user.id).first()
    if not e:
        raise HTTPException(404, "Not found")
    db.delete(e)
    db.commit()
    return {"deleted": True}


@app.post("/expenses/budget")
def set_budget(data: BudgetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(MonthlyBudget).filter(
        MonthlyBudget.user_id == user.id,
        MonthlyBudget.month   == data.month,
        MonthlyBudget.year    == data.year
    ).first()
    if existing:
        existing.amount = data.amount
        db.commit()
        db.refresh(existing)
        return existing
    budget = MonthlyBudget(user_id=user.id, **data.model_dump())
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


# ══════════════════════════════════════════════
# CAREER GOALS
# ══════════════════════════════════════════════

@app.get("/career")
def get_career(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goals      = db.query(CareerGoal).filter(CareerGoal.user_id == user.id).all()
    done       = sum(1 for g in goals if g.status == "done")
    total      = len(goals)
    readiness  = round(done / total * 100) if total > 0 else 0

    # Full placement readiness score from intelligence layer
    subjects   = db.query(AttendanceSubject).filter(AttendanceSubject.user_id == user.id).all()
    records    = db.query(AttendanceRecord).filter(AttendanceRecord.user_id == user.id).all()
    scores     = db.query(Score).filter(Score.user_id == user.id).all()
    streaks    = db.query(Streak).filter(Streak.user_id == user.id, Streak.active == True).all()
    checkins   = db.query(StreakCheckIn).filter(StreakCheckIn.user_id == user.id).all()

    placement  = placement_readiness_score(scores, streaks, checkins, goals, subjects, records)

    return {
        "goals"    : [{"id": g.id, "direction": g.direction, "item": g.item,
                        "status": g.status, "note": g.note, "due_label": g.due_label} for g in goals],
        "readiness"          : readiness,
        "placement_readiness": placement
    }


@app.post("/career")
def add_career_goal(data: CareerGoalIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = CareerGoal(user_id=user.id, **data.model_dump())
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@app.put("/career/{goal_id}")
def update_career_goal(goal_id: int, status: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.query(CareerGoal).filter(CareerGoal.id == goal_id, CareerGoal.user_id == user.id).first()
    if not g:
        raise HTTPException(404, "Not found")
    g.status = status
    db.commit()
    db.refresh(g)
    return g


@app.delete("/career/{goal_id}")
def delete_career_goal(goal_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    g = db.query(CareerGoal).filter(CareerGoal.id == goal_id, CareerGoal.user_id == user.id).first()
    if not g:
        raise HTTPException(404, "Not found")
    db.delete(g)
    db.commit()
    return {"deleted": True}


# ══════════════════════════════════════════════
# WEEKLY CHECK-IN
# ══════════════════════════════════════════════

@app.post("/weekly-checkin")
def weekly_checkin(data: WeeklyCheckInIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(WeeklyCheckIn).filter(
        WeeklyCheckIn.user_id    == user.id,
        WeeklyCheckIn.week_start == data.week_start
    ).first()
    if existing:
        existing.mood       = data.mood
        existing.win        = data.win or data.reflection
        existing.improve    = data.improve
        existing.energy     = data.energy
        existing.reflection = data.reflection
        db.commit()
        db.refresh(existing)
        return existing
    payload = data.model_dump()
    payload["win"] = payload.get("win") or payload.get("reflection")   # keeps AI sentiment + chat context working
    checkin = WeeklyCheckIn(user_id=user.id, **payload)
    db.add(checkin)
    db.commit()
    db.refresh(checkin)
    return checkin


@app.get("/weekly-checkin")
def get_checkins(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(WeeklyCheckIn).filter(
        WeeklyCheckIn.user_id == user.id
    ).order_by(WeeklyCheckIn.week_start.desc()).limit(12).all()


# ══════════════════════════════════════════════
# INSIGHTS — all 6 cross-module insights
# ══════════════════════════════════════════════

@app.get("/insights")
def get_insights(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Returns all 6 cross-module DS insights:

    1. attendance_marks   — Does bunking affect marks?
    2. streak_marks       — Does streak consistency predict exam performance?
    3. stress_spending    — Do students spend more when stressed?
    4. placement          — What behavior pattern predicts placement success?
    5. mood_performance   — Does mood affect performance?
    6. burnout            — Burnout prediction before it happens
    """
    # Fetch all data once
    subjects      = db.query(AttendanceSubject).filter(AttendanceSubject.user_id == user.id).all()
    records       = db.query(AttendanceRecord).filter(AttendanceRecord.user_id == user.id).all()
    scores        = db.query(Score).filter(Score.user_id == user.id).all()
    streaks       = db.query(Streak).filter(Streak.user_id == user.id, Streak.active == True).all()
    streak_chks   = db.query(StreakCheckIn).filter(StreakCheckIn.user_id == user.id).all()
    expenses      = _spend_only(db.query(Expense).filter(Expense.user_id == user.id).all())
    weekly        = db.query(WeeklyCheckIn).filter(WeeklyCheckIn.user_id == user.id).all()
    career        = db.query(CareerGoal).filter(CareerGoal.user_id == user.id).all()

    # Run all 6 insight functions
    att_marks    = attendance_marks_correlation(subjects, records, scores)
    streak_marks = streak_marks_correlation(streaks, streak_chks, scores)
    stress_spend = stress_spending_insight(expenses, scores)
    placement    = placement_readiness_score(scores, streaks, streak_chks, career, subjects, records)
    mood_perf    = mood_performance_correlation(weekly, scores, streak_chks)
    burnout      = detect_burnout(records, streak_chks, expenses, weekly, scores)

    # How many insights are actually ready (enough data)
    ready_count = sum([
        att_marks.get("has_insight", False),
        streak_marks.get("has_insight", False),
        stress_spend.get("has_insight", False),
        placement["score"] > 0,
        mood_perf.get("has_insight", False),
        burnout["level"] != "fine"
    ])

    return {
        "ready_count"    : ready_count,
        "total_insights" : 6,
        "attendance_marks"  : att_marks,
        "streak_marks"      : streak_marks,
        "stress_spending"   : stress_spend,
        "placement"         : placement,
        "mood_performance"  : mood_perf,
        "burnout"           : burnout,
    }


# ══════════════════════════════════════════════
# SEMESTER TIMELINE
# ══════════════════════════════════════════════

@app.post("/semester-timeline")
def get_timeline(data: SemesterIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scores = db.query(Score).filter(Score.user_id == user.id).all()
    return semester_timeline(data.start, data.end, scores)


# ══════════════════════════════════════════════
# ML MODEL ROUTES
# ══════════════════════════════════════════════

@app.get("/predict")
def get_predictions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Run all 3 ML models for the current user.
    Returns predictions per subject + model status.

    Three models:
    1. Linear Regression  → predicted next score per subject
    2. KMeans Clustering  → Strong / Needs Work / At Risk per subject
    3. Logistic Regression → at-risk probability per subject
    """
    scores        = db.query(Score).filter(Score.user_id == user.id).all()
    streak_chks   = db.query(StreakCheckIn).filter(StreakCheckIn.user_id == user.id).all()
    weekly        = db.query(WeeklyCheckIn).filter(WeeklyCheckIn.user_id == user.id).all()

    result = predict_all_subjects(scores, streak_chks, weekly)
    return result


@app.post("/predict/train")
def retrain_models(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Manually trigger model retraining.
    Also called automatically when a new score is logged.
    """
    scores      = db.query(Score).filter(Score.user_id == user.id).all()
    streak_chks = db.query(StreakCheckIn).filter(StreakCheckIn.user_id == user.id).all()
    weekly      = db.query(WeeklyCheckIn).filter(WeeklyCheckIn.user_id == user.id).all()

    results = train_all_models(scores, streak_chks, weekly)
    return results


@app.get("/predict/status")
def model_status(user: User = Depends(get_current_user)):
    """
    Check which models are trained, last training time,
    and current prediction accuracy.
    """
    return get_model_status()


@app.get("/predict/accuracy")
def prediction_accuracy(user: User = Depends(get_current_user)):
    """
    How accurate have the predictions been?
    Compares past predictions to actual scores logged.
    """
    return get_accuracy_summary()


@app.post("/predict/log")
def log_a_prediction(
    subject: str,
    predicted_score: float,
    exam_type: str,
    user: User = Depends(get_current_user)
):
    """
    Store a prediction before the real score is known.
    When the actual exam score is later logged, the system
    automatically resolves this and updates accuracy tracking.
    """
    pred_id = log_prediction(subject, predicted_score, exam_type)
    return {"prediction_id": pred_id, "message": "Prediction stored. Log your actual score when you get it."}


@app.post("/predict/resolve/{prediction_id}")
def resolve_a_prediction(
    prediction_id: int,
    actual_score: float,
    user: User = Depends(get_current_user)
):
    """
    After a real exam score is logged, resolve the matching
    prediction to update model accuracy tracking.
    """
    resolve_prediction(prediction_id, actual_score)
    return {"message": "Prediction resolved. Accuracy updated."}


# ══════════════════════════════════════════════
# AI TOOL ROUTES
# ══════════════════════════════════════════════

class ChatIn(BaseModel):
    question : str


@app.post("/chat")
def chat(data: ChatIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Claude API + RAG — student asks a question, gets a
    personalized answer based on their ACTUAL Jarvis data.

    Example questions:
    - "Why are my marks dropping in DBMS?"
    - "Am I going to be okay for placements?"
    - "What should I focus on this week?"
    - "Is my attendance okay?"
    """
    # Fetch all student data
    subjects    = db.query(AttendanceSubject).filter(AttendanceSubject.user_id == user.id).all()
    records     = db.query(AttendanceRecord).filter(AttendanceRecord.user_id == user.id).all()
    scores      = db.query(Score).filter(Score.user_id == user.id).all()
    streaks     = db.query(Streak).filter(Streak.user_id == user.id, Streak.active == True).all()
    checkins    = db.query(StreakCheckIn).filter(StreakCheckIn.user_id == user.id).all()
    expenses    = _spend_only(db.query(Expense).filter(Expense.user_id == user.id).all())
    weekly      = db.query(WeeklyCheckIn).filter(WeeklyCheckIn.user_id == user.id).all()
    career      = db.query(CareerGoal).filter(CareerGoal.user_id == user.id).all()

    # Build RAG context from student's data
    context = build_student_context(
        user_name            = user.name,
        scores               = scores,
        attendance_subjects  = subjects,
        attendance_records   = records,
        streaks              = streaks,
        streak_checkins      = checkins,
        expenses             = expenses,
        weekly_checkins      = weekly,
        career_goals         = career
    )

    # Ask Gemini with context
    result = chat_with_gemini(
    question        = data.question,
    student_context = context,
    user_name       = user.name
    )
    return result


@app.post("/voice-log")
async def voice_log(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Whisper + Claude — upload audio, auto-log everything mentioned.

    Student says: "I attended DBMS today and scored 72 on the quiz"
    Jarvis:       marks attendance + adds score automatically

    Accepts: mp3, mp4, wav, m4a, webm
    """
    # Save uploaded audio to temp file
    suffix = os.path.splitext(file.filename)[1] if file.filename else ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # Step 1: Transcribe with Whisper
        transcription = transcribe_audio(tmp_path)
        if transcription["error"]:
            return {"success": False, "error": transcription["error"], "text": None, "logged": []}

        # Step 2: Parse with Claude
        parsed = parse_voice_command(transcription["text"], user.name)
        if parsed["error"] and parsed["error"] != "no_api_key":
            return {"success": False, "error": parsed["error"],
                    "text": transcription["text"], "logged": []}

        # Step 3: Auto-log each parsed action
        logged = []
        today  = date.today()

        for action in parsed.get("actions", []):
            action_type = action.get("type")

            if action_type == "attendance":
                # Find matching subject
                subject_name = action.get("subject", "").lower()
                subject = next(
                    (s for s in db.query(AttendanceSubject)
                     .filter(AttendanceSubject.user_id == user.id).all()
                     if s.name.lower() == subject_name or subject_name in s.name.lower()),
                    None
                )
                if subject:
                    was_present = bool(action.get("present", True))
                    v_status    = "present" if was_present else "absent"
                    todays = db.query(AttendanceRecord).filter(
                        AttendanceRecord.subject_id == subject.id,
                        AttendanceRecord.user_id    == user.id,
                        AttendanceRecord.date       == today
                    ).all()
                    if todays:                                   # update every period already logged today
                        for rec in todays:
                            rec.present, rec.status = was_present, v_status
                    else:                                        # one record per timetable period (P1, P4…)
                        periods = [t.period for t in db.query(TimetableSlot).filter(
                            TimetableSlot.user_id == user.id,
                            TimetableSlot.subject_id == subject.id,
                            TimetableSlot.day == today.strftime("%a")).all()] or [None]
                        for p in sorted(periods, key=lambda x: x or 0):
                            db.add(AttendanceRecord(user_id=user.id, subject_id=subject.id, date=today,
                                                    present=was_present, status=v_status, period=p))
                    db.commit()
                    status = "present" if action.get("present") else "absent"
                    logged.append(f"Marked {subject.name} {status}")

            elif action_type == "score":
                score_val = action.get("score")
                total_val = action.get("total", 100)
                if score_val is not None:
                    pct = round((score_val / total_val) * 100, 1)
                    score = Score(
                        user_id    = user.id,
                        subject    = action.get("subject", "Unknown"),
                        exam_type  = action.get("exam_type", "quiz"),
                        score      = score_val,
                        total      = total_val,
                        percentage = pct,
                        date       = today
                    )
                    db.add(score)
                    db.commit()
                    logged.append(f"Added score: {action.get('subject')} {score_val}/{total_val} ({pct}%)")

            elif action_type == "expense":
                amount = action.get("amount")
                if amount:
                    expense = Expense(
                        user_id  = user.id,
                        category = action.get("category", "misc"),
                        amount   = amount,
                        note     = action.get("note", ""),
                        date     = today
                    )
                    db.add(expense)
                    db.commit()
                    logged.append(f"Added expense: ₹{amount} ({action.get('category')})")

            elif action_type == "streak_checkin":
                streak_name = action.get("streak_name", "").lower()
                streak = next(
                    (s for s in db.query(Streak)
                     .filter(Streak.user_id == user.id, Streak.active == True).all()
                     if streak_name in s.name.lower() or s.name.lower() in streak_name),
                    None
                )
                if streak:
                    existing = db.query(StreakCheckIn).filter(
                        StreakCheckIn.streak_id == streak.id,
                        StreakCheckIn.date      == today
                    ).first()
                    if not existing:
                        checkin = StreakCheckIn(
                            streak_id = streak.id,
                            user_id   = user.id,
                            date      = today,
                            done      = True
                        )
                        db.add(checkin)
                        db.commit()
                    logged.append(f"Checked in: {streak.name}")

        return {
            "success"       : True,
            "text"          : transcription["text"],
            "actions_found" : len(parsed.get("actions", [])),
            "logged"        : logged,
            "error"         : None
        }

    finally:
        os.unlink(tmp_path)


@app.api_route("/analyze-checkin", methods=["GET", "POST"])
def analyze_checkin(
    win: str,
    improve: str,
    user: User = Depends(get_current_user)
):
    """
    HuggingFace Sentiment — analyze weekly check-in text.
    Returns a richer mood signal than the 1-5 slider.
    Also updates burnout model with the sentiment score.
    """
    result = analyze_checkin_text(win, improve)
    return result


@app.get("/ai-status")
def ai_status(user: User = Depends(get_current_user)):
    """
    Check which AI tools are installed and ready.
    Shown in settings so student knows what features are active.
    """
    return check_ai_tools_status()


# ══════════════════════════════════════════════
# TIMETABLE ROUTES
# ══════════════════════════════════════════════

class TimetableSlotIn(BaseModel):
    day        : str
    period     : int
    subject_id : Optional[int] = None

class TimetableSaveIn(BaseModel):
    slots : List[TimetableSlotIn]

@app.get("/timetable")
def get_timetable(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    slots = db.query(TimetableSlot).filter(TimetableSlot.user_id == user.id).all()
    return [{"id":s.id,"day":s.day,"period":s.period,"subject_id":s.subject_id} for s in slots]

@app.post("/timetable")
def save_timetable(data: TimetableSaveIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(TimetableSlot).filter(TimetableSlot.user_id == user.id).delete()
    for slot in data.slots:
        s = TimetableSlot(user_id=user.id, **slot.model_dump())
        db.add(s)
    db.commit()
    return {"saved": len(data.slots)}


# ══════════════════════════════════════════════
# DAILY SCHEDULE ROUTES
# ══════════════════════════════════════════════

class DailyScheduleIn(BaseModel):
    Mon : int = 0
    Tue : int = 0
    Wed : int = 0
    Thu : int = 0
    Fri : int = 0
    Sat : int = 0

@app.get("/daily-schedule")
def get_daily_schedule(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(DailySchedule).filter(DailySchedule.user_id == user.id).all()
    return {r.day: r.periods for r in rows}

@app.post("/daily-schedule")
def save_daily_schedule(data: DailyScheduleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(DailySchedule).filter(DailySchedule.user_id == user.id).delete()
    for day, periods in data.model_dump().items():
        if periods > 0:
            db.add(DailySchedule(user_id=user.id, day=day, periods=periods))
    db.commit()
    return {"saved": True}


# ══════════════════════════════════════════════
# CHAT SESSION ROUTES
# ══════════════════════════════════════════════

class CreateSessionIn(BaseModel):
    title : str = "New chat"

class SendMessageIn(BaseModel):
    content : str

@app.get("/chat/sessions")
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sessions = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )
    return [{"id":s.id,"title":s.title,"created_at":str(s.created_at),"updated_at":str(s.updated_at)} for s in sessions]

@app.post("/chat/sessions")
def create_session(data: CreateSessionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = ChatSession(user_id=user.id, title=data.title[:80])
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id":session.id,"title":session.title,"created_at":str(session.created_at),"updated_at":str(session.created_at)}

@app.get("/chat/sessions/{session_id}/messages")
def get_messages(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id==session_id, ChatSession.user_id==user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")
    messages = db.query(ChatMessage).filter(ChatMessage.session_id==session_id).order_by(ChatMessage.created_at).all()
    return [{"id":m.id,"role":m.role,"content":m.content,"tokens":m.tokens,"created_at":str(m.created_at)} for m in messages]

@app.post("/chat/sessions/{session_id}/messages")
def send_message(session_id: int, data: SendMessageIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from datetime import datetime as dt
    session = db.query(ChatSession).filter(ChatSession.id==session_id, ChatSession.user_id==user.id).first()
    if not session:
        raise HTTPException(404, "Session not found")

    # Save user message
    db.add(ChatMessage(session_id=session_id, user_id=user.id, role="user", content=data.content))
    db.commit()

    # Build context and call Gemini
    subjects  = db.query(AttendanceSubject).filter(AttendanceSubject.user_id==user.id).all()
    records   = db.query(AttendanceRecord).filter(AttendanceRecord.user_id==user.id).all()
    scores    = db.query(Score).filter(Score.user_id==user.id).all()
    streaks   = db.query(Streak).filter(Streak.user_id==user.id, Streak.active==True).all()
    checkins  = db.query(StreakCheckIn).filter(StreakCheckIn.user_id==user.id).all()
    expenses  = _spend_only(db.query(Expense).filter(Expense.user_id==user.id).all())
    weekly    = db.query(WeeklyCheckIn).filter(WeeklyCheckIn.user_id==user.id).all()
    career    = db.query(CareerGoal).filter(CareerGoal.user_id==user.id).all()

    context = build_student_context(
        user_name=user.name, scores=scores,
        attendance_subjects=subjects, attendance_records=records,
        streaks=streaks, streak_checkins=checkins,
        expenses=expenses, weekly_checkins=weekly, career_goals=career
    )

    result = chat_with_gemini(question=data.content, student_context=context, user_name=user.name)

    # Save assistant message
    db.add(ChatMessage(session_id=session_id, user_id=user.id, role="assistant",
                       content=result["answer"], tokens=result.get("tokens_used",0)))

    # Update session
    session.updated_at = dt.utcnow()
    if session.title == "New chat":
        session.title = data.content[:60] + ("..." if len(data.content)>60 else "")
    db.commit()

    return {"answer":result["answer"],"tokens_used":result.get("tokens_used",0),"model":result.get("model"),"error":result.get("error")}

@app.delete("/chat/sessions/{session_id}")
def delete_session(session_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    session = db.query(ChatSession).filter(ChatSession.id==session_id, ChatSession.user_id==user.id).first()
    if not session:
        raise HTTPException(404, "Not found")
    db.query(ChatMessage).filter(ChatMessage.session_id==session_id).delete()
    db.delete(session)
    db.commit()
    return {"deleted": True}
