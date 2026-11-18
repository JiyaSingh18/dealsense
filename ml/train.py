"""
DealSense - train the lead-scoring model and export it for in-browser inference.

  python ml/train.py

Reads ml/data/leads.csv (synthetic), trains:
  * StandardScaler + LogisticRegression  -> shipped to the browser (exact, explainable)
  * GradientBoostingClassifier           -> benchmark only (to show what the linear model gives up)
Writes src/data/model.json with weights, scaler stats, metrics, ROC/PR/calibration curves.
"""
import json, os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split, StratifiedKFold, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import (roc_auc_score, average_precision_score, accuracy_score, precision_score,
                             recall_score, f1_score, brier_score_loss, roc_curve, confusion_matrix,
                             precision_recall_curve, log_loss)
from sklearn.calibration import calibration_curve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FEATURES = ["budget_fit", "timeline_urgency", "financing_ready", "plan_interest", "registration_intent",
            "objections_raised", "open_objections", "positive_signals", "negative_signals",
            "buyer_sentiment", "buyer_questions", "is_referral"]
LABELS = {
    "budget_fit": "Budget fits price", "timeline_urgency": "Purchase urgency", "financing_ready": "Financing ready",
    "plan_interest": "Interest in 1%/month plan", "registration_intent": "Asked to register / book",
    "objections_raised": "Objections raised", "open_objections": "Unresolved objections",
    "positive_signals": "Positive buying signals", "negative_signals": "Negative signals",
    "buyer_sentiment": "Buyer sentiment", "buyer_questions": "Buyer questions (engagement)",
    "is_referral": "Referral lead",
}

df = pd.read_csv(os.path.join(ROOT, "ml", "data", "leads.csv"))
X, y = df[FEATURES].values.astype(float), df["booked"].values
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.25, stratify=y, random_state=18)

lr = make_pipeline(StandardScaler(), LogisticRegression(C=1.0, max_iter=1000))
gb = GradientBoostingClassifier(n_estimators=250, max_depth=3, learning_rate=0.05, subsample=0.9, random_state=18)
cv = StratifiedKFold(5, shuffle=True, random_state=18)
cv_lr = cross_val_score(lr, Xtr, ytr, cv=cv, scoring="roc_auc")
cv_gb = cross_val_score(gb, Xtr, ytr, cv=cv, scoring="roc_auc")
lr.fit(Xtr, ytr); gb.fit(Xtr, ytr)


def evaluate(model, name, thr):
    p = model.predict_proba(Xte)[:, 1]
    pred = (p >= thr).astype(int)
    return p, {
        "name": name, "auc": roc_auc_score(yte, p), "pr_auc": average_precision_score(yte, p),
        "accuracy": accuracy_score(yte, pred), "precision": precision_score(yte, pred),
        "recall": recall_score(yte, pred), "f1": f1_score(yte, pred), "brier": brier_score_loss(yte, p),
        "log_loss": log_loss(yte, p), "threshold": thr,
    }

# pick the decision threshold that maximises F1 on out-of-fold training predictions (not on test)
from sklearn.model_selection import cross_val_predict
oof = cross_val_predict(lr, Xtr, ytr, cv=cv, method="predict_proba")[:, 1]
pr, rc, th = precision_recall_curve(ytr, oof)
f1s = 2 * pr * rc / (pr + rc + 1e-9)
thr = float(np.round(th[np.argmax(f1s[:-1])], 3))

p_lr, m_lr = evaluate(lr, "Logistic regression (shipped)", thr)
p_gb, m_gb = evaluate(gb, "Gradient boosting (benchmark)", thr)
m_lr["cv_auc_mean"], m_lr["cv_auc_std"] = cv_lr.mean(), cv_lr.std()
m_gb["cv_auc_mean"], m_gb["cv_auc_std"] = cv_gb.mean(), cv_gb.std()

fpr, tpr, _ = roc_curve(yte, p_lr)
fpr_g, tpr_g, _ = roc_curve(yte, p_gb)
idx = np.linspace(0, len(fpr) - 1, 60).astype(int)
idx_g = np.linspace(0, len(fpr_g) - 1, 60).astype(int)
frac, mean_pred = calibration_curve(yte, p_lr, n_bins=8, strategy="quantile")
cm = confusion_matrix(yte, (p_lr >= thr).astype(int)).tolist()

# lift / gains: share of bookings captured when calling the top-k% scored leads first
order = np.argsort(-p_lr)
ys = yte[order]
gains = [{"pct": int(k), "captured": float(ys[: max(1, int(len(ys) * k / 100))].sum() / ys.sum())} for k in range(0, 101, 10)]
gains[0]["captured"] = 0.0
top20_rate = ys[: int(len(ys) * 0.2)].mean()

scaler, clf = lr.named_steps["standardscaler"], lr.named_steps["logisticregression"]
r = lambda v: float(np.round(v, 4))
model = {
    "type": "logistic_regression", "features": FEATURES, "labels": LABELS,
    "mean": [r(v) for v in scaler.mean_], "scale": [r(v) for v in scaler.scale_],
    "coef": [r(v) for v in clf.coef_[0]], "intercept": r(clf.intercept_[0]), "threshold": thr,
    "gb_importance": {f: r(v) for f, v in zip(FEATURES, gb.feature_importances_)},
    "metrics": {"lr": {k: (r(v) if isinstance(v, float) else v) for k, v in m_lr.items()},
                "gb": {k: (r(v) if isinstance(v, float) else v) for k, v in m_gb.items()}},
    "roc": [{"fpr": r(fpr[i]), "tpr": r(tpr[i])} for i in idx],
    "roc_gb": [{"fpr": r(fpr_g[i]), "tpr": r(tpr_g[i])} for i in idx_g],
    "calibration": [{"predicted": r(a), "observed": r(b)} for a, b in zip(mean_pred, frac)],
    "confusion": cm, "gains": gains,
    "dataset": {"rows": int(len(df)), "train": int(len(ytr)), "test": int(len(yte)),
                "positive_rate": r(y.mean()), "top20_conversion": r(top20_rate), "synthetic": True},
}
with open(os.path.join(ROOT, "src", "data", "model.json"), "w") as f:
    json.dump(model, f, indent=1)

print(f"threshold={thr}")
for m in (m_lr, m_gb):
    print(f"{m['name']:34s} AUC={m['auc']:.3f} CV={m['cv_auc_mean']:.3f}±{m['cv_auc_std']:.3f} PR-AUC={m['pr_auc']:.3f} "
          f"F1={m['f1']:.3f} P={m['precision']:.3f} R={m['recall']:.3f} Brier={m['brier']:.3f}")
print("top-20% conversion", round(top20_rate, 3), "vs base", round(y.mean(), 3))
print("coef:", dict(zip(FEATURES, model["coef"])))
