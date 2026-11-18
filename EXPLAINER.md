# DealSense: one-page explainer

*For Jiya, read this before the demo. Live: https://jiyasingh18.github.io/dealsense/ · Code: https://github.com/JiyaSingh18/dealsense*

## 1. The problem (30 seconds)
In a fully digital launch there's no site office or sample flat. Every sale runs through calls and chats, often thousands of them. Managers can't listen to them all, and reps don't know in the moment which buyer is close to booking or which objection is about to lose the deal. **DealSense turns every call into a live score, a list of what the buyer actually said they need, and the objection that's open right now, with the best reply ready.**

## 2. Architecture in plain English
1. **Offline (Python):** `ml/generate_data.py` creates 2,000 synthetic call-feature rows and 28 synthetic call transcripts (English + Hinglish). `ml/train.py` trains a scikit-learn model and writes `src/data/model.json`, containing the scaler's means and standard deviations, the coefficients, and all the metrics and curves.
2. **In the browser (TypeScript):** each transcript line goes through `nlp.ts`, a fast regex and lexicon extractor that knows English and Hinglish ("loan milega ya nahi", "budget 55 lakh tak"). It updates 12 features, such as budget fit, urgency, financing readiness, interest in the 1%/month plan, registration intent, open objections, buying signals and sentiment.
3. `model.ts` does the exact maths sklearn does: standardise → dot product with the coefficients → sigmoid. That gives the probability in microseconds, and **each feature's contribution** for the "Why this score" panel.
4. **Optional:** a DistilBERT sentiment model runs on-device via transformers.js. It's loaded only when you switch it on, and the app never depends on it.
5. Everything is static (Vite + React + TS + Tailwind + Recharts), deployed to GitHub Pages and Vercel. No server, no API keys.

## 3. How the model works and how good it is
* **Logistic regression** on 12 standardised features, predicting "booked (paid 9.9%)". It's compared against **gradient boosting** as a benchmark.
* Held-out test (500 rows): **ROC-AUC 0.911** (5-fold CV 0.908 ± 0.008), PR-AUC 0.781, F1 0.681 at a threshold of 0.406, Brier score 0.097 (well calibrated). Gradient boosting scored lower, AUC 0.893.
* **Business framing:** if reps call the top 20% of leads by score first, they reach **62% of all bookings**. Those leads convert at 73% vs. a 23% base rate.
* The threshold is chosen by maximising F1 on *out-of-fold training* predictions, never on the test set.
* **Cold start:** at second 0 every count feature is 0, which would look like a bad lead. So the score is shrunk toward the base rate until the buyer has spoken about 6 times. After that it's the exact sklearn output.
* **Biggest drivers:** asking to register or book (+), budget fit (+), interest in the 1% plan (+), urgency (+); unresolved objections (−) and negative signals (−).

## 4. Key design decisions (and why)
| Decision | Why |
|---|---|
| Logistic regression over gradient boosting | Same or better AUC here, calibrated, runs as plain arithmetic in JS, and every score decomposes exactly into factors a sales manager can trust. |
| Rule-based extractor + optional transformer | Instant, works offline, handles Hinglish, and is explainable. A neural model is an add-on, never a dependency. |
| Same 12 features in training and live | No training/serving skew: a replayed or spoken call is scored by the same model it was trained on. |
| Track objections as open → resolved | An *unresolved* objection is the strongest loss signal in the data, so the coaching should be "close it before asking for the ₹999". |
| Fully static deploy | Zero cost, zero secrets, nothing to break during a demo. |
| Synthetic data, clearly labelled | No real customer data. The pipeline is the point, and it's ready to plug into real CRM outcomes. |

## 5. How it maps to Xanadu
* **Xanadu Decision Engine** (conversation analytics, lead scoring, buying-intent tracking): DealSense is a miniature of that loop. Conversation → features → intent score → manager analytics (funnel, objection win rates, rep leaderboard). In production the features would live in a feature store on Databricks, the model would be retrained on real booking outcomes and served in batch for CRM prioritisation plus streaming for live calls.
* **Inspired by Xanadu's "Priya" AI sales agent** (45,000 buyer conversations for the fully digital Naigaon launch): DealSense is the **intelligence layer** such an agent or a human rep could use. It answers "how likely is this buyer to book, what do they need, and which objection should I handle next", with the playbook reply ready. In the dashboard, an AI agent ("Nova") sits on the leaderboard next to human reps, the way a manager would compare them.
* It speaks the launch's language: ₹999 refundable registration, 9.9% → 10% → 1%/month, buyback guarantee, no sample flat, Hinglish buyers.

## 6. Two-minute demo script
1. **(15s)** "In a digital launch every sale is a conversation. DealSense scores those conversations live." Open the **Live call** tab.
2. **(45s)** *Ananya Joshi* (English, Booked) is selected by default. Press play (2×, or 4× if short on time). For a Hinglish example use *Amit Patil* (Booked, ~92%). Point at the gauge moving, the fields filling in (2BHK, ₹60L budget → fits, pre-approved loan), and an objection card popping up with the suggested reply, then turning *Resolved*. Then "Why this score": "the model tells you *why*, not just a number."
3. **(20s)** Click **skip to end**: "Actual outcome Booked, and the model said ~80%." Then quickly play a **Lost** call (e.g. *Shreya Bhatt*) to show the gauge dropping, open loan/trust objections and red factors.
4. **(25s)** Switch to **Live mic**. Say or click: "Is the ₹999 refundable?" → objection card. Then "We need a 2BHK, budget 55 lakhs, lease ends in three months" → fields fill, score jumps. Then "Okay that makes sense, send me the registration link" → objection resolved, score up.
5. **(15s)** **Manager dashboard:** funnel, which objections kill deals (win rate per objection), the coaching takeaway, the rep leaderboard with the AI agent next to humans.
6. **(10s)** **Model** page: AUC 0.91, beats the gradient-boosting benchmark, calibrated, and the top 20% of leads capture 62% of bookings. "All synthetic, all in the browser, retrainable with one script."

*Backup if the mic misbehaves:* type the lines or use the example chips. They go through the same pipeline.

## 7. Likely CTO questions and good answers
1. **"Is this real data?"** No, and I say so in the app. It's synthetic, generated with a hidden process that includes an interaction term and unobserved buyer intent, so the model can't be perfect. The pipeline is real: swap in CRM outcomes and transcripts and retrain with one script.
2. **"Why logistic regression and not XGBoost or a deep model?"** I benchmarked gradient boosting and it didn't beat LR here (0.893 vs 0.911 AUC). LR is calibrated, explainable per factor, and runs in microseconds in the browser. With real data, which has more non-linearity, I'd re-run the comparison and could ship GBM with SHAP if it clearly wins.
3. **"How would this work on real calls?"** ASR (e.g. Whisper or a vendor with Indian-English/Hinglish support) → diarisation → an LLM or fine-tuned multilingual classifier replaces my regex extractor to produce the same features → the model scores in streaming. Outcomes come from the CRM (registration, booking) as labels.
4. **"How do you handle Hinglish?"** The extractor has Hinglish patterns ("loan milega ya nahi", "budget mein nahi"). The optional transformer is English-only, so I blend it with low weight. In production I'd use a multilingual model (e.g. IndicBERT/MuRIL fine-tuned on labelled call snippets).
5. **"Why does the score start near 23%?"** That's the base rate. Early in a call there isn't enough evidence, so I shrink toward the prior until the buyer has spoken about six times. Otherwise every call would start as a "bad lead".
6. **"How do you know the score is trustworthy?"** Held-out test plus 5-fold CV, a calibration curve (Brier 0.097), a threshold picked without touching the test set, and per-factor explanations so a manager can sanity-check every score.
7. **"What would you monitor in production?"** Feature drift (e.g. a new objection type after a price change), calibration by project and channel, rep-level fairness, latency, and outcome lag, since booking labels arrive days later.
8. **"How does this fit the Decision Engine?"** Features to a Databricks feature store, scheduled retraining with MLflow, batch scores pushed into the CRM for lead prioritisation, and streaming scores for live call assist. The dashboard is the manager view on top.
9. **"What if the model is wrong in front of a buyer?"** It's an assist for the rep or agent, not an automated decision. Suggested replies come from an approved playbook, never generated free-form, which keeps compliance claims (RERA, refunds, buyback) accurate.
10. **"What would you build next?"** Next-best-action recommendations (which offer or reply raises the probability most), A/B testing playbook replies, and per-launch recalibration so Alibaug, Goa and Naigaon each get their own baseline.

## 8. Honest limitations
* Synthetic data, so the metrics prove the pipeline, not real-world accuracy.
* The rule-based extractor only covers patterns I wrote. Unusual phrasings can be missed (the typed demo examples are known to work).
* Live mic needs Chrome or Edge, and the browser's speech service needs internet. Everything else works offline once the page has loaded.
