"""
model.py — ML models for Jarvis

Three models:

1. LINEAR REGRESSION
   Predicts next exam score for a subject.
   Features: previous scores, score trend, streak consistency, mood.
   WHY: Previous marks are the strongest predictor of next marks.
   Honest and realistic — no study hours, no fake features.

2. KMEANS CLUSTERING
   Groups subjects into 3 clusters: Strong / Needs Work / At Risk.
   Features: average marks, score trend, performance variance.
   WHY: Gives students a clear priority order — which subject
   needs attention most, based purely on mark patterns.

3. LOGISTIC REGRESSION
   Predicts if student is at risk of scoring below 50% in next exam.
   Binary output: at_risk (1) or fine (0).
   Features: last 2 scores, trend, mood, streak consistency.
   WHY: Early warning before it's too late to act.

HOW TRAINING WORKS:
- Models train automatically when enough data exists
- Minimum data to train: 5+ scores for linear/logistic, 3+ subjects for clustering
- If not enough data: falls back to heuristic estimate clearly labeled as such
- Trained models saved to disk (jarvis_models/) using joblib
- Reloaded on next app start — no retraining every time
- Accuracy tracked: every prediction stored, compared to actual
  outcome when the next real score is logged

DATA FLOW:
scores table → feature engineering → model training → prediction
    ↓
actual score logged → compare to prediction → update accuracy log
"""

import os
import json
import joblib
import numpy as np
from datetime import date, datetime
from collections import defaultdict
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, accuracy_score


# ── SETUP ─────────────────────────────────────────────────────────────────────
MODEL_DIR    = os.path.join(os.path.dirname(__file__), "jarvis_models")
ACCURACY_LOG = os.path.join(MODEL_DIR, "accuracy_log.json")

os.makedirs(MODEL_DIR, exist_ok=True)

# Minimum data required to train each model
MIN_SCORES_FOR_LINEAR    = 5   # need 5+ score records
MIN_SCORES_FOR_LOGISTIC  = 6   # need 6+ to have train/test split
MIN_SUBJECTS_FOR_CLUSTER = 3   # need 3+ subjects to cluster


# ══════════════════════════════════════════════
# FEATURE ENGINEERING
# ══════════════════════════════════════════════

def build_score_features(scores: list, streak_checkins: list, weekly_checkins: list) -> list:
    """
    Turn raw score records into ML-ready feature vectors.

    Each row = one exam event with features describing
    what the student's state was at that point.

    Features per exam:
    - prev_score      : their previous score in same subject (0 if first)
    - prev_score_2    : score before that (0 if not available)
    - score_trend     : prev_score minus prev_score_2 (positive = improving)
    - subject_avg     : running average in subject before this exam
    - streak_pct      : streak consistency % in the week before exam
    - mood_score      : mood from weekly check-in closest to exam (3 if none)
    - exam_type_enc   : encoded exam type (quiz=1, assignment=2, mid-sem=3, end-sem=4, lab=2)
    - target          : actual score (what we want to predict)
    """
    if not scores:
        return []

    # Sort scores by date
    sorted_scores = sorted(scores, key=lambda x: x.date)

    # Group by subject to compute per-subject running averages
    subject_history = defaultdict(list)

    # Weekly streak consistency — checkins per week
    weekly_streak = defaultdict(int)
    weekly_total  = defaultdict(int)
    streak_ids    = set(c.streak_id for c in streak_checkins)
    for c in streak_checkins:
        if c.done:
            week = str(c.date - __import__('datetime').timedelta(days=c.date.weekday()))
            weekly_streak[week] += 1
    for week_key in weekly_streak:
        weekly_total[week_key] = max(1, len(streak_ids) * 7)

    # Weekly mood from check-ins
    mood_by_week = {}
    for w in weekly_checkins:
        mood_by_week[str(w.week_start)] = w.mood

    def get_streak_pct(exam_date):
        """Streak consistency in week of exam."""
        week = str(exam_date - __import__('datetime').timedelta(days=exam_date.weekday()))
        done  = weekly_streak.get(week, 0)
        total = weekly_total.get(week, 1)
        return round(done / total * 100) if total > 0 else 50

    def get_mood(exam_date):
        """Mood rating in week of exam. Default 3 (neutral) if no check-in."""
        week = str(exam_date - __import__('datetime').timedelta(days=exam_date.weekday()))
        return mood_by_week.get(week, 3)

    def encode_exam_type(exam_type):
        mapping = {'quiz': 1, 'assignment': 2, 'lab': 2, 'mid-sem': 3, 'end-sem': 4}
        return mapping.get(exam_type.lower(), 2)

    rows = []
    for score in sorted_scores:
        hist = subject_history[score.subject]

        prev_score   = hist[-1] if len(hist) >= 1 else score.percentage
        prev_score_2 = hist[-2] if len(hist) >= 2 else prev_score
        trend        = prev_score - prev_score_2
        subject_avg  = sum(hist) / len(hist) if hist else score.percentage

        row = {
            "prev_score"    : prev_score,
            "prev_score_2"  : prev_score_2,
            "score_trend"   : trend,
            "subject_avg"   : subject_avg,
            "streak_pct"    : get_streak_pct(score.date),
            "mood_score"    : get_mood(score.date),
            "exam_type_enc" : encode_exam_type(score.exam_type),
            "target"        : score.percentage,
            "subject"       : score.subject,
            "date"          : str(score.date),
            "score_id"      : score.id,
        }
        rows.append(row)
        subject_history[score.subject].append(score.percentage)

    return rows


def build_subject_features(scores: list) -> list:
    """
    Build one feature vector per subject for clustering.

    Features per subject:
    - avg_score      : average across all exams
    - score_trend    : slope of scores over time (positive = improving)
    - variance       : how inconsistent scores are (high = unpredictable)
    - min_score      : worst performance
    - exam_count     : how many exams logged
    """
    subject_scores = defaultdict(list)
    for s in sorted(scores, key=lambda x: x.date):
        subject_scores[s.subject].append(s.percentage)

    rows = []
    for subject, marks in subject_scores.items():
        if len(marks) < 1:
            continue

        avg      = sum(marks) / len(marks)
        variance = np.var(marks) if len(marks) > 1 else 0
        min_sc   = min(marks)

        # Trend: slope of scores (positive = improving over time)
        if len(marks) >= 2:
            x     = np.arange(len(marks)).reshape(-1, 1)
            y     = np.array(marks)
            reg   = LinearRegression().fit(x, y)
            trend = reg.coef_[0]
        else:
            trend = 0

        rows.append({
            "subject"    : subject,
            "avg_score"  : round(avg, 1),
            "score_trend": round(trend, 2),
            "variance"   : round(variance, 1),
            "min_score"  : min_sc,
            "exam_count" : len(marks),
        })

    return rows


# ══════════════════════════════════════════════
# MODEL 1 — LINEAR REGRESSION
# Predicts: next exam score for a subject
# ══════════════════════════════════════════════

def train_linear_model(scores, streak_checkins, weekly_checkins):
    """
    Train linear regression on all score records.
    Saves model + scaler to disk.

    Returns: model, scaler, training MAE
    """
    rows = build_score_features(scores, streak_checkins, weekly_checkins)

    if len(rows) < MIN_SCORES_FOR_LINEAR:
        return None, None, None

    feature_cols = ["prev_score", "prev_score_2", "score_trend",
                    "subject_avg", "streak_pct", "mood_score", "exam_type_enc"]

    X = np.array([[r[c] for c in feature_cols] for r in rows])
    y = np.array([r["target"] for r in rows])

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Train on all data (we have little — no hold-out yet)
    model = LinearRegression()
    model.fit(X_scaled, y)

    # Training MAE
    y_pred = model.predict(X_scaled)
    mae    = round(mean_absolute_error(y, y_pred), 2)

    # Save
    joblib.dump(model,  os.path.join(MODEL_DIR, "linear_model.pkl"))
    joblib.dump(scaler, os.path.join(MODEL_DIR, "linear_scaler.pkl"))

    return model, scaler, mae


def predict_next_score(subject: str, scores, streak_checkins, weekly_checkins) -> dict:
    """
    Predict next exam score for a given subject.

    If model is trained → use it.
    If not enough data → use heuristic (moving average).

    Returns: prediction, confidence, method used
    """
    subject_scores = sorted(
        [s for s in scores if s.subject == subject],
        key=lambda x: x.date
    )

    if not subject_scores:
        return {
            "prediction" : None,
            "confidence" : None,
            "method"     : "no_data",
            "message"    : "No scores logged for this subject yet."
        }

    # Try loading trained model
    model_path  = os.path.join(MODEL_DIR, "linear_model.pkl")
    scaler_path = os.path.join(MODEL_DIR, "linear_scaler.pkl")

    all_rows = build_score_features(scores, streak_checkins, weekly_checkins)

    if os.path.exists(model_path) and os.path.exists(scaler_path) and len(scores) >= MIN_SCORES_FOR_LINEAR:
        model  = joblib.load(model_path)
        scaler = joblib.load(scaler_path)

        # Build feature vector for NEXT exam in this subject
        marks        = [s.percentage for s in subject_scores]
        prev_score   = marks[-1]
        prev_score_2 = marks[-2] if len(marks) >= 2 else prev_score
        trend        = prev_score - prev_score_2
        subject_avg  = sum(marks) / len(marks)
        streak_pct   = 50  # assume average for future
        mood_score   = 3   # assume neutral for future
        exam_type    = 3   # assume mid-sem level

        features = np.array([[prev_score, prev_score_2, trend,
                              subject_avg, streak_pct, mood_score, exam_type]])
        features_scaled = scaler.transform(features)
        pred = float(model.predict(features_scaled)[0])
        pred = round(max(0, min(100, pred)), 1)

        # Confidence: higher when more data, lower when trend is volatile
        variance   = np.var(marks)
        confidence = "high" if len(marks) >= 5 and variance < 100 else \
                     "medium" if len(marks) >= 3 else "low"

        return {
            "prediction" : pred,
            "confidence" : confidence,
            "method"     : "linear_regression",
            "message"    : f"Based on your pattern in {subject}, next exam predicted at {pred}%."
        }

    else:
        # Heuristic fallback — weighted moving average (recent scores count more)
        marks  = [s.percentage for s in subject_scores]
        if len(marks) == 1:
            pred = marks[0]
        elif len(marks) == 2:
            pred = round(0.6 * marks[-1] + 0.4 * marks[-2], 1)
        else:
            pred = round(0.5 * marks[-1] + 0.3 * marks[-2] + 0.2 * marks[-3], 1)

        return {
            "prediction" : pred,
            "confidence" : "low",
            "method"     : "heuristic_moving_average",
            "message"    : f"Estimated from your last {len(marks)} score(s). Log more exams to unlock ML prediction."
        }


# ══════════════════════════════════════════════
# MODEL 2 — KMEANS CLUSTERING
# Groups subjects into: Strong / Needs Work / At Risk
# ══════════════════════════════════════════════

def cluster_subjects(scores: list) -> dict:
    """
    Cluster subjects into 3 groups based on mark patterns.

    Cluster labels are assigned by average score:
    - Highest avg cluster → Strong
    - Middle avg cluster  → Needs Work
    - Lowest avg cluster  → At Risk

    Returns: dict of subject → cluster label + stats
    """
    rows = build_subject_features(scores)

    if len(rows) < MIN_SUBJECTS_FOR_CLUSTER:
        # Not enough subjects — label manually
        result = {}
        for r in rows:
            label = "Strong" if r["avg_score"] >= 70 else \
                    "Needs Work" if r["avg_score"] >= 50 else "At Risk"
            result[r["subject"]] = {
                "cluster"   : label,
                "avg_score" : r["avg_score"],
                "trend"     : r["score_trend"],
                "method"    : "heuristic"
            }
        return result

    feature_cols = ["avg_score", "score_trend", "variance", "min_score"]
    X = np.array([[r[c] for c in feature_cols] for r in rows])

    # Scale
    scaler  = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # KMeans with 3 clusters
    n_clusters = min(3, len(rows))
    kmeans     = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels     = kmeans.fit_predict(X_scaled)

    # Save model
    joblib.dump(kmeans, os.path.join(MODEL_DIR, "kmeans_model.pkl"))
    joblib.dump(scaler, os.path.join(MODEL_DIR, "kmeans_scaler.pkl"))

    # Assign human labels by cluster average score
    cluster_avgs = defaultdict(list)
    for i, r in enumerate(rows):
        cluster_avgs[labels[i]].append(r["avg_score"])

    cluster_mean = {k: sum(v)/len(v) for k, v in cluster_avgs.items()}
    sorted_clusters = sorted(cluster_mean.items(), key=lambda x: x[1], reverse=True)
    label_map = {}
    label_names = ["Strong", "Needs Work", "At Risk"]
    for i, (cluster_id, _) in enumerate(sorted_clusters):
        label_map[cluster_id] = label_names[i] if i < len(label_names) else "Needs Work"

    result = {}
    for i, r in enumerate(rows):
        cluster_id  = labels[i]
        human_label = label_map[cluster_id]
        result[r["subject"]] = {
            "cluster"   : human_label,
            "avg_score" : r["avg_score"],
            "trend"     : r["score_trend"],
            "variance"  : r["variance"],
            "min_score" : r["min_score"],
            "method"    : "kmeans"
        }

    return result


# ══════════════════════════════════════════════
# MODEL 3 — LOGISTIC REGRESSION
# Predicts: is student at risk of scoring below 50% next exam?
# ══════════════════════════════════════════════

def train_logistic_model(scores, streak_checkins, weekly_checkins):
    """
    Train logistic regression on score records.
    Label: 1 if score < 50 (at risk), 0 if score >= 50 (fine)

    Saves model + scaler to disk.
    Returns: model, scaler, accuracy on training data
    """
    rows = build_score_features(scores, streak_checkins, weekly_checkins)

    if len(rows) < MIN_SCORES_FOR_LOGISTIC:
        return None, None, None

    feature_cols = ["prev_score", "prev_score_2", "score_trend",
                    "subject_avg", "streak_pct", "mood_score", "exam_type_enc"]

    X = np.array([[r[c] for c in feature_cols] for r in rows])
    y = np.array([1 if r["target"] < 50 else 0 for r in rows])

    # Need at least both classes to train
    if len(set(y)) < 2:
        return None, None, None

    scaler   = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = LogisticRegression(random_state=42, max_iter=200)
    model.fit(X_scaled, y)

    y_pred   = model.predict(X_scaled)
    accuracy = round(accuracy_score(y, y_pred) * 100, 1)

    joblib.dump(model,  os.path.join(MODEL_DIR, "logistic_model.pkl"))
    joblib.dump(scaler, os.path.join(MODEL_DIR, "logistic_scaler.pkl"))

    return model, scaler, accuracy


def predict_at_risk(subject: str, scores, streak_checkins, weekly_checkins) -> dict:
    """
    Predict whether student is at risk of scoring below 50%
    in their next exam for a given subject.

    Returns: at_risk (bool), probability, method
    """
    subject_scores = sorted(
        [s for s in scores if s.subject == subject],
        key=lambda x: x.date
    )

    if not subject_scores:
        return {
            "at_risk"    : False,
            "probability": 0,
            "method"     : "no_data",
            "message"    : "No scores logged for this subject."
        }

    model_path  = os.path.join(MODEL_DIR, "logistic_model.pkl")
    scaler_path = os.path.join(MODEL_DIR, "logistic_scaler.pkl")

    if os.path.exists(model_path) and os.path.exists(scaler_path) and len(scores) >= MIN_SCORES_FOR_LOGISTIC:
        model  = joblib.load(model_path)
        scaler = joblib.load(scaler_path)

        marks        = [s.percentage for s in subject_scores]
        prev_score   = marks[-1]
        prev_score_2 = marks[-2] if len(marks) >= 2 else prev_score
        trend        = prev_score - prev_score_2
        subject_avg  = sum(marks) / len(marks)

        features        = np.array([[prev_score, prev_score_2, trend, subject_avg, 50, 3, 3]])
        features_scaled = scaler.transform(features)
        prob            = float(model.predict_proba(features_scaled)[0][1])
        at_risk         = prob >= 0.5

        return {
            "at_risk"    : at_risk,
            "probability": round(prob * 100, 1),
            "method"     : "logistic_regression",
            "message"    : (
                f"{'High risk' if prob >= 0.7 else 'Moderate risk' if prob >= 0.5 else 'Low risk'} "
                f"of scoring below 50% — {round(prob*100)}% probability."
            )
        }

    else:
        # Heuristic fallback
        marks   = [s.percentage for s in subject_scores]
        avg     = sum(marks) / len(marks)
        at_risk = avg < 55 or (len(marks) >= 2 and marks[-1] < marks[-2] - 10)

        return {
            "at_risk"    : at_risk,
            "probability": None,
            "method"     : "heuristic",
            "message"    : (
                f"{'At risk based on current average ({avg:.0f}%).' if at_risk else 'Looking okay based on recent scores.'} "
                f"Log more exams to get probability-based prediction."
            )
        }


# ══════════════════════════════════════════════
# TRAIN ALL MODELS — called from main.py
# ══════════════════════════════════════════════

def train_all_models(scores, streak_checkins, weekly_checkins) -> dict:
    """
    Train all three models at once.
    Called when new score is logged or on app startup.

    Returns training results for each model.
    """
    results = {}

    # Model 1 — Linear Regression
    model, scaler, mae = train_linear_model(scores, streak_checkins, weekly_checkins)
    if model:
        results["linear"] = {
            "trained"      : True,
            "training_mae" : mae,
            "message"      : f"Score prediction model trained. Average error: {mae} marks."
        }
    else:
        results["linear"] = {
            "trained" : False,
            "message" : f"Need {MIN_SCORES_FOR_LINEAR}+ score records to train. Have {len(scores)}."
        }

    # Model 2 — KMeans
    subject_rows = build_subject_features(scores)
    if len(subject_rows) >= MIN_SUBJECTS_FOR_CLUSTER:
        clusters = cluster_subjects(scores)
        results["kmeans"] = {
            "trained"  : True,
            "clusters" : clusters,
            "message"  : f"Subjects clustered into Strong / Needs Work / At Risk."
        }
    else:
        results["kmeans"] = {
            "trained" : False,
            "message" : f"Need {MIN_SUBJECTS_FOR_CLUSTER}+ subjects to cluster. Have {len(subject_rows)}."
        }

    # Model 3 — Logistic Regression
    model, scaler, acc = train_logistic_model(scores, streak_checkins, weekly_checkins)
    if model:
        results["logistic"] = {
            "trained"          : True,
            "training_accuracy": acc,
            "message"          : f"At-risk prediction model trained. Training accuracy: {acc}%."
        }
    else:
        results["logistic"] = {
            "trained" : False,
            "message" : f"Need {MIN_SCORES_FOR_LOGISTIC}+ score records and both risk classes to train."
        }

    # Save training timestamp
    log = load_accuracy_log()
    log["last_trained"] = str(datetime.now())
    log["score_count"]  = len(scores)
    save_accuracy_log(log)

    return results


# ══════════════════════════════════════════════
# FULL PREDICTION — all subjects at once
# ══════════════════════════════════════════════

def predict_all_subjects(scores, streak_checkins, weekly_checkins) -> dict:
    """
    Run all three models for every subject the student has.
    Returns a clean dict ready to send to the frontend.
    """
    if not scores:
        return {"subjects": {}, "message": "No scores logged yet."}

    subjects = list(set(s.subject for s in scores))

    # Train if needed
    train_all_models(scores, streak_checkins, weekly_checkins)

    # Cluster subjects
    clusters = cluster_subjects(scores)

    result = {}
    for subject in subjects:
        score_pred = predict_next_score(subject, scores, streak_checkins, weekly_checkins)
        risk_pred  = predict_at_risk(subject, scores, streak_checkins, weekly_checkins)
        cluster    = clusters.get(subject, {"cluster": "Unknown", "avg_score": 0})

        result[subject] = {
            "cluster"         : cluster["cluster"],
            "avg_score"       : cluster["avg_score"],
            "predicted_score" : score_pred["prediction"],
            "prediction_conf" : score_pred["confidence"],
            "prediction_msg"  : score_pred["message"],
            "at_risk"         : risk_pred["at_risk"],
            "risk_prob"       : risk_pred["probability"],
            "risk_msg"        : risk_pred["message"],
            "method"          : score_pred["method"],
        }

    return {
        "subjects"     : result,
        "model_status" : get_model_status(),
    }


# ══════════════════════════════════════════════
# ACCURACY TRACKING
# ══════════════════════════════════════════════

def load_accuracy_log() -> dict:
    """Load the accuracy tracking log from disk."""
    if os.path.exists(ACCURACY_LOG):
        with open(ACCURACY_LOG, "r") as f:
            return json.load(f)
    return {
        "last_trained"    : None,
        "score_count"     : 0,
        "predictions"     : [],
        "linear_mae_log"  : [],
        "logistic_acc_log": []
    }


def save_accuracy_log(log: dict):
    """Save accuracy log to disk."""
    with open(ACCURACY_LOG, "w") as f:
        json.dump(log, f, indent=2)


def log_prediction(subject: str, predicted_score: float, exam_type: str):
    """
    Store a prediction before the real score is known.
    Called when a prediction is made.
    """
    log  = load_accuracy_log()
    entry = {
        "id"             : len(log["predictions"]) + 1,
        "subject"        : subject,
        "predicted_score": predicted_score,
        "exam_type"      : exam_type,
        "predicted_at"   : str(date.today()),
        "actual_score"   : None,
        "error"          : None,
        "resolved"       : False,
    }
    log["predictions"].append(entry)
    save_accuracy_log(log)
    return entry["id"]


def resolve_prediction(prediction_id: int, actual_score: float):
    """
    When a real score is logged, find the matching prediction
    and record how accurate we were.
    Called automatically when /scores POST happens.
    """
    log = load_accuracy_log()

    for pred in log["predictions"]:
        if pred["id"] == prediction_id and not pred["resolved"]:
            pred["actual_score"] = actual_score
            pred["error"]        = round(abs(actual_score - pred["predicted_score"]), 1)
            pred["resolved"]     = True

            # Update rolling MAE
            resolved = [p for p in log["predictions"] if p["resolved"]]
            if resolved:
                all_errors = [p["error"] for p in resolved if p["error"] is not None]
                log["linear_mae_log"].append({
                    "date": str(date.today()),
                    "mae" : round(sum(all_errors) / len(all_errors), 2)
                })
            break

    save_accuracy_log(log)


def get_accuracy_summary() -> dict:
    """
    Return current model accuracy summary.
    Shown in the Insights page so student can see how well predictions work.
    """
    log = load_accuracy_log()

    resolved = [p for p in log.get("predictions", []) if p["resolved"]]
    if not resolved:
        return {
            "predictions_made"   : len(log.get("predictions", [])),
            "predictions_resolved": 0,
            "current_mae"        : None,
            "accuracy_trend"     : [],
            "message"            : "No predictions verified yet. Make a prediction, then log the actual score."
        }

    errors      = [p["error"] for p in resolved if p["error"] is not None]
    current_mae = round(sum(errors) / len(errors), 2) if errors else None

    return {
        "predictions_made"    : len(log.get("predictions", [])),
        "predictions_resolved": len(resolved),
        "current_mae"         : current_mae,
        "accuracy_trend"      : log.get("linear_mae_log", [])[-10:],
        "message"             : f"Average prediction error: {current_mae} marks across {len(resolved)} verified predictions."
                                if current_mae else "No accuracy data yet."
    }


def get_model_status() -> dict:
    """
    Check which models are trained and ready.
    Shown in UI so student knows what's active vs heuristic.
    """
    log = load_accuracy_log()
    return {
        "linear_trained"  : os.path.exists(os.path.join(MODEL_DIR, "linear_model.pkl")),
        "kmeans_trained"  : os.path.exists(os.path.join(MODEL_DIR, "kmeans_model.pkl")),
        "logistic_trained": os.path.exists(os.path.join(MODEL_DIR, "logistic_model.pkl")),
        "last_trained"    : log.get("last_trained"),
        "score_count"     : log.get("score_count", 0),
        "accuracy"        : get_accuracy_summary(),
    }