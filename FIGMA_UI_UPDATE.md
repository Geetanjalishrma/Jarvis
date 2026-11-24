JARVIS — Figma UI + Study with me + working backend for every page
==================================================================

WHAT'S NEW IN THIS VERSION

Frontend
- Every page now follows the new Figma file exactly (layout, cards, spacing) and uses its 4 colour palettes
  (Terracotta Studio, Plum Paper, Saffron Clay, Rosewood Coral). Switch palettes from the top bar; the choice is
  remembered and saved to your account. "Study with me" follows the palette too.
- Sign in / Create account: tab switch, eye button to show/hide passwords, confirm-password on sign-up,
  placeholders "your name" and "mail", clear error messages.
- All pages read and write real data: Overview (Focus / Atlas / Pulse), Attendance, Marks & CGPA, Habits,
  Expenses, Insights, AI Assistant, Study with me, Career roadmap, Weekly check-in, Profile & settings.

Backend (new / changed)
- Sign up: email is trimmed + lower-cased, validated, duplicates blocked, password >= 6 chars, saved to jarvis.db.
  Login is case-insensitive on email.
- database.py: auto-adds new columns to your EXISTING jarvis.db on start-up (no data loss, no manual migration).
- New tables: tasks, skills, recurring_payments, study_sessions.
- New columns: user profile (university, course, student_id, avatar, prefs), subject room, expense kind
  (income/expense), career due_label, check-in energy + reflection.
- New endpoints (backend/extras.py):
    PUT /auth/me, POST /auth/change-password, GET/PUT /preferences
    /tasks, /skills, /recurring, POST /study/sessions, GET /study/summary
    GET /cgpa/plan, GET /reports/academic.csv, GET /calendar.ics
    POST /import/marks, POST /import/expenses
- Changed: dashboard "monthly spend" now = this calendar month, income excluded; /streaks also returns a 12-week
  "history"; expenses accept kind=income.

HOW TO RUN (same as before)
  Backend : cd backend ; venv\Scripts\activate ; uvicorn main:app --reload
  Frontend: cd frontend ; npm install ; npm run dev
  Your existing jarvis.db keeps working — new columns are added automatically.
