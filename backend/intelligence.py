"""
intelligence.py — The DS brain of Jarvis

HOW IT WORKS NOW (connected to model.py):

Every insight function checks two things:
1. Is the ML model trained and ready? (model.py)
2. Is there enough data to trust it?

If YES → use ML model prediction
If NO  → use heuristic (rule-based logic)

This is called the "heuristic-ML ladder":
- Day 1:   pure heuristics (works immediately)
- Week 2+: ML models activate as data grows
- Month 3: ML models replace most heuristics
- Month 6: models trained on real outcomes (placement, CGPA)

The heuristic always stays as a fallback — models can fail,
heuristics don't. This is standard in production ML systems.
"""

from datetime import date, timedelta
from collections import defaultdict
from math import ceil


# ── SAFE IMPORT OF MODEL.PY ──────────────────────────────────────────────────
# model.py may not exist yet on first run — handle gracefully
try:
    from model import (
        predict_next_score, predict_at_risk,
        cluster_subjects, get_model_status,
        train_all_models
    )
    MODEL_AVAILABLE = True
except ImportError:
    MODEL_AVAILABLE = False


# ══════════════════════════════════════════════
# ATTENDANCE INTELLIGENCE
# ══════════════════════════════════════════════

def calculate_safe_bunks(attended: int, total_held: int,
                          total_planned: int, min_pct: float) -> dict:
    """
    Pure math — no model needed here.
    Safe bunks is a deterministic calculation, not a prediction.
    """
    current_pct = round((attended / total_held * 100), 1) if total_held > 0 else 0
    remaining   = total_planned - total_held

    min_must_total   = ceil(total_planned * min_pct / 100)
    must_attend_more = max(0, min_must_total - attended)
    safe_bunks       = remaining - must_attend_more

    # How many consecutive classes to attend to reach safety
    classes_to_safety = 0
    if current_pct < min_pct and total_held < total_planned:
        temp_a, temp_h = attended, total_held
        while temp_h <= total_planned:
            temp_a += 1
            temp_h += 1
            if (temp_a / temp_h * 100) >= min_pct:
                classes_to_safety = temp_h - total_held
                break

    if total_held == 0:
        # Nothing held yet -> nothing to warn about (was wrongly shown as "danger")
        status = "safe"
    elif current_pct >= min_pct + 10:
        status = "great"
    elif current_pct >= min_pct:
        status = "safe"
    elif current_pct >= min_pct - 5:
        status = "careful"
    else:
        status = "danger"

    return {
        "current_pct"      : current_pct,
        "safe_bunks"       : max(0, int(safe_bunks)),
        "must_attend_more" : must_attend_more,
        "classes_to_safety": classes_to_safety,
        "status"           : status,
        "message"          : ("No classes marked yet — start marking attendance."
                              if total_held == 0
                              else _attendance_message(status, safe_bunks, classes_to_safety))
    }


def _attendance_message(status, safe_bunks, classes_to_safety):
    if status == "great":
        return f"{int(safe_bunks)} safe bunks available. You're doing well."
    elif status == "safe":
        return f"{int(safe_bunks)} safe bunk(s) left — use them wisely."
    elif status == "careful":
        return f"Only {int(safe_bunks)} bunk left. Be careful this week."
    elif status == "danger":
        return f"Attend the next {classes_to_safety} classes without missing any to get safe."
    return ""


# ══════════════════════════════════════════════
# STREAK INTELLIGENCE
# ══════════════════════════════════════════════

def calculate_streak(checkin_dates: list, all_days: list) -> dict:
    """Pure calculation — no model needed."""
    if not checkin_dates:
        return {"current": 0, "best": 0, "consistency": 0, "status": "not_started"}

    checkin_set = set(str(d) for d in checkin_dates)
    today       = date.today()

    current    = 0
    check_date = today
    while str(check_date) in checkin_set:
        current   += 1
        check_date = check_date - timedelta(days=1)

    if current == 0:
        check_date = today - timedelta(days=1)
        while str(check_date) in checkin_set:
            current   += 1
            check_date = check_date - timedelta(days=1)

    best, running = 0, 0
    prev_date     = None
    for d in sorted(checkin_set):
        d_obj = date.fromisoformat(d)
        if prev_date and (d_obj - prev_date).days == 1:
            running += 1
        else:
            running  = 1
        best      = max(best, running)
        prev_date = d_obj

    total_days  = max(1, len(all_days)) if all_days else max(1, len(checkin_dates))
    consistency = min(100, round(len(checkin_dates) / total_days * 100))

    if current >= 14:
        status = "on_fire"
    elif current >= 7:
        status = "going"
    elif current >= 1:
        status = "started"
    else:
        status = "broken"

    return {"current": current, "best": best, "consistency": consistency, "status": status}


# ══════════════════════════════════════════════
# MARKS INTELLIGENCE — now connected to model.py
# ══════════════════════════════════════════════

def predict_cgpa(scores: list, subjects_with_credits: dict) -> dict:
    """
    CGPA calculation using grade points.
    Also triggers ML model training if enough data exists.

    ML connection: after calculating current CGPA from real marks,
    uses Linear Regression predictions (from model.py) to estimate
    predicted CGPA if those predicted scores come true.
    """
    def pct_to_gp(pct):
        if pct >= 90: return 10
        if pct >= 80: return 9
        if pct >= 70: return 8
        if pct >= 60: return 7
        if pct >= 50: return 6
        if pct >= 40: return 5
        return 0

    subject_avgs = defaultdict(list)
    for s in scores:
        subject_avgs[s.subject].append(s.percentage)

    if not subject_avgs:
        return {"current_cgpa": 0, "predicted_cgpa": 0,
                "grade_points": {}, "ml_used": False}

    total_credits, weighted_sum = 0, 0
    grade_points = {}

    for subject, marks in subject_avgs.items():
        avg     = sum(marks) / len(marks)
        gp      = pct_to_gp(avg)
        credits = subjects_with_credits.get(subject, 4)
        grade_points[subject] = {
            "avg"    : round(avg, 1),
            "gp"     : gp,
            "credits": credits,
            "trend"  : _score_trend(marks)
        }
        weighted_sum  += gp * credits
        total_credits += credits

    current_cgpa = round(weighted_sum / total_credits, 2) if total_credits > 0 else 0

    # ── ML CONNECTION: use predicted scores for CGPA forecast ─────────────────
    ml_used = False
    predicted_cgpa = current_cgpa

    if MODEL_AVAILABLE and len(scores) >= 5:
        try:
            predicted_weighted = 0
            predicted_credits  = 0

            for subject in subject_avgs:
                # Get ML prediction for this subject's next score
                pred = predict_next_score(subject, scores, [], [])
                if pred["prediction"] is not None:
                    credits = subjects_with_credits.get(subject, 4)
                    predicted_weighted += pct_to_gp(pred["prediction"]) * credits
                    predicted_credits  += credits
                    # Update grade_points with prediction
                    grade_points[subject]["predicted_score"] = pred["prediction"]
                    grade_points[subject]["prediction_conf"] = pred["confidence"]
                    grade_points[subject]["prediction_method"] = pred["method"]

            if predicted_credits > 0:
                predicted_cgpa = round(predicted_weighted / predicted_credits, 2)
                ml_used = True
        except Exception:
            # Model failed — stay with heuristic
            predicted_cgpa = current_cgpa

    # Heuristic fallback for predicted CGPA
    if not ml_used:
        predicted_weighted = weighted_sum
        predicted_credits  = total_credits
        for subject, marks in subject_avgs.items():
            if len(marks) < 2:
                credits        = subjects_with_credits.get(subject, 4)
                predicted_weighted += pct_to_gp(65) * credits
                predicted_credits  += credits
        predicted_cgpa = round(predicted_weighted / max(1, predicted_credits), 2)

    return {
        "current_cgpa"  : current_cgpa,
        "predicted_cgpa": predicted_cgpa,
        "grade_points"  : grade_points,
        "ml_used"       : ml_used
    }


def _score_trend(marks: list) -> str:
    if len(marks) < 2:
        return "not_enough_data"
    recent = marks[-2:]
    older  = marks[:-2] if len(marks) > 2 else [marks[0]]
    diff   = (sum(recent)/len(recent)) - (sum(older)/len(older))
    if diff > 8:   return "improving"
    if diff < -8:  return "declining"
    return "stable"


# ══════════════════════════════════════════════
# INSIGHT 1: BUNKING AFFECTS MARKS
# ══════════════════════════════════════════════

def attendance_marks_correlation(attendance_subjects, attendance_records, scores) -> dict:
    """
    Does bunking actually hurt marks?

    ML connection: none needed here — this is a correlation
    insight, not a prediction. Pure data analysis.
    Once you have 10+ data points, could add Pearson correlation
    coefficient from scipy.stats.
    """
    data_points = []

    for subject in attendance_subjects:
        records  = [r for r in attendance_records if r.subject_id == subject.id]
        if not records:
            continue
        attended = sum(1 for r in records if r.present)
        att_pct  = round(attended / len(records) * 100, 1)

        subject_scores = [s for s in scores if s.subject == subject.name]
        if not subject_scores:
            continue
        avg_mark = round(sum(s.percentage for s in subject_scores) / len(subject_scores), 1)

        data_points.append({
            "subject"   : subject.name,
            "attendance": att_pct,
            "avg_mark"  : avg_mark
        })

    if len(data_points) < 2:
        return {"has_insight": False, "data_points": data_points,
                "insight": None, "correlation": None}

    high = [d for d in data_points if d["attendance"] >= 80]
    low  = [d for d in data_points if d["attendance"] < 75]

    insight = None
    if high and low:
        high_avg = sum(d["avg_mark"] for d in high) / len(high)
        low_avg  = sum(d["avg_mark"] for d in low)  / len(low)
        diff     = round(high_avg - low_avg, 1)
        if diff > 0:
            insight = (
                f"In subjects where your attendance is above 80%, you average {high_avg:.0f}%. "
                f"In subjects below 75%, you average {low_avg:.0f}%. "
                f"Bunking is costing you {diff:.0f} marks on average."
            )
        else:
            insight = (
                f"Interestingly, your marks don't drop with low attendance — yet. "
                f"This pattern usually changes closer to end-semester exams."
            )

    correlation = None
    if len(data_points) >= 2:
        import statistics
        att_vals  = [d["attendance"] for d in data_points]
        mark_vals = [d["avg_mark"] for d in data_points]
        try:
            att_mean  = sum(att_vals) / len(att_vals)
            mark_mean = sum(mark_vals) / len(mark_vals)
            num   = sum((a - att_mean) * (m - mark_mean)
                        for a, m in zip(att_vals, mark_vals))
            denom = (sum((a - att_mean)**2 for a in att_vals) *
                     sum((m - mark_mean)**2 for m in mark_vals)) ** 0.5
            correlation = round(num / denom, 2) if denom != 0 else 0
        except Exception:
            correlation = None

    return {
        "has_insight": insight is not None,
        "data_points": data_points,
        "insight"    : insight,
        "correlation": correlation,
        "label"      : "Attendance × Marks"
    }


# ══════════════════════════════════════════════
# INSIGHT 2: STREAK CONSISTENCY → EXAM PERFORMANCE
# ══════════════════════════════════════════════

def streak_marks_correlation(streaks, streak_checkins, scores) -> dict:
    """
    Does streak consistency predict better exam scores?

    ML connection: the correlation found here becomes
    a feature (streak_pct) in the Linear Regression model
    in model.py. So this insight and the ML model reinforce
    each other — streak_pct already in the feature vector.
    """
    if not streaks or not scores:
        return {"has_insight": False, "insight": None, "data_points": []}

    weekly_checkins_count = defaultdict(int)
    total_streaks         = max(1, len(streaks))

    for c in streak_checkins:
        if c.done:
            week = c.date - timedelta(days=c.date.weekday())
            weekly_checkins_count[str(week)] += 1

    weekly_scores = defaultdict(list)
    for s in scores:
        week = s.date - timedelta(days=s.date.weekday())
        weekly_scores[str(week)].append(s.percentage)

    data_points = []
    for week, count in weekly_checkins_count.items():
        if week in weekly_scores:
            consistency = min(100, round(count / (total_streaks * 7) * 100))
            avg_score   = round(sum(weekly_scores[week]) / len(weekly_scores[week]), 1)
            data_points.append({
                "week"       : week,
                "consistency": consistency,
                "avg_score"  : avg_score
            })

    if len(data_points) < 2:
        return {
            "has_insight": False,
            "insight"    : (
                "Not enough overlapping data yet. Keep logging streaks and test scores "
                "in the same weeks — this insight will appear over time."
            ),
            "data_points": data_points
        }

    mid       = sorted(data_points, key=lambda x: x["consistency"])
    half      = max(1, len(mid) // 2)
    low_weeks = mid[:half]
    high_weeks= mid[half:]

    low_avg  = sum(d["avg_score"] for d in low_weeks)  / len(low_weeks)
    high_avg = sum(d["avg_score"] for d in high_weeks) / len(high_weeks)
    diff     = round(high_avg - low_avg, 1)

    if diff > 5:
        insight = (
            f"In weeks where you're consistent with daily habits, "
            f"you score {high_avg:.0f}% on average. "
            f"In low-consistency weeks, that drops to {low_avg:.0f}%. "
            f"A {diff:.0f}% difference — your daily discipline directly affects exam performance."
        )
    elif diff > 0:
        insight = (
            f"Mild pattern: consistent habit weeks correlate with slightly "
            f"better scores ({high_avg:.0f}% vs {low_avg:.0f}%). More data will make this clearer."
        )
    else:
        insight = (
            f"No strong pattern yet between habit consistency and scores. "
            f"Keep logging — this takes a few weeks to show clearly."
        )

    return {
        "has_insight": diff > 5,
        "insight"    : insight,
        "data_points": data_points,
        "label"      : "Streak Consistency × Marks"
    }


# ══════════════════════════════════════════════
# INSIGHT 3: STRESS SPENDING
# ══════════════════════════════════════════════

def stress_spending_insight(expenses, scores) -> dict:
    """
    Do students spend more during exam weeks?

    ML connection: week_has_exam (binary) used as a feature
    in the logistic regression model in model.py. The stress
    spending pattern also feeds into burnout detection.
    """
    if not expenses:
        return {"has_insight": False, "insight": None, "data_points": []}

    weekly_spend = defaultdict(float)
    for e in expenses:
        week = e.date - timedelta(days=e.date.weekday())
        weekly_spend[str(week)] += e.amount

    exam_weeks = set()
    for s in scores:
        week = s.date - timedelta(days=s.date.weekday())
        exam_weeks.add(str(week))

    if len(weekly_spend) < 3:
        return {"has_insight": False, "insight": None, "data_points": []}

    exam_w_spending   = [v for k, v in weekly_spend.items() if k in exam_weeks]
    normal_w_spending = [v for k, v in weekly_spend.items() if k not in exam_weeks]

    data_points = [
        {"week": k, "amount": round(v), "has_exam": k in exam_weeks}
        for k, v in sorted(weekly_spend.items())
    ]

    insight = None
    if exam_w_spending and normal_w_spending:
        exam_avg   = sum(exam_w_spending) / len(exam_w_spending)
        normal_avg = sum(normal_w_spending) / len(normal_w_spending)
        diff_pct   = round((exam_avg - normal_avg) / max(1, normal_avg) * 100)

        if diff_pct > 20:
            insight = (
                f"You spend ₹{exam_avg:.0f} on average in exam weeks vs ₹{normal_avg:.0f} normally — "
                f"{diff_pct}% more. Stress spending is a real pattern for you."
            )
        elif diff_pct > 0:
            insight = (
                f"You spend slightly more in exam weeks (₹{exam_avg:.0f} vs ₹{normal_avg:.0f}). "
                f"Not a big difference yet, but worth watching."
            )
        elif diff_pct < -10:
            insight = (
                f"You actually spend less during exam weeks (₹{exam_avg:.0f} vs ₹{normal_avg:.0f}). "
                f"Exam pressure keeps you focused and at home."
            )

    return {
        "has_insight": insight is not None,
        "insight"    : insight,
        "data_points": data_points,
        "label"      : "Expenses × Exam Stress"
    }


# ══════════════════════════════════════════════
# INSIGHT 4: PLACEMENT BEHAVIOR PREDICTOR
# Now uses ML model scores where available
# ══════════════════════════════════════════════

def placement_readiness_score(scores, streaks, streak_checkins,
                              career_goals, attendance_subjects,
                              attendance_records) -> dict:
    """
    What behavior pattern predicts placement success?

    ML connection: when model.py is trained, the subject
    cluster labels (Strong/Needs Work/At Risk) from KMeans
    are used to adjust the marks score instead of just
    using raw averages. This makes the placement score
    more nuanced — it reflects pattern not just average.
    """
    breakdown = {}
    total     = 0

    # ── 1. MARKS / CGPA (25 pts) ─────────────────────────────────────────────
    if scores:
        # Try using KMeans cluster from model.py
        ml_cluster_used = False
        if MODEL_AVAILABLE and len(set(s.subject for s in scores)) >= 3:
            try:
                clusters = cluster_subjects(scores)
                strong_count   = sum(1 for v in clusters.values() if v["cluster"] == "Strong")
                at_risk_count  = sum(1 for v in clusters.values() if v["cluster"] == "At Risk")
                total_subjects = len(clusters)

                if total_subjects > 0:
                    strong_ratio = strong_count / total_subjects
                    risk_ratio   = at_risk_count / total_subjects

                    if strong_ratio >= 0.6:
                        marks_pts  = 25
                        marks_note = f"ML: {strong_count}/{total_subjects} subjects are Strong. Excellent marks profile."
                    elif risk_ratio >= 0.5:
                        marks_pts  = 6
                        marks_note = f"ML: {at_risk_count}/{total_subjects} subjects are At Risk. Priority attention needed."
                    else:
                        marks_pts  = 14
                        marks_note = f"ML: Mixed marks profile. Push weak subjects to improve this score."
                    ml_cluster_used = True
            except Exception:
                pass

        if not ml_cluster_used:
            avg_pct = sum(s.percentage for s in scores) / len(scores)
            if avg_pct >= 75:
                marks_pts  = 25
                marks_note = "Strong marks — above 7.5 CGPA threshold most companies set."
            elif avg_pct >= 65:
                marks_pts  = 18
                marks_note = "Decent marks. Push above 75% in remaining exams to secure shortlists."
            elif avg_pct >= 55:
                marks_pts  = 10
                marks_note = "Marks are on the edge. Several companies have 7.0 cutoff."
            else:
                marks_pts  = 4
                marks_note = "Low marks are the biggest red flag. This is priority #1."

        breakdown["marks"] = {"score": marks_pts, "max": 25, "note": marks_note}
        total += marks_pts
    else:
        breakdown["marks"] = {"score": 0, "max": 25, "note": "No marks logged yet."}

    # ── 2. DSA / LEETCODE STREAK (25 pts) ────────────────────────────────────
    dsa_keywords = ["leetcode", "dsa", "coding", "cp", "competitive", "problem", "algorithm"]
    dsa_streak   = next((st for st in streaks
                        if any(kw in st.name.lower() for kw in dsa_keywords)), None)

    if dsa_streak:
        checkins    = [c for c in streak_checkins
                      if c.streak_id == dsa_streak.id and c.done]
        total_days  = max(1, (date.today() -
                              dsa_streak.created_at.date()).days
                         if hasattr(dsa_streak.created_at, 'date') else 30)
        consistency = min(100, round(len(checkins) / total_days * 100))
        stats       = calculate_streak([c.date for c in checkins], [])

        if consistency >= 70:
            dsa_pts  = 25
            dsa_note = f"Excellent DSA consistency ({consistency}%). This is what product companies look for."
        elif consistency >= 50:
            dsa_pts  = 16
            dsa_note = f"Good DSA habit ({consistency}% consistent). Push to daily practice."
        elif consistency >= 30:
            dsa_pts  = 8
            dsa_note = f"DSA practice is inconsistent ({consistency}%). Most shortlisted candidates solve daily."
        else:
            dsa_pts  = 3
            dsa_note = f"Very low DSA consistency ({consistency}%). Critical gap for tech placements."

        breakdown["dsa"] = {"score": dsa_pts, "max": 25, "note": dsa_note}
        total += dsa_pts
    else:
        breakdown["dsa"] = {"score": 0, "max": 25,
                            "note": "No DSA streak tracked. Add a LeetCode or DSA streak."}

    # ── 3. ATTENDANCE DISCIPLINE (20 pts) ────────────────────────────────────
    if attendance_subjects:
        danger_count = 0
        for s in attendance_subjects:
            records  = [r for r in attendance_records if r.subject_id == s.id]
            attended = sum(1 for r in records if r.present)
            held     = len(records)
            pct      = (attended / held * 100) if held > 0 else 100
            if pct < s.min_percentage:
                danger_count += 1

        if danger_count == 0:
            att_pts  = 20
            att_note = "All subjects above minimum. Good discipline."
        elif danger_count == 1:
            att_pts  = 12
            att_note = f"1 subject below minimum. Risk of being debarred."
        else:
            att_pts  = 4
            att_note = f"{danger_count} subjects below minimum. Fix this first."

        breakdown["attendance"] = {"score": att_pts, "max": 20, "note": att_note}
        total += att_pts
    else:
        breakdown["attendance"] = {"score": 10, "max": 20,
                                   "note": "No attendance tracked. Add subjects to score this."}
        total += 10

    # ── 4. CAREER CHECKLIST (20 pts) ─────────────────────────────────────────
    if career_goals:
        done_count  = sum(1 for g in career_goals if g.status == "done")
        total_count = len(career_goals)
        completion  = round(done_count / total_count * 100) if total_count > 0 else 0

        if completion >= 70:
            career_pts  = 20
            career_note = f"Career checklist {completion}% done. Strong preparation."
        elif completion >= 40:
            career_pts  = 12
            career_note = f"Career checklist {completion}% done. Keep going."
        else:
            career_pts  = 5
            career_note = f"Career checklist only {completion}% done. Review your goals."

        breakdown["career"] = {"score": career_pts, "max": 20, "note": career_note}
        total += career_pts
    else:
        breakdown["career"] = {"score": 0, "max": 20,
                               "note": "No career goals set. Go to Career Goals from the profile menu."}

    # ── 5. OVERALL CONSISTENCY (10 pts) ──────────────────────────────────────
    if streak_checkins:
        recent_cutoff   = date.today() - timedelta(days=30)
        recent_checkins = [c for c in streak_checkins
                          if c.date >= recent_cutoff and c.done]
        total_possible  = 30 * max(1, len(set(c.streak_id for c in streak_checkins)))
        overall_pct     = min(100, round(len(recent_checkins) / total_possible * 100))

        if overall_pct >= 60:
            cons_pts  = 10
            cons_note = f"High overall consistency ({overall_pct}%) — shows discipline."
        elif overall_pct >= 40:
            cons_pts  = 6
            cons_note = f"Moderate consistency ({overall_pct}%). Work on building one strong habit."
        else:
            cons_pts  = 2
            cons_note = f"Low overall consistency ({overall_pct}%). Start with one habit first."

        breakdown["consistency"] = {"score": cons_pts, "max": 10, "note": cons_note}
        total += cons_pts
    else:
        breakdown["consistency"] = {"score": 0, "max": 10,
                                    "note": "No streaks tracked yet."}

    if total >= 80:
        label   = "Strong"
        summary = "Strong position. Keep consistency up through placement season."
    elif total >= 60:
        label   = "On track"
        summary = "Good foundation. The gaps above are specific and fixable."
    elif total >= 40:
        label   = "Needs work"
        summary = "Several areas need attention. Focus on marks and DSA first."
    else:
        label   = "Early stage"
        summary = "Start with one thing: daily DSA or pushing marks up. Not both at once."

    return {
        "score"    : total,
        "max"      : 100,
        "label"    : label,
        "summary"  : summary,
        "breakdown": breakdown
    }


# ══════════════════════════════════════════════
# INSIGHT 5: MOOD → PERFORMANCE CORRELATION
# ══════════════════════════════════════════════

def mood_performance_correlation(weekly_checkins, scores, streak_checkins) -> dict:
    """
    Does mood affect exam performance?

    ML connection: mood_score is already a feature in
    the Linear Regression model in model.py. This insight
    shows the student the raw correlation so they understand
    WHY mood is in the prediction model.
    """
    if not weekly_checkins:
        return {
            "has_insight": False,
            "insight"    : "No weekly check-ins yet. Fill in Sunday check-in from your profile.",
            "data_points": []
        }

    data_points = []
    for checkin in weekly_checkins:
        week_start = checkin.week_start
        week_end   = week_start + timedelta(days=6)

        week_scores = [s.percentage for s in scores
                      if week_start <= s.date <= week_end]

        week_checkins_done = sum(1 for c in streak_checkins
                                if week_start <= c.date <= week_end and c.done)
        total_possible     = max(1, 7 * max(1, len(set(c.streak_id for c in streak_checkins))))
        streak_pct         = min(100, round(week_checkins_done / total_possible * 100))

        data_points.append({
            "week"      : str(week_start),
            "mood"      : checkin.mood,
            "avg_score" : round(sum(week_scores)/len(week_scores), 1) if week_scores else None,
            "streak_pct": streak_pct,
        })

    scored_weeks = [d for d in data_points if d["avg_score"] is not None]
    if len(scored_weeks) < 2:
        return {
            "has_insight": False,
            "insight"    : (
                f"You have {len(weekly_checkins)} check-in(s) but need overlapping test scores. "
                "Keep logging — needs a few weeks of both."
            ),
            "data_points": data_points
        }

    high_mood = [d for d in scored_weeks if d["mood"] >= 4]
    low_mood  = [d for d in scored_weeks if d["mood"] <= 2]

    insight = None
    if high_mood and low_mood:
        high_score  = sum(d["avg_score"] for d in high_mood) / len(high_mood)
        low_score   = sum(d["avg_score"] for d in low_mood) / len(low_mood)
        diff        = round(high_score - low_score, 1)
        high_streak = sum(d["streak_pct"] for d in high_mood) / len(high_mood)
        low_streak  = sum(d["streak_pct"] for d in low_mood) / len(low_mood)

        if diff > 10:
            insight = (
                f"Strong pattern: in good weeks (mood 4-5) you score {high_score:.0f}% on average. "
                f"In rough weeks (mood 1-2), that drops to {low_score:.0f}%. "
                f"Your mood is a {diff:.0f}-point swing in exam performance."
            )
        elif diff > 5:
            insight = (
                f"Mild pattern: better mood weeks give slightly better scores "
                f"({high_score:.0f}% vs {low_score:.0f}%). Also, streak consistency "
                f"is {high_streak:.0f}% on good weeks vs {low_streak:.0f}% on rough weeks."
            )
        else:
            insight = (
                f"No strong mood-performance pattern yet — scores stay relatively stable "
                f"regardless of weekly mood."
            )
    else:
        insight = "Need a mix of good and rough weeks to find a pattern. Keep checking in."

    return {
        "has_insight": insight is not None and "strong" in insight.lower(),
        "insight"    : insight,
        "data_points": data_points,
        "label"      : "Mood × Performance"
    }


# ══════════════════════════════════════════════
# INSIGHT 6: BURNOUT PREDICTION
# Now uses Logistic Regression from model.py
# ══════════════════════════════════════════════

def detect_burnout(attendance_records, streak_checkins,
                   expenses, weekly_checkins, scores) -> dict:
    """
    Predict burnout before it becomes a crisis.

    ML connection: when logistic regression is trained in
    model.py, we use it to get a burnout probability score
    instead of just counting signals. The heuristic signal
    count is shown alongside the ML probability so the
    student understands both.

    Features passed to logistic model:
    - attendance_drop_score (0-1)
    - streak_break_score (0-1)
    - spending_spike_score (0-1)
    - mood_score (normalized 0-1)
    - score_decline_score (0-1)
    """
    signals    = []
    today      = date.today()
    week_ago   = today - timedelta(days=7)
    two_wk_ago = today - timedelta(days=14)

    # ── SIGNAL 1: Attendance dropping ────────────────────────────────────────
    this_wk_absent = sum(1 for r in attendance_records
                        if r.date >= week_ago and not r.present)
    last_wk_absent = sum(1 for r in attendance_records
                        if two_wk_ago <= r.date < week_ago and not r.present)
    att_drop_score = 0
    if this_wk_absent > last_wk_absent + 2:
        att_drop_score = 1
        signals.append({
            "type"    : "attendance_dropping",
            "message" : f"Missed {this_wk_absent} classes this week vs {last_wk_absent} last week.",
            "severity": "high"
        })

    # ── SIGNAL 2: Streaks breaking ────────────────────────────────────────────
    streak_ids = set(c.streak_id for c in streak_checkins)
    streak_break_score = 0
    if streak_ids:
        recent_done     = sum(1 for c in streak_checkins if c.date >= week_ago and c.done)
        expected_weekly = 7 * len(streak_ids)
        completion_rate = recent_done / max(1, expected_weekly)
        if completion_rate < 0.4:
            streak_break_score = 1
            signals.append({
                "type"    : "streaks_breaking",
                "message" : f"Only {round(completion_rate*100)}% of daily habits completed this week.",
                "severity": "medium"
            })

    # ── SIGNAL 3: Spending spiked ─────────────────────────────────────────────
    this_wk_spent  = sum(e.amount for e in expenses if e.date >= week_ago)
    last_wk_spent  = sum(e.amount for e in expenses if two_wk_ago <= e.date < week_ago)
    spending_score = 0
    if last_wk_spent > 0 and this_wk_spent > last_wk_spent * 1.5:
        spending_score = 1
        signals.append({
            "type"    : "spending_spiked",
            "message" : f"Spent ₹{this_wk_spent-last_wk_spent:.0f} more than last week.",
            "severity": "medium"
        })

    # ── SIGNAL 4: Mood low ────────────────────────────────────────────────────
    recent_mood_objs = [c for c in weekly_checkins
                       if c.week_start >= two_wk_ago - timedelta(days=7)]
    mood_raw   = sum(c.mood for c in recent_mood_objs)/len(recent_mood_objs) if recent_mood_objs else 3
    mood_score = 0
    if mood_raw < 2.5:
        mood_score = 1
        signals.append({
            "type"    : "mood_low",
            "message" : f"Weekly mood rating is {mood_raw:.1f}/5 — below threshold.",
            "severity": "high"
        })

    # ── SIGNAL 5: Scores declining ────────────────────────────────────────────
    recent_scores  = sorted([s for s in scores if s.date >= two_wk_ago],
                            key=lambda x: x.date)
    score_decline  = 0
    if len(recent_scores) >= 4:
        first_half  = [s.percentage for s in recent_scores[:2]]
        second_half = [s.percentage for s in recent_scores[-2:]]
        if sum(second_half)/2 < sum(first_half)/2 - 10:
            score_decline = 1
            signals.append({
                "type"    : "scores_declining",
                "message" : "Test scores dropped significantly in the past two weeks.",
                "severity": "high"
            })

    # ── ML CONNECTION: try logistic regression ───────────────────────────────
    ml_probability = None
    ml_used        = False

    if MODEL_AVAILABLE and len(scores) >= 6:
        try:
            # Use the per-subject at-risk predictions as a proxy for burnout probability
            # Average at-risk probability across all subjects
            subjects = list(set(s.subject for s in scores))
            risk_probs = []
            for subject in subjects:
                pred = predict_at_risk(subject, scores, streak_checkins, [])
                if pred.get("probability") is not None:
                    risk_probs.append(pred["probability"])

            if risk_probs:
                avg_risk       = sum(risk_probs) / len(risk_probs)
                # Combine ML risk with signal count
                signal_factor  = len(signals) / 5  # normalize 0-1
                ml_probability = round((avg_risk * 0.6 + signal_factor * 100 * 0.4), 1)
                ml_used        = True
        except Exception:
            pass

    # ── DETERMINE RISK LEVEL ──────────────────────────────────────────────────
    high_severity = sum(1 for s in signals if s["severity"] == "high")
    count         = len(signals)

    # If ML available, use probability to refine level
    if ml_used and ml_probability is not None:
        if ml_probability >= 70:
            level   = "burnout"
            message = "Burnout — not laziness, not bad luck. Seriously consider taking a day completely off."
        elif ml_probability >= 50:
            level   = "alert"
            message = "Multiple stress signals across modules. This isn't a one-off bad day."
        elif ml_probability >= 30:
            level   = "watch"
            message = "A couple of warning signs. Worth paying attention this week."
        else:
            level   = "fine"
            message = None
    else:
        # Heuristic fallback
        if count == 0:
            level, message = "fine", None
        elif count <= 2 and high_severity <= 1:
            level, message = "watch", "A couple of warning signs. Worth paying attention."
        elif count == 3 or high_severity == 2:
            level, message = "alert", "Multiple areas showing stress at once."
        else:
            level, message = "burnout", "This looks like burnout. Take a full day off."

    return {
        "level"         : level,
        "message"       : message,
        "signals"       : signals,
        "count"         : count,
        "ml_probability": ml_probability,
        "ml_used"       : ml_used
    }


# ══════════════════════════════════════════════
# SEMESTER TIMELINE
# ══════════════════════════════════════════════

def semester_timeline(semester_start: date, semester_end: date, scores) -> dict:
    today        = date.today()
    total_days   = (semester_end - semester_start).days
    elapsed_days = (today - semester_start).days
    progress_pct = round(min(100, elapsed_days / max(1, total_days) * 100))
    weeks_left   = max(0, (semester_end - today).days // 7)
    exam_dates   = sorted(set(s.date for s in scores), reverse=True)[:5]

    return {
        "progress_pct": progress_pct,
        "weeks_left"  : weeks_left,
        "days_elapsed": elapsed_days,
        "total_days"  : total_days,
        "recent_exams": [str(d) for d in exam_dates],
        "label"       : f"Week {elapsed_days // 7 + 1} of {total_days // 7}"
    }