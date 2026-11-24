# JARVIS — what was wrong & what was changed

## Why the backend was not running
1. **No dependencies were installed.** The `backend/venv` folder contained only `pip` — FastAPI,
   uvicorn, SQLAlchemy, etc. were never installed, and there was no `requirements.txt`.
   → Added `backend/requirements.txt`.
2. **`python-multipart` was never listed anywhere.** Your code uses a login form
   (`OAuth2PasswordRequestForm`) and a file upload (`/voice-log`); FastAPI refuses to start without it.
3. **`passlib` + newer `bcrypt` crash** on register/login (500 error). → `auth.py` now uses `bcrypt` directly.
4. **`main.py` had old copy-pasted blocks** (a stray `main_additions.py` docstring, routes for
   `/daily-schedule`, `/chat/sessions/...`, `/ai-status` defined twice, imports in the middle of the file).
5. The venv was a Windows/Python 3.13 venv with absolute paths — it cannot be moved to another
   folder/PC. It is not included; the setup script creates a fresh one.

## Files changed
| File | Change |
|---|---|
| `backend/requirements.txt` | NEW – all packages needed to start the server |
| `backend/requirements-optional.txt` | NEW – whisper / transformers / torch (voice + sentiment only) |
| `backend/.env.example` | NEW – template for your `.env` |
| `backend/auth.py` | passlib → bcrypt; `SECRET_KEY` read from `.env`; long passwords handled |
| `backend/database.py` | DB path is absolute, so it works no matter where you start uvicorn |
| `backend/models.py` | `declarative_base` import updated for SQLAlchemy 2 (no warning) |
| `backend/main.py` | removed duplicates + stray docstring; all imports at top; CORS also allows `127.0.0.1`; added `/` and `/health`; ownership checks on attendance-mark and streak check-in; `refresh()` so updated rows return data instead of `{}`; attendance `status` now saved; `.dict()` → `.model_dump()`; `/analyze-checkin` accepts GET and POST |
| `backend/ai_tools.py` | `.env` loaded from the file's own folder; "invalid key" detection no longer matches every error |
| `backend/intelligence.py` | a subject with 0 classes held is no longer flagged "danger" (it used to trigger a red warning for every new subject) |
| `frontend/src/api.js` | one `request()` helper: clear error if backend is down, auto-logout on expired token / deleted user; `/analyze-checkin` now called with POST; API URL can be set via `VITE_API_URL` |
| `frontend/src/app.jsx` | now uses the full `InsightsPage` (the old inline Insights read keys that the backend doesn't return, so it always said "No insights yet") |
| `setup-windows.bat`, `start-backend.bat`, `start-frontend.bat`, `setup-mac-linux.sh` | NEW – one-click setup/start |

## Run it (Windows)
1. Install Python 3.10–3.13 and Node 18+.
2. Double-click `setup-windows.bat` (creates `backend/venv`, installs everything).
3. Double-click `start-backend.bat`  → open http://localhost:8000/docs (should show the API).
4. Double-click `start-frontend.bat` → open http://localhost:5173

### Or manually in the VS Code terminal
```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
(second terminal)
```
cd frontend
npm install
npm run dev
```
**Important:** run `uvicorn main:app` from inside the `backend` folder.

## Notes
- Voice logging / sentiment are optional: `pip install -r requirements-optional.txt` (+ ffmpeg for voice).
- Your `.env` holds a real Gemini key. It is git-ignored, but don't share the zip publicly;
  if you ever shared it, create a new key in Google AI Studio.
- `google-generativeai` still works but Google is replacing it with `google-genai`; not changed here.

---

# Update 2 — Attendance editing in place

**Problem:** the "Edit setup" tab reopened the first-time wizard with blank rows (and saving it would
have created duplicate subjects), so changing one thing meant re-entering everything.

| File | Change |
|---|---|
| `frontend/src/AttendancePage.jsx` | "Edit setup" now opens a new **SetupEditor** pre-filled with your saved data, in 3 sections that save independently: **Subjects & classes** (name, professor, min %, credits, total classes — per-row *Save changes*, delete, add), **Periods per day**, **Timetable** (grid shows the current timetable, change any single period). Wizard gets a "Total classes" column (was fixed at 60). Dates now use local time instead of UTC (before 5:30 AM in India, attendance was saved on yesterday's date). |
| `frontend/src/api.js` | new `updateSubject(id, data)` |
| `backend/main.py` | new `PUT /attendance/subjects/{id}` (only the fields you send change; validates name, min %, and that total classes ≥ classes already held). Deleting a subject now also removes its attendance records and frees its timetable slots. **"Cancelled" classes are now really supported** — before, they were saved as absent; now they are excluded from "held". Voice logging now saves status too. |

Known limit: burnout / insight calculations still read the raw present flag, so a cancelled class counts as "not present" there.
