"""
extras.py — backend for the features added by the Figma redesign

    Profile      PUT  /auth/me              edit name / email / university / course / student id / photo
                 POST /auth/change-password
    Preferences  GET/PUT /preferences       palette, notification toggles, target CGPA, class times, career goal
    Tasks        /tasks                     the dashboard "Priority list" (assignments + to-dos with deadlines)
    Skills       /skills                    the Career "Skill profile"
    Recurring    /recurring                 bills & subscriptions  ->  "Next payment" on Expenses
    Study        /study/sessions, /study/summary   focus minutes from the "Study with me" timer
    Reports      GET /reports/academic.csv  "Download report" on Marks
    Calendar     GET /calendar.ics          timetable + deadlines for Google / Apple / Outlook calendar
    Import       POST /import/marks, /import/expenses   CSV import (LMS export / bank statement)
    CGPA plan    GET /cgpa/plan             "Score X% in your next two assessments to reach 9.0"

Everything is scoped to the logged-in user (get_current_user).
The pure helpers (build_ics, parse_*_csv, required_percentage, next_due) have no database
dependency so they are easy to test.
"""
import csv
import io
import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import (User, AttendanceSubject, TimetableSlot, Score, Expense, Task, Skill,
                    RecurringPayment, StudySession)
from auth import get_current_user, hash_password, verify_password

router = APIRouter()

DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
PALETTES = ("terracotta", "plum", "saffron", "rosewood")

DEFAULT_PREFS: Dict[str, Any] = {
    "palette": "terracotta",
    "class_reminders": True,
    "assignment_deadlines": True,
    "habit_nudges": False,
    "weekly_summary": True,
    "target_cgpa": 9.0,
    "total_credits": 120,
    "first_class": "09:00",
    "period_minutes": 60,
    "career_goal_title": "",
    "career_goal_desc": "",
    "career_target": "",          # YYYY-MM-DD
}


# ══════════════════════════════════════════════
# PREFERENCES + PROFILE HELPERS
# ══════════════════════════════════════════════

def _load_prefs(user) -> Dict[str, Any]:
    prefs = dict(DEFAULT_PREFS)
    try:
        stored = json.loads(getattr(user, "prefs", None) or "{}")
        if isinstance(stored, dict):
            prefs.update({k: v for k, v in stored.items() if k in DEFAULT_PREFS})
    except (ValueError, TypeError):
        pass
    return prefs


def clean_prefs(incoming: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only known keys and coerce them to safe values."""
    out: Dict[str, Any] = {}
    for k, v in (incoming or {}).items():
        if k not in DEFAULT_PREFS:
            continue
        default = DEFAULT_PREFS[k]
        if k == "palette":
            if v in PALETTES:
                out[k] = v
        elif k in ("first_class",):
            if isinstance(v, str) and re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
                out[k] = v
        elif k == "career_target":
            if v in ("", None):
                out[k] = ""
            else:
                try:
                    out[k] = datetime.strptime(str(v)[:10], "%Y-%m-%d").date().isoformat()
                except ValueError:
                    pass
        elif isinstance(default, bool):
            out[k] = bool(v)
        elif isinstance(default, float):
            try:
                f = float(v)
                if 0 < f <= 10:
                    out[k] = round(f, 2)
            except (TypeError, ValueError):
                pass
        elif isinstance(default, int):
            try:
                i = int(v)
                if (k == "period_minutes" and 20 <= i <= 180) or (k == "total_credits" and 1 <= i <= 400):
                    out[k] = i
            except (TypeError, ValueError):
                pass
        elif isinstance(default, str):
            out[k] = str(v or "").strip()[:300]
    return out


def user_public(user) -> Dict[str, Any]:
    return {
        "id": user.id, "name": user.name, "email": user.email,
        "semester": user.semester, "branch": user.branch,
        "university": getattr(user, "university", None),
        "course": getattr(user, "course", None),
        "student_id": getattr(user, "student_id", None),
        "avatar": getattr(user, "avatar", None),
        "prefs": _load_prefs(user),
    }


class ProfileIn(BaseModel):
    name       : Optional[str] = None
    email      : Optional[str] = None
    semester   : Optional[int] = None
    branch     : Optional[str] = None
    university : Optional[str] = None
    course     : Optional[str] = None
    student_id : Optional[str] = None
    avatar     : Optional[str] = None       # data-URL, or "" to remove the photo


@router.put("/auth/me")
def update_profile(data: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ch = data.model_dump(exclude_unset=True)
    if "name" in ch:
        name = (ch["name"] or "").strip()
        if not name:
            raise HTTPException(400, "Name can't be empty")
        user.name = name[:80]
    if "email" in ch:
        email = (ch["email"] or "").strip().lower()
        if "@" not in email or "." not in email.split("@")[-1] or " " in email:
            raise HTTPException(400, "Please enter a valid email address")
        clash = db.query(User).filter(func.lower(User.email) == email, User.id != user.id).first()
        if clash:
            raise HTTPException(400, "That email is already used by another account")
        user.email = email
    if "semester" in ch and ch["semester"] is not None:
        user.semester = max(1, min(12, ch["semester"]))
    for k in ("branch", "university", "course", "student_id"):
        if k in ch:
            setattr(user, k, (ch[k] or "").strip()[:120] or None)
    if "avatar" in ch:
        av = ch["avatar"] or ""
        if av and (not av.startswith("data:image/") or len(av) > 450_000):
            raise HTTPException(400, "Photo must be a small image (under ~300 KB)")
        user.avatar = av or None
    db.commit()
    db.refresh(user)
    return user_public(user)


class PasswordIn(BaseModel):
    current : str
    new     : str


@router.post("/auth/change-password")
def change_password(data: PasswordIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current, user.password):
        raise HTTPException(400, "Current password is incorrect")
    if len(data.new or "") < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    user.password = hash_password(data.new)
    db.commit()
    return {"changed": True}


@router.get("/preferences")
def get_preferences(user: User = Depends(get_current_user)):
    return _load_prefs(user)


@router.put("/preferences")
def put_preferences(data: Dict[str, Any], user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = _load_prefs(user)
    prefs.update(clean_prefs(data))
    user.prefs = json.dumps(prefs)
    db.commit()
    return prefs


# ══════════════════════════════════════════════
# TASKS  (dashboard "Priority list")
# ══════════════════════════════════════════════

class TaskIn(BaseModel):
    title    : str
    subject  : Optional[str] = None
    due_date : Optional[date] = None
    due_time : Optional[str] = None
    priority : Optional[str] = "medium"


class TaskUpdate(BaseModel):
    title    : Optional[str] = None
    subject  : Optional[str] = None
    due_date : Optional[date] = None
    due_time : Optional[str] = None
    priority : Optional[str] = None
    done     : Optional[bool] = None


def _task_out(t) -> Dict[str, Any]:
    return {"id": t.id, "title": t.title, "subject": t.subject,
            "due_date": str(t.due_date) if t.due_date else None, "due_time": t.due_time,
            "priority": t.priority or "medium", "done": bool(t.done)}


def _valid_time(v: Optional[str]) -> Optional[str]:
    if not v:
        return None
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", v):
        raise HTTPException(400, "Time must look like 14:30")
    return v


@router.get("/tasks")
def list_tasks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tasks = db.query(Task).filter(Task.user_id == user.id).all()
    far = date.max
    tasks.sort(key=lambda t: (bool(t.done), t.due_date or far, t.due_time or "99:99", t.id))
    return [_task_out(t) for t in tasks]


@router.post("/tasks")
def add_task(data: TaskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    title = (data.title or "").strip()
    if not title:
        raise HTTPException(400, "Task title can't be empty")
    pr = data.priority if data.priority in ("low", "medium", "high") else "medium"
    t = Task(user_id=user.id, title=title[:160], subject=(data.subject or "").strip()[:80] or None,
             due_date=data.due_date, due_time=_valid_time(data.due_time), priority=pr, done=False)
    db.add(t)
    db.commit()
    db.refresh(t)
    return _task_out(t)


@router.put("/tasks/{task_id}")
def update_task(task_id: int, data: TaskUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    ch = data.model_dump(exclude_unset=True)
    if "title" in ch:
        title = (ch["title"] or "").strip()
        if not title:
            raise HTTPException(400, "Task title can't be empty")
        t.title = title[:160]
    if "subject" in ch:
        t.subject = (ch["subject"] or "").strip()[:80] or None
    if "due_date" in ch:
        t.due_date = ch["due_date"]
    if "due_time" in ch:
        t.due_time = _valid_time(ch["due_time"])
    if "priority" in ch and ch["priority"] in ("low", "medium", "high"):
        t.priority = ch["priority"]
    if "done" in ch and ch["done"] is not None:
        t.done = bool(ch["done"])
    db.commit()
    db.refresh(t)
    return _task_out(t)


@router.delete("/tasks/{task_id}")
def delete_task(task_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.query(Task).filter(Task.id == task_id, Task.user_id == user.id).first()
    if not t:
        raise HTTPException(404, "Task not found")
    db.delete(t)
    db.commit()
    return {"deleted": True}


# ══════════════════════════════════════════════
# SKILLS  (career "Skill profile")
# ══════════════════════════════════════════════

class SkillIn(BaseModel):
    name  : str
    level : int = 50


class SkillUpdate(BaseModel):
    name  : Optional[str] = None
    level : Optional[int] = None


@router.get("/skills")
def list_skills(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Skill).filter(Skill.user_id == user.id).order_by(Skill.level.desc(), Skill.id).all()
    return [{"id": s.id, "name": s.name, "level": s.level} for s in rows]


@router.post("/skills")
def add_skill(data: SkillIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(400, "Skill name can't be empty")
    s = Skill(user_id=user.id, name=name[:80], level=max(0, min(100, data.level)))
    db.add(s)
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "level": s.level}


@router.put("/skills/{skill_id}")
def update_skill(skill_id: int, data: SkillUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Skill).filter(Skill.id == skill_id, Skill.user_id == user.id).first()
    if not s:
        raise HTTPException(404, "Skill not found")
    ch = data.model_dump(exclude_unset=True)
    if "name" in ch and (ch["name"] or "").strip():
        s.name = ch["name"].strip()[:80]
    if "level" in ch and ch["level"] is not None:
        s.level = max(0, min(100, ch["level"]))
    db.commit()
    db.refresh(s)
    return {"id": s.id, "name": s.name, "level": s.level}


@router.delete("/skills/{skill_id}")
def delete_skill(skill_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(Skill).filter(Skill.id == skill_id, Skill.user_id == user.id).first()
    if not s:
        raise HTTPException(404, "Skill not found")
    db.delete(s)
    db.commit()
    return {"deleted": True}


# ══════════════════════════════════════════════
# RECURRING PAYMENTS  (Expenses → "Next payment")
# ══════════════════════════════════════════════

class RecurringIn(BaseModel):
    name     : str
    amount   : float
    due_day  : int = 1
    category : Optional[str] = "subscription"


def next_due(due_day: int, today: Optional[date] = None) -> date:
    """Next date this monthly payment falls on (days are clamped to 1–28 so every month works)."""
    today = today or date.today()
    day = max(1, min(28, due_day or 1))
    if today.day <= day:
        return today.replace(day=day)
    y, m = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    return date(y, m, day)


def _rec_out(r, today=None) -> Dict[str, Any]:
    today = today or date.today()
    nd = next_due(r.due_day, today)
    return {"id": r.id, "name": r.name, "amount": r.amount, "due_day": r.due_day,
            "category": r.category, "next_due": str(nd), "days_until": (nd - today).days}


@router.get("/recurring")
def list_recurring(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(RecurringPayment).filter(RecurringPayment.user_id == user.id,
                                             RecurringPayment.active == True).all()  # noqa: E712
    out = [_rec_out(r) for r in rows]
    out.sort(key=lambda x: x["days_until"])
    return out


@router.post("/recurring")
def add_recurring(data: RecurringIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    name = (data.name or "").strip()
    if not name:
        raise HTTPException(400, "Name can't be empty")
    if data.amount <= 0:
        raise HTTPException(400, "Amount must be greater than 0")
    r = RecurringPayment(user_id=user.id, name=name[:80], amount=data.amount,
                         due_day=max(1, min(28, data.due_day)), category=data.category or "subscription", active=True)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _rec_out(r)


@router.delete("/recurring/{rec_id}")
def delete_recurring(rec_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = db.query(RecurringPayment).filter(RecurringPayment.id == rec_id, RecurringPayment.user_id == user.id).first()
    if not r:
        raise HTTPException(404, "Not found")
    db.delete(r)
    db.commit()
    return {"deleted": True}


# ══════════════════════════════════════════════
# STUDY SESSIONS  ("Study with me" → dashboard focus chart)
# ══════════════════════════════════════════════

class StudyIn(BaseModel):
    minutes    : float
    study_date : Optional[date] = None      # defaults to today
    label      : Optional[str] = None


def _study_summary(db: Session, user_id: int) -> Dict[str, Any]:
    today = date.today()
    start = today - timedelta(days=6)
    rows = db.query(StudySession).filter(StudySession.user_id == user_id).all()
    per_day: Dict[str, float] = defaultdict(float)
    sessions_today = 0
    for r in rows:
        per_day[str(r.date)] += r.minutes or 0
        if r.date == today and (r.minutes or 0) >= 1:
            sessions_today += 1
    week = []
    for i in range(7):
        d = start + timedelta(days=i)
        week.append({"date": str(d), "minutes": round(per_day.get(str(d), 0), 1)})
    return {
        "today_minutes": round(per_day.get(str(today), 0), 1),
        "sessions_today": sessions_today,
        "total_minutes": round(sum(r.minutes or 0 for r in rows), 1),
        "week": week,
        "week_minutes": round(sum(w["minutes"] for w in week), 1),
    }


@router.post("/study/sessions")
def log_study(data: StudyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.minutes <= 0 or data.minutes > 600:
        raise HTTPException(400, "Minutes must be between 0 and 600")
    d = data.study_date or date.today()
    if d > date.today():
        raise HTTPException(400, "Can't log study time in the future")
    db.add(StudySession(user_id=user.id, date=d, minutes=round(data.minutes, 2),
                        label=(data.label or "").strip()[:80] or None))
    db.commit()
    return _study_summary(db, user.id)


@router.get("/study/summary")
def study_summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _study_summary(db, user.id)


# ══════════════════════════════════════════════
# CGPA PLAN  (Marks → "Path to 9.0")
# ══════════════════════════════════════════════

def target_to_percentage(target_gp: float) -> float:
    """Inverse of the 10-point scale used in intelligence.py (90→10, 80→9 … 40→5)."""
    return max(0.0, min(100.0, 40 + (target_gp - 5) * 10))


def required_percentage(percentages: List[float], target_gp: float, upcoming: int = 2) -> Dict[str, Any]:
    n = len(percentages)
    target_pct = target_to_percentage(target_gp)
    if n == 0:
        return {"required": round(target_pct, 1), "feasible": True, "target_percentage": round(target_pct, 1)}
    need = (target_pct * (n + upcoming) - sum(percentages)) / upcoming
    return {"required": round(max(0.0, need), 1), "feasible": need <= 100,
            "target_percentage": round(target_pct, 1)}


@router.get("/cgpa/plan")
def cgpa_plan(target: Optional[float] = None, upcoming: int = 2,
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = _load_prefs(user)
    target = target if target and 0 < target <= 10 else prefs["target_cgpa"]
    upcoming = max(1, min(6, upcoming))
    scores = db.query(Score).filter(Score.user_id == user.id).all()
    plan = required_percentage([s.percentage for s in scores], target, upcoming)
    return {"target": target, "upcoming": upcoming, "assessments": len(scores), **plan}


# ══════════════════════════════════════════════
# REPORT  (Marks → "Download report")
# ══════════════════════════════════════════════

def _gp(pct: float) -> int:
    return 10 if pct >= 90 else 9 if pct >= 80 else 8 if pct >= 70 else 7 if pct >= 60 else 6 if pct >= 50 else 5 if pct >= 40 else 0


def build_report_csv(user_name: str, scores: List[Any], credits: Dict[str, float]) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    by_subject: Dict[str, List[float]] = defaultdict(list)
    for s in scores:
        by_subject[s.subject].append(s.percentage)
    tw = tc = 0.0
    rows = []
    for subj, arr in sorted(by_subject.items()):
        avg = sum(arr) / len(arr)
        cr = credits.get(subj, 4) or 4
        tw += _gp(avg) * cr
        tc += cr
        rows.append([subj, len(arr), round(avg, 1), _gp(avg), cr])
    w.writerow(["JARVIS academic report"])
    w.writerow(["Student", user_name])
    w.writerow(["Generated", date.today().isoformat()])
    w.writerow(["CGPA (10-point)", round(tw / tc, 2) if tc else 0])
    w.writerow([])
    w.writerow(["Subject", "Assessments", "Average %", "Grade point", "Credits"])
    w.writerows(rows)
    w.writerow([])
    w.writerow(["Date", "Subject", "Type", "Score", "Out of", "Percentage"])
    for s in sorted(scores, key=lambda x: str(x.date)):
        w.writerow([str(s.date), s.subject, s.exam_type, s.score, s.total, s.percentage])
    return out.getvalue()


@router.get("/reports/academic.csv")
def academic_report(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scores = db.query(Score).filter(Score.user_id == user.id).all()
    subs = db.query(AttendanceSubject).filter(AttendanceSubject.user_id == user.id).all()
    body = build_report_csv(user.name or "Student", scores, {s.name: s.credits for s in subs})
    return Response(content=body, media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="jarvis-academic-report.csv"'})


# ══════════════════════════════════════════════
# CALENDAR EXPORT  (.ics → Google Calendar / Apple / Outlook)
# ══════════════════════════════════════════════

def _ics_escape(text: str) -> str:
    return (text or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _ics_fold(line: str) -> str:
    out, first = [], True
    while len(line) > 74:
        out.append(line[:74] if first else " " + line[:74])
        line, first = line[74:], False
    out.append(line if first else " " + line)
    return "\r\n".join(out)


def _hm_add(hm: str, minutes: int) -> str:
    h, m = [int(x) for x in hm.split(":")]
    total = h * 60 + m + minutes
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def build_ics(slots: List[Dict[str, Any]], tasks: List[Dict[str, Any]], first_class: str = "09:00",
              period_minutes: int = 60, today: Optional[date] = None) -> str:
    """slots: [{day:'Mon', period:1, subject:'DBMS', room:'Room 3'}]  tasks: [{title,due_date,due_time,subject}]"""
    today = today or date.today()
    monday = today - timedelta(days=today.weekday())
    stamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//JARVIS//Student Planner//EN",
         "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:JARVIS timetable"]

    # merge back-to-back periods of the same subject into one event
    by_day: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for s in slots:
        if s.get("subject"):
            by_day[s["day"]].append(s)
    n = 0
    for day, items in by_day.items():
        if day not in DAYS:
            continue
        items.sort(key=lambda x: x["period"])
        blocks: List[Dict[str, Any]] = []
        for it in items:
            if blocks and blocks[-1]["subject"] == it["subject"] and blocks[-1]["end_p"] == it["period"] - 1:
                blocks[-1]["end_p"] = it["period"]
            else:
                blocks.append({"subject": it["subject"], "room": it.get("room"), "start_p": it["period"], "end_p": it["period"]})
        d0 = monday + timedelta(days=DAYS.index(day))
        for b in blocks:
            start = _hm_add(first_class, (b["start_p"] - 1) * period_minutes)
            end = _hm_add(first_class, b["end_p"] * period_minutes)
            n += 1
            L += ["BEGIN:VEVENT", f"UID:jarvis-class-{day}-{b['start_p']}-{n}@jarvis.local", f"DTSTAMP:{stamp}",
                  f"DTSTART:{d0.strftime('%Y%m%d')}T{start.replace(':', '')}00",
                  f"DTEND:{d0.strftime('%Y%m%d')}T{end.replace(':', '')}00",
                  f"RRULE:FREQ=WEEKLY;BYDAY={day[:2].upper()}",
                  _ics_fold("SUMMARY:" + _ics_escape(b["subject"])),
                  _ics_fold("LOCATION:" + _ics_escape(b["room"] or "")), "END:VEVENT"]
    for i, t in enumerate(tasks):
        if not t.get("due_date"):
            continue
        d = datetime.strptime(str(t["due_date"]), "%Y-%m-%d").date()
        summary = "Due: " + t["title"] + (f" ({t['subject']})" if t.get("subject") else "")
        L += ["BEGIN:VEVENT", f"UID:jarvis-task-{i}-{d}@jarvis.local", f"DTSTAMP:{stamp}"]
        if t.get("due_time"):
            L += [f"DTSTART:{d.strftime('%Y%m%d')}T{t['due_time'].replace(':', '')}00",
                  f"DTEND:{d.strftime('%Y%m%d')}T{_hm_add(t['due_time'], 30).replace(':', '')}00"]
        else:
            L += [f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}",
                  f"DTEND;VALUE=DATE:{(d + timedelta(days=1)).strftime('%Y%m%d')}"]
        L += [_ics_fold("SUMMARY:" + _ics_escape(summary)), "END:VEVENT"]
    L.append("END:VCALENDAR")
    return "\r\n".join(L) + "\r\n"


@router.get("/calendar.ics")
def calendar_ics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    prefs = _load_prefs(user)
    subs = {s.id: s for s in db.query(AttendanceSubject).filter(AttendanceSubject.user_id == user.id).all()}
    slots = []
    for t in db.query(TimetableSlot).filter(TimetableSlot.user_id == user.id).all():
        s = subs.get(t.subject_id)
        if s:
            slots.append({"day": t.day, "period": t.period, "subject": s.name, "room": s.room})
    tasks = [_task_out(t) for t in db.query(Task).filter(Task.user_id == user.id, Task.done == False).all()]  # noqa: E712
    body = build_ics(slots, tasks, prefs["first_class"], prefs["period_minutes"])
    return Response(content=body, media_type="text/calendar",
                    headers={"Content-Disposition": 'attachment; filename="jarvis-timetable.ics"'})


# ══════════════════════════════════════════════
# CSV IMPORT  (LMS marks export / bank statement)
# ══════════════════════════════════════════════

DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d %b %Y", "%d %B %Y", "%m/%d/%Y")


def _parse_date(v: str) -> Optional[date]:
    v = (v or "").strip()
    for f in DATE_FORMATS:
        try:
            return datetime.strptime(v, f).date()
        except ValueError:
            continue
    return None


def _num(v: Any) -> Optional[float]:
    v = re.sub(r"[^\d.\-]", "", str(v or "").replace(",", ""))
    if v in ("", "-", "."):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _rows(text: str):
    text = (text or "").lstrip("\ufeff")
    try:
        dialect = csv.Sniffer().sniff(text[:2000], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    for raw in reader:
        yield {(k or "").strip().lower().replace(" ", "_"): (v or "").strip() for k, v in raw.items()}


def _pick(row: Dict[str, str], *names: str) -> str:
    for n in names:
        if row.get(n):
            return row[n]
    return ""


def parse_marks_csv(text: str):
    ok, errors = [], []
    for i, row in enumerate(_rows(text), start=2):
        subject = _pick(row, "subject", "course", "course_name", "paper")
        score = _num(_pick(row, "score", "marks", "obtained", "marks_obtained"))
        total = _num(_pick(row, "total", "max", "max_marks", "out_of", "maximum"))
        d = _parse_date(_pick(row, "date", "exam_date")) or date.today()
        etype = _pick(row, "exam_type", "type", "exam", "assessment") or "exam"
        if not subject or score is None or not total or total <= 0 or score < 0 or score > total:
            errors.append(f"Row {i}: needs subject, score and total (score can't exceed total)")
            continue
        ok.append({"subject": subject[:80], "exam_type": etype[:40], "score": score, "total": total,
                   "percentage": round(score / total * 100, 1), "date": d})
    return ok, errors


CATEGORY_WORDS = {
    "food": ("cafe", "café", "restaurant", "swiggy", "zomato", "canteen", "mess", "food", "pizza", "bakery", "dominos", "mcdonald", "kfc", "tea", "coffee"),
    "transport": ("metro", "uber", "ola", "rapido", "bus", "fuel", "petrol", "diesel", "train", "irctc", "cab", "auto", "flight"),
    "education": ("book", "course", "udemy", "coursera", "tuition", "fee", "stationery", "xerox", "exam", "library"),
    "subscription": ("netflix", "spotify", "prime", "notion", "subscription", "internet", "wifi", "broadband", "recharge", "hotstar", "youtube"),
    "outing": ("movie", "cinema", "pvr", "club", "trip", "outing", "game"),
}
INCOME_WORDS = ("salary", "freelance", "stipend", "scholarship", "refund", "received", "credited", "income", "pocket money")


def guess_category(text: str) -> str:
    t = (text or "").lower()
    for cat, words in CATEGORY_WORDS.items():
        if any(w in t for w in words):
            return cat
    return "other"


def parse_expenses_csv(text: str, signed: bool = False):
    ok, errors = [], []
    for i, row in enumerate(_rows(text), start=2):
        d = _parse_date(_pick(row, "date", "transaction_date", "txn_date", "value_date"))
        note = _pick(row, "description", "note", "narration", "details", "particulars", "merchant", "name")
        debit = _num(_pick(row, "debit", "withdrawal", "withdrawals", "dr"))
        credit = _num(_pick(row, "credit", "deposit", "deposits", "cr"))
        amount = _num(_pick(row, "amount", "amt"))
        ttype = _pick(row, "type", "kind", "transaction_type").lower()
        kind = "expense"
        if debit or credit:
            if credit and not debit:
                kind, amount = "income", credit
            else:
                amount = debit
        elif amount is not None:
            if signed and amount > 0:
                kind = "income"
            if ttype in ("credit", "cr", "income", "deposit"):
                kind = "income"
            amount = abs(amount)
        if d is None or not amount or amount <= 0:
            errors.append(f"Row {i}: needs a valid date and an amount")
            continue
        cat = _pick(row, "category").lower() or ("other" if kind == "income" else guess_category(note))
        if kind == "expense" and any(w in note.lower() for w in INCOME_WORDS) and ttype in ("credit", "cr"):
            kind = "income"
        ok.append({"date": d, "note": note[:120] or None, "amount": amount, "category": cat[:40], "kind": kind})
    return ok, errors


class CsvIn(BaseModel):
    csv    : str
    signed : Optional[bool] = False       # expenses only: negative = spending, positive = income


@router.post("/import/marks")
def import_marks(data: CsvIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(data.csv or "") > 1_000_000:
        raise HTTPException(400, "File is too large")
    rows, errors = parse_marks_csv(data.csv)
    for r in rows:
        db.add(Score(user_id=user.id, **r))
    db.commit()
    return {"imported": len(rows), "skipped": len(errors), "errors": errors[:5]}


@router.post("/import/expenses")
def import_expenses(data: CsvIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if len(data.csv or "") > 1_000_000:
        raise HTTPException(400, "File is too large")
    rows, errors = parse_expenses_csv(data.csv, bool(data.signed))
    for r in rows:
        db.add(Expense(user_id=user.id, **r))
    db.commit()
    return {"imported": len(rows), "skipped": len(errors), "errors": errors[:5]}
