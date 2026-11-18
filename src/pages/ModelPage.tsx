import { Brain, Code2, Database, Gauge as GaugeIcon, LineChart as LineIcon, Target } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ComposedChart, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { Badge, Card, Stat, chartTooltip, pct } from '../components/ui'
import { MODEL } from '../lib/model'

const REPO = 'https://github.com/JiyaSingh18/dealsense'

export default function ModelPage() {
  const lr = MODEL.metrics.lr as Record<string, number>
  const gb = MODEL.metrics.gb as Record<string, number>
  const roc = MODEL.roc.map((p, i) => ({ fpr: p.fpr, lr: p.tpr, gb: MODEL.roc_gb[i]?.tpr }))
  const coefs = MODEL.features.map((f, i) => ({ label: MODEL.labels[f], coef: MODEL.coef[i], gb: MODEL.gb_importance[f] })).sort((a, b) => b.coef - a.coef)
  const [[tn, fp], [fn, tp]] = MODEL.confusion
  const top20 = MODEL.gains.find((g) => g.pct === 20)!.captured
  const rows: [string, string, (v: number) => string][] = [
    ['ROC-AUC (test)', 'auc', (v) => v.toFixed(3)], ['5-fold CV AUC', 'cv_auc_mean', (v) => v.toFixed(3)], ['PR-AUC', 'pr_auc', (v) => v.toFixed(3)],
    ['F1 @ threshold', 'f1', (v) => v.toFixed(3)], ['Precision', 'precision', (v) => v.toFixed(3)], ['Recall', 'recall', (v) => v.toFixed(3)],
    ['Brier score ↓', 'brier', (v) => v.toFixed(3)], ['Log loss ↓', 'log_loss', (v) => v.toFixed(3)],
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Lead-scoring model</h2>
          <p className="max-w-3xl text-sm text-slate-400">Trained offline in Python with scikit-learn on {MODEL.dataset.rows.toLocaleString()} synthetic call-feature rows, exported to JSON (scaler stats + coefficients) and executed in the browser with no server and no API keys. Metrics are on a held-out test set of {MODEL.dataset.test} rows.</p>
        </div>
        <a href={`${REPO}/blob/main/ml/train.py`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 ring-1 ring-white/10 hover:bg-white/10"><Code2 size={15} /> ml/train.py</a>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="ROC-AUC" value={lr.auc.toFixed(3)} sub={`CV ${lr.cv_auc_mean.toFixed(3)} ± ${lr.cv_auc_std.toFixed(3)}`} accent="text-cyan-300" />
        <Stat label="PR-AUC" value={lr.pr_auc.toFixed(3)} sub={`base rate ${pct(MODEL.dataset.positive_rate)}`} />
        <Stat label="F1" value={lr.f1.toFixed(3)} sub={`threshold ${MODEL.threshold}`} accent="text-violet-300" />
        <Stat label="Brier score" value={lr.brier.toFixed(3)} sub="well calibrated" accent="text-emerald-300" />
        <Stat label="Top-20% capture" value={pct(top20)} sub={`of bookings · ${pct(MODEL.dataset.top20_conversion)} conv.`} accent="text-amber-300" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="ROC curve" icon={<LineIcon size={14} />} right={<Badge tone="cyan">held-out test</Badge>}>
          <div className="h-64">
            <ResponsiveContainer>
              <LineChart data={roc} margin={{ left: -16, right: 8 }}>
                <CartesianGrid stroke="rgba(148,163,255,0.07)" />
                <XAxis dataKey="fpr" type="number" domain={[0, 1]} stroke="#64748b" fontSize={11} tickFormatter={(v) => v.toFixed(1)} />
                <YAxis domain={[0, 1]} stroke="#64748b" fontSize={11} />
                <Tooltip {...chartTooltip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#475569" strokeDasharray="4 4" />
                <Line isAnimationActive={false} dataKey="lr" name={`Logistic regression (AUC ${lr.auc.toFixed(3)})`} stroke="#22d3ee" strokeWidth={2.5} dot={false} />
                <Line isAnimationActive={false} dataKey="gb" name={`Gradient boosting (AUC ${gb.auc.toFixed(3)})`} stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Learned coefficients" icon={<Brain size={14} />} right={<span className="text-[11px] text-slate-500">log-odds per 1 std. dev.</span>}>
          <div className="space-y-1.5">
            {coefs.map((c) => (
              <div key={c.label} className="grid grid-cols-[180px_1fr_52px] items-center gap-2 text-xs">
                <span className="truncate text-slate-300">{c.label}</span>
                <div className="relative h-2.5 rounded-full bg-white/5">
                  <div className="absolute top-0 left-1/2 h-full w-px bg-white/20" />
                  <div className={`absolute top-0 h-full rounded-full ${c.coef >= 0 ? 'left-1/2 bg-emerald-400' : 'right-1/2 bg-rose-400'}`} style={{ width: `${Math.min(50, Math.abs(c.coef) * 55)}%` }} />
                </div>
                <span className={`text-right font-mono ${c.coef >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{c.coef >= 0 ? '+' : ''}{c.coef.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Cumulative gains" icon={<Target size={14} />} right={<span className="text-[11px] text-slate-500">call the highest-scored leads first</span>}>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={MODEL.gains} margin={{ left: -16, right: 8 }}>
                <defs><linearGradient id="gain" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.4} /><stop offset="100%" stopColor="#34d399" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="rgba(148,163,255,0.07)" />
                <XAxis dataKey="pct" stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}%`} />
                <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => pct(v)} domain={[0, 1]} />
                <Tooltip {...chartTooltip} formatter={(v) => pct(Number(v), 1)} labelFormatter={(v) => `Top ${v}% of leads`} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 1 }]} stroke="#475569" strokeDasharray="4 4" />
                <Area isAnimationActive={false} dataKey="captured" name="Bookings captured" stroke="#34d399" strokeWidth={2.5} fill="url(#gain)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Calibration" icon={<GaugeIcon size={14} />} right={<span className="text-[11px] text-slate-500">predicted vs observed booking rate</span>}>
          <div className="h-56">
            <ResponsiveContainer>
              <ComposedChart data={MODEL.calibration} margin={{ left: -16, right: 8 }}>
                <CartesianGrid stroke="rgba(148,163,255,0.07)" />
                <XAxis dataKey="predicted" type="number" domain={[0, 1]} stroke="#64748b" fontSize={11} tickFormatter={(v) => pct(v)} />
                <YAxis dataKey="observed" domain={[0, 1]} stroke="#64748b" fontSize={11} tickFormatter={(v) => pct(v)} />
                <Tooltip {...chartTooltip} formatter={(v) => pct(Number(v), 1)} />
                <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#475569" strokeDasharray="4 4" />
                <Line isAnimationActive={false} dataKey="observed" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Scatter isAnimationActive={false} dataKey="observed" fill="#f59e0b" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Shipped vs benchmark" icon={<Brain size={14} />} className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase tracking-wider text-slate-500"><th className="py-2">Metric</th><th className="text-right">Logistic regression <Badge tone="cyan">shipped</Badge></th><th className="text-right">Gradient boosting</th></tr></thead>
            <tbody>
              {rows.map(([label, k, f]) => (
                <tr key={k} className="border-t border-white/5"><td className="py-2 text-slate-300">{label}</td><td className="text-right font-mono text-white">{f(lr[k])}</td><td className="text-right font-mono text-slate-400">{f(gb[k])}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">Logistic regression is shipped because it matches the benchmark here, is calibrated, runs in microseconds as plain arithmetic in JavaScript, and every score decomposes exactly into per-factor contributions, which is what a sales manager needs to trust it. Gradient boosting would need a tree runtime or ONNX in the browser for no accuracy gain on this data.</p>
        </Card>
        <Card title="Confusion matrix" icon={<Target size={14} />} right={<span className="text-[11px] text-slate-500">threshold {MODEL.threshold}</span>}>
          <div className="grid grid-cols-[auto_1fr_1fr] gap-1.5 text-center text-sm">
            <div />
            <div className="text-[11px] text-slate-500">Pred: not booked</div><div className="text-[11px] text-slate-500">Pred: booked</div>
            <div className="self-center text-left text-[11px] text-slate-500">Actual: not</div>
            <div className="rounded-xl bg-emerald-400/10 py-5 font-mono text-lg text-emerald-200">{tn}</div>
            <div className="rounded-xl bg-rose-400/10 py-5 font-mono text-lg text-rose-200">{fp}</div>
            <div className="self-center text-left text-[11px] text-slate-500">Actual: booked</div>
            <div className="rounded-xl bg-rose-400/10 py-5 font-mono text-lg text-rose-200">{fn}</div>
            <div className="rounded-xl bg-emerald-400/10 py-5 font-mono text-lg text-emerald-200">{tp}</div>
          </div>
          <p className="mt-3 text-xs text-slate-400">Threshold picked by maximising F1 on out-of-fold training predictions, never on the test set.</p>
        </Card>
      </div>
      <Card title="Data & honesty note" icon={<Database size={14} />}>
        <div className="grid gap-4 text-sm text-slate-300 md:grid-cols-3">
          <p><b className="text-white">All data is synthetic.</b> Calls, names, leads and outcomes are generated by <code className="text-cyan-300">ml/generate_data.py</code> (seed 18). Outcomes come from a hidden logistic process with an interaction term and unobserved buyer intent, so the model can't score perfectly.</p>
          <p><b className="text-white">Same features in training and live.</b> The 12 features are exactly what the in-browser extractor computes from a transcript (budget fit, urgency, financing, payment-plan interest, objections, sentiment…), so a replayed or spoken call is scored by the same model.</p>
          <p><b className="text-white">In production</b> this would be trained on real CRM outcomes and ASR transcripts, with drift monitoring, per-project recalibration and an LLM or fine-tuned classifier replacing the rule-based extractor.</p>
        </div>
      </Card>
    </div>
  )
}
