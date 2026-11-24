"""
ai_tools.py — All AI integrations for Jarvis (Gemini version)

Four tools:
1. GEMINI API + RAG   — personalized chat advisor using student's real data
2. WHISPER            — voice logging (runs locally, free)
3. HUGGING FACE       — sentiment analysis on weekly check-ins (free, local)
4. GEMINI PARSER      — parse voice commands into structured log entries

WHY GEMINI over Claude for free tier:
- Gemini 1.5 Flash: completely free
- 15 requests/minute, 1500 requests/day
- No credit card needed
- More than enough for a student app

SETUP:
1. pip install google-generativeai openai-whisper transformers torch python-dotenv
2. Get free API key from aistudio.google.com
3. Add to .env: GEMINI_API_KEY=your_key_here
4. For voice: install ffmpeg
   - Windows: download from ffmpeg.org, add to PATH
   - Mac: brew install ffmpeg
   - Ubuntu: sudo apt install ffmpeg
"""

import os
import json
import tempfile
import shutil
from datetime import date
from collections import defaultdict

from pathlib import Path

try:
    from dotenv import load_dotenv
    # Always read backend/.env, no matter which folder uvicorn is started from
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


# ══════════════════════════════════════════════
# TOOL 1 — GEMINI API + RAG
# ══════════════════════════════════════════════

def build_student_context(user_name, scores, attendance_subjects,
                           attendance_records, streaks, streak_checkins,
                           expenses, weekly_checkins, career_goals) -> str:
    """
    RAG step: Build structured text from all student data.
    This gets injected into Gemini's prompt as context.
    Gemini answers FROM this data, not generic knowledge.
    """
    today = date.today()

    # Attendance
    att_lines = []
    for subj in attendance_subjects:
        records  = [r for r in attendance_records if r.subject_id == subj.id]
        attended = sum(1 for r in records if r.present)
        held     = len(records)
        pct      = round(attended / held * 100, 1) if held > 0 else 0
        status   = "DANGER" if pct < subj.min_percentage else "OK"
        att_lines.append(f"  - {subj.name}: {pct}% ({attended}/{held}) [{status}]")

    # Marks
    subject_scores = defaultdict(list)
    for s in sorted(scores, key=lambda x: x.date):
        subject_scores[s.subject].append((str(s.date), s.percentage, s.exam_type))

    marks_lines = []
    for subject, records in subject_scores.items():
        avg   = round(sum(r[1] for r in records) / len(records), 1)
        trend = "improving" if len(records) >= 2 and records[-1][1] > records[-2][1] else \
                "declining" if len(records) >= 2 and records[-1][1] < records[-2][1] else "stable"
        last  = records[-1]
        marks_lines.append(
            f"  - {subject}: avg {avg}%, last {last[1]}% ({last[2]} on {last[0]}), {trend}"
        )

    # Streaks
    from datetime import timedelta
    streak_lines = []
    for st in streaks:
        checkins    = [c for c in streak_checkins if c.streak_id == st.id and c.done]
        dates       = [c.date for c in checkins]
        current     = 0
        check_d     = today
        while check_d in dates:
            current += 1
            check_d  = check_d - timedelta(days=1)
        done_today   = today in dates
        recent_count = len([d for d in dates if d >= today - timedelta(days=30)])
        consistency  = round(recent_count / 30 * 100)
        streak_lines.append(
            f"  - {st.name}: {current} day streak, {consistency}% consistent, done today: {done_today}"
        )

    # Expenses this month
    month_ago       = today - timedelta(days=30)
    recent_expenses = [e for e in expenses if e.date >= month_ago]
    total_spent     = sum(e.amount for e in recent_expenses)
    by_cat          = defaultdict(float)
    for e in recent_expenses:
        by_cat[e.category] += e.amount
    top_cats = sorted(by_cat.items(), key=lambda x: x[1], reverse=True)[:3]
    expense_line = f"₹{total_spent:.0f} this month. " + \
                   ", ".join(f"{c}: ₹{a:.0f}" for c, a in top_cats)

    # Mood
    recent_mood = weekly_checkins[-1] if weekly_checkins else None
    mood_text   = f"Last mood: {recent_mood.mood}/5" if recent_mood else "No check-ins yet"
    if recent_mood and recent_mood.win:
        mood_text += f". Win this week: {recent_mood.win}"

    # Career
    done_goals  = sum(1 for g in career_goals if g.status == "done")
    total_goals = len(career_goals)
    pending     = [g.item for g in career_goals if g.status == "pending"][:3]

    return f"""
STUDENT: {user_name}
DATE: {today}

ATTENDANCE:
{chr(10).join(att_lines) if att_lines else "  No subjects added yet"}

MARKS:
{chr(10).join(marks_lines) if marks_lines else "  No scores logged yet"}

STREAKS:
{chr(10).join(streak_lines) if streak_lines else "  No streaks tracked"}

EXPENSES:
  {expense_line if recent_expenses else "No expenses logged"}

MOOD:
  {mood_text}

CAREER GOALS:
  {done_goals}/{total_goals} done. Pending: {', '.join(pending) if pending else 'none'}
""".strip()


def chat_with_gemini(question: str, student_context: str, user_name: str) -> dict:
    """
    Gemini API + RAG — answer student question using their real data.

    Model: gemini-2.5-flash (free tier)
    Free limits: 15 RPM, 1500 requests/day — more than enough
    """
    if not GEMINI_API_KEY:
        return {
            "answer"     : "Gemini API key not set. Add GEMINI_API_KEY to your .env file. Get it free from aistudio.google.com",
            "tokens_used": 0,
            "model"      : None,
            "error"      : "no_api_key"
        }

    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)

        model = genai.GenerativeModel(
            model_name     = "gemini-2.5-flash",
            system_instruction = f"""You are Jarvis, a personal academic advisor for {user_name}.
You have access to their real data from the Jarvis app.

RULES:
1. Answer ONLY based on their actual data shown below — not generic advice
2. Be direct and honest — don't sugarcoat poor performance
3. Give 1-3 specific, actionable steps based on their numbers
4. Keep answers under 150 words — they're on their phone
5. Speak like a smart friend who knows their situation
6. If data is missing to answer, say so clearly

{user_name}'s current data:
{student_context}"""
        )

        response     = model.generate_content(question)
        answer       = response.text
        tokens_used  = response.usage_metadata.total_token_count if hasattr(response, 'usage_metadata') else 0

        return {
            "answer"     : answer,
            "tokens_used": tokens_used,
            "model"      : "gemini-2.5-flash (free)",
            "error"      : None
        }

    except Exception as e:
        error_msg = str(e)
        if "API_KEY_INVALID" in error_msg or "api key not valid" in error_msg.lower():
            msg = "Invalid Gemini API key. Check your .env file."
        elif "quota" in error_msg.lower():
            msg = "Daily quota reached (1500 requests/day free limit). Try again tomorrow."
        else:
            msg = f"Gemini error: {error_msg[:100]}"

        return {
            "answer"     : msg,
            "tokens_used": 0,
            "model"      : None,
            "error"      : error_msg
        }


# ══════════════════════════════════════════════
# TOOL 2 — WHISPER VOICE LOGGING
# ══════════════════════════════════════════════

_whisper_model = None

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            import whisper
            _whisper_model = whisper.load_model("base")
            print("Whisper loaded")
        except ImportError:
            return None
    return _whisper_model


def transcribe_audio(audio_file_path: str) -> dict:
    """Transcribe audio file to text using Whisper (runs locally, free)."""
    model = get_whisper_model()
    if not model:
        return {
            "text"    : None,
            "language": None,
            "error"   : "Whisper not installed. Run: pip install openai-whisper"
        }
    try:
        result = model.transcribe(audio_file_path, language="en", fp16=False, verbose=False)
        return {"text": result["text"].strip(), "language": "en", "error": None}
    except Exception as e:
        return {"text": None, "language": None, "error": str(e)}


def parse_voice_command(transcribed_text: str, user_name: str) -> dict:
    """
    Use Gemini to parse voice transcription into structured log entries.

    WHY Gemini for parsing: handles messy natural speech better than regex.
    "uhh I went to the DBMS lecture today" → attendance: DBMS present
    """
    if not GEMINI_API_KEY:
        return {"actions": [], "error": "no_api_key", "raw_text": transcribed_text}

    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-2.5-flash")

        prompt = f"""Parse this voice note from a student and extract logging actions.

Voice note: "{transcribed_text}"
Today's date: {date.today()}

Return ONLY a valid JSON object, no markdown, no explanation:
{{
  "actions": [
    {{
      "type": "attendance",
      "subject": "subject name",
      "present": true or false
    }},
    {{
      "type": "score",
      "subject": "subject name",
      "score": number,
      "total": number,
      "exam_type": "quiz/assignment/mid-sem/end-sem"
    }},
    {{
      "type": "expense",
      "category": "food/transport/books/outing/subscription/misc",
      "amount": number,
      "note": "what it was for"
    }},
    {{
      "type": "streak_checkin",
      "streak_name": "habit name"
    }}
  ]
}}

Rules:
- Only include actions clearly mentioned in the voice note
- "attended", "went to", "was in" = present:true. "missed", "skipped", "bunked" = present:false
- Default total to 100 if not mentioned
- Return empty actions array if nothing clear to log"""

        response = model.generate_content(prompt)
        raw      = response.text.strip()

        # Clean up if Gemini adds markdown
        raw = raw.replace("```json", "").replace("```", "").strip()

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            import re
            match = re.search(r'\{.*\}', raw, re.DOTALL)
            parsed = json.loads(match.group()) if match else {"actions": []}

        return {"actions": parsed.get("actions", []), "raw_text": transcribed_text, "error": None}

    except Exception as e:
        return {"actions": [], "error": str(e), "raw_text": transcribed_text}


# ══════════════════════════════════════════════
# TOOL 3 — HUGGING FACE SENTIMENT
# ══════════════════════════════════════════════

_sentiment_pipeline = None

def get_sentiment_model():
    global _sentiment_pipeline
    if _sentiment_pipeline is None:
        try:
            from transformers import pipeline
            _sentiment_pipeline = pipeline(
                "sentiment-analysis",
                model      = "distilbert-base-uncased-finetuned-sst-2-english",
                truncation = True,
                max_length = 512
            )
            print("Sentiment model loaded")
        except ImportError:
            return None
    return _sentiment_pipeline


def analyze_sentiment(text: str) -> dict:
    """
    Analyze sentiment of weekly check-in text.
    Runs locally — no API key needed, completely free.

    POSITIVE high → mood 5
    POSITIVE low  → mood 4
    NEGATIVE low  → mood 2
    NEGATIVE high → mood 1
    """
    if not text or len(text.strip()) < 5:
        return {"label": "NEUTRAL", "score": 0.5, "mood_score": 3, "emoji": "😐", "error": None}

    model = get_sentiment_model()
    if not model:
        return {"label": "NEUTRAL", "score": 0.5, "mood_score": 3, "emoji": "😐",
                "error": "Run: pip install transformers torch"}

    try:
        result     = model(text[:512])[0]
        label      = result["label"]
        score      = result["score"]
        mood_score = 5 if label == "POSITIVE" and score >= 0.85 else \
                     4 if label == "POSITIVE" else \
                     1 if score >= 0.85 else 2
        emoji      = "😄" if mood_score == 5 else "🙂" if mood_score == 4 else \
                     "😔" if mood_score == 1 else "😕"
        return {"label": label, "score": round(score, 3), "mood_score": mood_score, "emoji": emoji, "error": None}
    except Exception as e:
        return {"label": "NEUTRAL", "score": 0.5, "mood_score": 3, "emoji": "😐", "error": str(e)}


def analyze_checkin_text(win_text: str, improve_text: str) -> dict:
    """Run sentiment on both weekly check-in fields and combine."""
    win_s    = analyze_sentiment(win_text)     if win_text     else None
    improve_s = analyze_sentiment(improve_text) if improve_text else None

    if win_s and improve_s:
        combined = round(win_s["mood_score"] * 0.6 + improve_s["mood_score"] * 0.4)
    elif win_s:
        combined = win_s["mood_score"]
    elif improve_s:
        combined = improve_s["mood_score"]
    else:
        combined = 3

    return {
        "combined_mood"      : max(1, min(5, combined)),
        "overall_label"      : "POSITIVE" if combined >= 4 else "NEGATIVE" if combined <= 2 else "NEUTRAL",
        "win_sentiment"      : win_s,
        "improve_sentiment"  : improve_s,
        "burnout_risk_signal": combined <= 2
    }


# ══════════════════════════════════════════════
# STATUS CHECK
# ══════════════════════════════════════════════

def check_ai_tools_status() -> dict:
    status = {}

    # Gemini
    status["claude"] = {
        "available": bool(GEMINI_API_KEY),
        "message"  : "Gemini API ready (free tier)" if GEMINI_API_KEY
                     else "Add GEMINI_API_KEY to .env — get free key at aistudio.google.com"
    }

    # Whisper
    try:
        import whisper
        status["whisper"] = {"available": True, "message": "Ready"}
    except ImportError:
        status["whisper"] = {"available": False, "message": "pip install openai-whisper"}

    # HuggingFace
    try:
        from transformers import pipeline
        status["sentiment"] = {"available": True, "message": "Ready"}
    except ImportError:
        status["sentiment"] = {"available": False, "message": "pip install transformers torch"}

    # FFmpeg
    status["ffmpeg"] = {
        "available": shutil.which("ffmpeg") is not None,
        "message"  : "Ready" if shutil.which("ffmpeg") else "Install ffmpeg for voice logging"
    }

    status["all_ready"] = all(v["available"] for v in status.values())
    return status