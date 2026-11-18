import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle, Bot, CheckCircle2, ChevronsRight, CircleDot, Cpu, Mic, MicOff, Pause, Phone, Play, RotateCcw,
  Search, Send, Sparkles, TrendingDown, TrendingUp, User, Volume2, VolumeX, Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Line as RLine, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import callsJson from '../data/calls.json'
import Gauge from '../components/Gauge'
import Waveform from '../components/Waveform'
import { Badge, Card, OUTCOME, chartTooltip, pct } from '../components/ui'
import { BASE_RATE, MODEL, evidenceFor, score } from '../lib/model'
import { initialState, lexiconSentiment, step } from '../lib/nlp'
import { loadNeural, neuralSentiment, type NeuralStatus } from '../lib/neural'
import { PLAYBOOK_BY_ID } from '../lib/playbook'
import { getRecognition, speak, stopSpeaking } from '../lib/speech'
import type { Call, Line } from '../lib/types'

const CALLS = callsJson as Call[]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const EXAMPLES = [
  'Is the ₹999 refundable if I change my mind?',
  'Loan milega ya nahi, mera CIBIL thoda kam hai.',
  'Naigaon feels too far, my office is in Andheri.',
  'We need a 2BHK, budget is around 55 lakhs, lease ends in three months.',
  '1% a month is very manageable. Send me the registration link.',
]

function useAnalysis(lines: Line[], isReferral: boolean, overrides: Record<number, number>) {
  return useMemo(() => {
    let st = initialState(isReferral)
    let buyerTurns = 0
    const s0 = score(st.features, 0)
    const points: { t: number; probability: number; sentiment?: number; idx: number; objection?: string }[] = [{ t: 0, probability: s0.probability * 100, idx: -1 }]
    const scores = [s0]
    lines.forEach((ln, i) => {
      const before = st.objections.length
      st = step(st, ln, i, overrides[i])
      if (ln.speaker === 'buyer') buyerTurns++
      const sc = score(st.features, evidenceFor(buyerTurns))
      scores.push(sc)
      points.push({
        t: ln.t, idx: i, probability: +(sc.probability * 100).toFixed(1),
        sentiment: ln.speaker === 'buyer' ? +(st.lineSentiment[i] ?? 0).toFixed(2) : undefined,
        objection: st.objections.length > before ? PLAYBOOK_BY_ID[st.objections[st.objections.length - 1].id].title : undefined,
      })
    })
    return { state: st, points, scores }
  }, [lines, isReferral, overrides])
}

function Typewriter({ text, speed, onDone }: { text: string; speed: number; onDone?: () => void }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    setN(0)
    const per = Math.max(6, 28 / speed)
    const id = setInterval(() => setN((v) => { if (v >= text.length) { clearInterval(id); onDone?.(); return v } return v + 1 }), per)
    return () => clearInterval(id)
  }, [text, speed, onDone])
  return <span className={n < text.length ? 'caret' : ''}>{text.slice(0, n)}</span>
}

export default function LiveCall() {
  const [mode, setMode] = useState<'replay' | 'live'>('replay')
  const [callId, setCallId] = useState('C08')
  const [query, setQuery] = useState('')
  const [lang, setLang] = useState<'All' | 'English' | 'Hinglish'>('All')
  const [shown, setShown] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [voice, setVoice] = useState(false)
  const [liveLines, setLiveLines] = useState<Line[]>([])
  const [overrides, setOverrides] = useState<Record<number, number>>({})
  const [neural, setNeural] = useState<NeuralStatus>('off')
  const call = CALLS.find((c) => c.id === callId)!
  const lines = useMemo(() => (mode === 'replay' ? call.lines.slice(0, shown) : liveLines), [mode, call, shown, liveLines])
  const isReferral = mode === 'replay' && call.source === 'Referral'
  const { state, points, scores } = useAnalysis(lines, isReferral, overrides)
  const current = scores[scores.length - 1]
  const prev = scores.length > 1 ? scores[scores.length - 2] : current
  const delta = current.probability - prev.probability
  const done = mode === 'replay' && shown >= call.lines.length

  // ---- playback loop ----
  useEffect(() => {
    if (!playing || mode !== 'replay') return
    if (shown >= call.lines.length) { setPlaying(false); return }
    let cancelled = false
    ;(async () => {
      if (shown === 0) await sleep(350)
      else if (voice) await speak(call.lines[shown - 1].text, call.lines[shown - 1].speaker, speed)
      else await sleep(Math.min(4500, Math.max(500, ((call.lines[shown].t - call.lines[shown - 1].t) * 1000) / speed)))
      if (!cancelled) setShown((s) => s + 1)
    })()
    return () => { cancelled = true }
  }, [playing, shown, voice, speed, call, mode])

  // ---- optional neural sentiment refinement ----
  useEffect(() => {
    if (neural !== 'ready') return
    lines.forEach((ln, i) => {
      if (ln.speaker !== 'buyer' || overrides[i] !== undefined) return
      neuralSentiment(ln.text).then((v) => {
        if (v === null) return
        const lex = lexiconSentiment(ln.text)
        const blended = +(lex !== 0 ? 0.7 * lex + 0.3 * v : 0.3 * v).toFixed(3)
        setOverrides((o) => (o[i] !== undefined ? o : { ...o, [i]: blended }))
      })
    })
  }, [lines, neural, overrides])

  const reset = (keepMode = true) => {
    setPlaying(false); setShown(0); setOverrides({}); stopSpeaking()
    if (!keepMode) setLiveLines([])
  }
  const selectCall = (id: string) => { stopSpeaking(); setCallId(id); setShown(0); setOverrides({}); setPlaying(true); setMode('replay') }
  const toggleNeural = async () => {
    if (neural === 'ready' || neural === 'loading') { setNeural('off'); setOverrides({}); return }
    setNeural('loading')
    const ok = await loadNeural()
    setNeural(ok ? 'ready' : 'failed')
  }

  const filtered = CALLS.filter((c) => (lang === 'All' || c.language === lang) && `${c.buyer} ${c.agent} ${c.persona}`.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      {/* ---------------- Library ---------------- */}
      <aside className="order-3 xl:order-none xl:col-span-3">
        <Card title="Call library" icon={<Phone size={14} />} right={<Badge tone="amber">Synthetic</Badge>}>
          <div className="mb-3 flex items-center gap-2 rounded-xl bg-ink-900/80 px-3 py-2 ring-1 ring-white/5 transition focus-within:ring-cyan-400/40">
            <Search size={14} className="text-slate-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buyer, agent, persona" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500" />
          </div>
          <div className="mb-3 flex gap-1.5">
            {(['All', 'English', 'Hinglish'] as const).map((l) => (
              <button key={l} onClick={() => setLang(l)} className={`rounded-full px-3 py-1 text-xs font-medium transition ${lang === l ? 'bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/40' : 'text-slate-400 hover:text-slate-200'}`}>{l}</button>
            ))}
          </div>
          <ul className="scroll-thin -mr-2 max-h-[300px] space-y-1.5 overflow-y-auto pr-2 xl:max-h-[calc(100vh-290px)]" data-testid="call-list">
            {filtered.map((c) => (
              <li key={c.id}>
                <button onClick={() => selectCall(c.id)} className={`group w-full rounded-xl px-3 py-2.5 text-left transition ${c.id === callId && mode === 'replay' ? 'bg-gradient-to-r from-cyan-400/15 to-violet-400/10 ring-1 ring-cyan-400/30' : 'hover:bg-white/[0.04]'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-slate-100">{c.buyer}</span>
                    <Badge tone={OUTCOME[c.outcome].tone}>{OUTCOME[c.outcome].label}</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{c.bhk}BHK</span><span>·</span><span>{c.language}</span><span>·</span><span className="truncate">{c.agent}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </aside>

      {/* ---------------- Player + transcript ---------------- */}
      <div className="order-1 min-w-0 space-y-4 xl:order-none xl:col-span-5">
        <Card>
          <div className="mb-4 flex items-center gap-1 rounded-xl bg-ink-900/80 p-1 ring-1 ring-white/5">
            {(['replay', 'live'] as const).map((m) => (
              <button key={m} data-testid={`mode-${m}`} onClick={() => { reset(); setMode(m) }} className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${mode === m ? 'bg-white/10 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
                {m === 'replay' ? <><Play size={14} /> Replay a call</> : <><Mic size={14} /> Live mic</>}
              </button>
            ))}
          </div>
          {mode === 'replay' ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-white">{call.buyer} <span className="font-normal text-slate-400">× {call.agent}</span></div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone="violet">{call.persona}</Badge>
                    <Badge tone="cyan">{call.language}</Badge>
                    <Badge>{call.source}</Badge>
                    <Badge>{Math.floor(call.duration / 60)}:{String(Math.round(call.duration % 60)).padStart(2, '0')} min</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button data-testid="play" onClick={() => { if (done) { reset(); setPlaying(true) } else setPlaying((p) => !p); stopSpeaking() }} className={`relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 text-ink-950 shadow-lg shadow-cyan-500/20 transition hover:scale-105 active:scale-95 ${!playing && shown === 0 ? 'ring-4 ring-cyan-400/25 animate-pulse' : ''}`}>
                    {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                  </button>
                  <button title="Restart" onClick={() => reset()} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 ring-1 ring-white/10 hover:bg-white/5"><RotateCcw size={15} /></button>
                  <button title="Skip to end" onClick={() => { setPlaying(false); stopSpeaking(); setShown(call.lines.length) }} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 ring-1 ring-white/10 hover:bg-white/5"><ChevronsRight size={15} /></button>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Waveform active={playing} speaker={lines.length ? lines[lines.length - 1].speaker : null} />
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  {[1, 2, 4].map((s) => (
                    <button key={s} onClick={() => setSpeed(s)} className={`rounded-md px-2 py-1 font-mono text-xs ${speed === s ? 'bg-cyan-400/15 text-cyan-200' : 'text-slate-400 hover:text-slate-200'}`}>{s}×</button>
                  ))}
                  <button title="Read lines aloud (browser TTS)" onClick={() => { setVoice((v) => !v); stopSpeaking() }} className={`ml-1 rounded-md p-1.5 ${voice ? 'bg-violet-400/15 text-violet-200' : 'text-slate-400 hover:text-slate-200'}`}>{voice ? <Volume2 size={15} /> : <VolumeX size={15} />}</button>
                </div>
              </div>
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-white/5">
                <motion.div className="h-full bg-gradient-to-r from-cyan-400 to-violet-400" animate={{ width: `${(shown / call.lines.length) * 100}%` }} transition={{ duration: 0.4 }} />
              </div>
            </>
          ) : (
            <LiveMic onLine={(ln) => setLiveLines((ls) => [...ls, { ...ln, t: ls.length ? ls[ls.length - 1].t + 4 : 0 }])} onReset={() => { setLiveLines([]); setOverrides({}) }} />
          )}
        </Card>

        <Card title="Transcript" icon={<CircleDot size={14} />} right={<NeuralToggle status={neural} onClick={toggleNeural} />}>
          <Transcript lines={lines} state={state} animateLast={playing && mode === 'replay'} speed={speed} empty={mode === 'replay' ? 'Press play to stream the call. Scores update line by line.' : 'Speak or type a buyer line to score it live.'} />
          <AnimatePresence>
            {done && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-3 text-sm ring-1 ring-white/10" data-testid="outcome">
                <span className="text-slate-300">Actual outcome <Badge tone={OUTCOME[call.outcome].tone} className="ml-1">{OUTCOME[call.outcome].label}</Badge></span>
                <span className="text-slate-300">Model said <b className="text-white">{current.probability < 0.01 ? "<1%" : pct(current.probability)}</b> {(current.probability >= MODEL.threshold) === (call.outcome === 'booked') ? <CheckCircle2 size={14} className="inline text-emerald-400" /> : <AlertTriangle size={14} className="inline text-amber-400" />}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <Card title="Intent & sentiment timeline" icon={<TrendingUp size={14} />} right={<div className="flex gap-3 text-[11px] text-slate-400"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-cyan-400" />Purchase likelihood</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-violet-400" />Buyer sentiment</span></div>}>
          <div className="h-52">
            <ResponsiveContainer>
              <ComposedChart data={points} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="prob" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#22d3ee" stopOpacity={0.45} /><stop offset="100%" stopColor="#22d3ee" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(148,163,255,0.07)" vertical={false} />
                <XAxis dataKey="t" type="number" domain={[0, mode === 'replay' ? Math.ceil(call.duration) : 'dataMax']} tickFormatter={(v) => `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`} stroke="#64748b" fontSize={11} />
                <YAxis yAxisId="p" domain={[0, 100]} stroke="#64748b" fontSize={11} tickFormatter={(v) => `${v}%`} />
                <YAxis yAxisId="s" orientation="right" domain={[-1, 1]} hide />
                <Tooltip {...chartTooltip} labelFormatter={(v) => `t = ${Math.round(Number(v))}s`} />
                <Area yAxisId="p" type="monotone" dataKey="probability" name="Purchase likelihood %" stroke="#22d3ee" strokeWidth={2.5} fill="url(#prob)" isAnimationActive={false} />
                <RLine yAxisId="s" type="monotone" dataKey="sentiment" name="Buyer sentiment" stroke="#a78bfa" strokeWidth={2} dot={{ r: 2.5, fill: '#a78bfa' }} connectNulls isAnimationActive={false} />
                {points.filter((p) => p.objection).map((p) => (
                  <ReferenceDot key={p.idx} yAxisId="p" x={p.t} y={p.probability} r={5} fill="#f59e0b" stroke="#0e1322" />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 text-[11px] text-slate-500"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />Objection raised</div>
        </Card>
      </div>

      {/* ---------------- Intelligence panel ---------------- */}
      <div className="order-2 min-w-0 space-y-4 xl:order-none xl:col-span-4">
        <Card title="Purchase likelihood" icon={<Zap size={14} />} right={<Badge tone="cyan">In-browser model</Badge>}>
          <Gauge value={current.probability} threshold={MODEL.threshold} />
          <div className="mt-2 flex items-center justify-center gap-3 text-xs text-slate-400">
            <AnimatePresence mode="popLayout">
              {Math.abs(delta) > 0.005 && (
                <motion.span key={lines.length} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`flex items-center gap-1 font-semibold ${delta > 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{delta > 0 ? '+' : ''}{(delta * 100).toFixed(0)} pts on last line
                </motion.span>
              )}
            </AnimatePresence>
            <span>Base rate {pct(BASE_RATE)} · threshold {pct(MODEL.threshold)}</span>
          </div>
          <div className="mt-4 border-t border-white/5 pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Why this score</div>
            {current.evidence === 0 && <div className="rounded-xl border border-dashed border-white/10 py-5 text-center text-xs text-slate-500">Score starts at the base rate. Factors appear as soon as the buyer speaks.</div>}
            <div className={`space-y-1.5 ${current.evidence === 0 ? 'hidden' : ''}`} data-testid="factors">
              {current.contributions.slice(0, 6).map((c) => {
                const w = Math.min(100, Math.abs(c.contribution) * 55)
                return (
                  <div key={c.feature} className="grid grid-cols-[1fr_120px_44px] items-center gap-2 text-xs">
                    <span className="truncate text-slate-300">{c.label}</span>
                    <div className="relative h-2 rounded-full bg-white/5">
                      <div className="absolute top-0 left-1/2 h-full w-px bg-white/20" />
                      <motion.div className={`absolute top-0 h-full rounded-full ${c.contribution >= 0 ? 'left-1/2 bg-emerald-400' : 'right-1/2 bg-rose-400'}`} animate={{ width: `${w / 2}%` }} transition={{ type: 'spring', stiffness: 120, damping: 18 }} />
                    </div>
                    <span className={`text-right font-mono ${c.contribution >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{c.contribution >= 0 ? '+' : ''}{c.contribution.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
            <div className="mt-2 text-[10px] text-slate-500">Contribution to the log-odds vs. an average lead (coefficient × standardised feature){current.evidence < 1 ? ` · early-call evidence weight ${Math.round(current.evidence * 100)}%` : ''}.</div>
          </div>
        </Card>

        <Card title="Extracted fields" icon={<Sparkles size={14} />}>
          <dl className="grid grid-cols-2 gap-2 text-sm" data-testid="fields">
            <Field k="BHK" v={state.fields.bhk} />
            <Field k="Budget" v={state.fields.budget} tone={state.features.budget_fit === 1 ? 'good' : state.features.budget_fit === -1 ? 'bad' : undefined} />
            <Field k="Timeline" v={state.fields.timeline} />
            <Field k="Financing" v={state.fields.financing} tone={state.features.financing_ready === 1 ? 'good' : state.features.financing_ready === -1 ? 'bad' : undefined} />
            <Field k="Location concerns" v={state.fields.location.length ? state.fields.location.join(', ') : undefined} tone={state.fields.location.length ? 'bad' : undefined} />
            <Field k="Payment-plan mentions" v={state.fields.planMentions.length ? `${state.fields.planMentions.length}× · interest ${state.features.plan_interest}/3` : undefined} tone={state.features.plan_interest > 0 ? 'good' : undefined} />
            <div className="col-span-2"><Field k="Next step / buying signal" v={state.fields.nextStep ? `“${state.fields.nextStep}”` : undefined} tone={state.fields.nextStep ? 'good' : undefined} /></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
            {([['pitchedPlan', '1%/month plan pitched'], ['buyback', 'Buyback guarantee'], ['warranty', '10-yr warranty'], ['askedNeeds', 'Needs discovery'], ['nextStep', 'Next step set']] as const).map(([k, l]) => (
              <span key={k} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ring-1 ${state.checklist[k] ? 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25' : 'text-slate-500 ring-white/10'}`}>
                <CheckCircle2 size={11} />{l}
              </span>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-slate-500">Agent coaching checklist</div>
        </Card>

        <Card title="Objections & playbook" icon={<AlertTriangle size={14} />} right={<Badge tone={state.objections.some((o) => o.status === 'open') ? 'amber' : 'slate'}>{state.objections.filter((o) => o.status === 'open').length} open / {state.objections.length}</Badge>}>
          {state.objections.length === 0 && <div className="py-4 text-center text-sm text-slate-500">No objections detected yet.</div>}
          <div className="space-y-2.5" data-testid="objections">
            <AnimatePresence initial={false}>
              {[...state.objections].reverse().map((o) => {
                const p = PLAYBOOK_BY_ID[o.id]
                return (
                  <motion.div key={o.id} layout initial={{ opacity: 0, scale: 0.94, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className={`rounded-xl p-3 ring-1 ${o.status === 'open' ? 'bg-amber-400/[0.06] ring-amber-400/30' : 'bg-emerald-400/[0.04] ring-emerald-400/20'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-semibold text-white">{p.title}</div>
                      <Badge tone={o.status === 'open' ? 'amber' : 'green'}>{o.status === 'open' ? 'Open' : 'Resolved'}</Badge>
                    </div>
                    <div className="mt-1 text-xs italic text-slate-400">“{o.quote}”</div>
                    <div className="mt-2 rounded-lg bg-ink-900/70 p-2.5 text-xs leading-relaxed text-slate-200 ring-1 ring-white/5">
                      <span className="mr-1 font-semibold text-cyan-300">Suggested reply:</span>{p.response}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">{p.proof.map((x) => <Badge key={x}>{x}</Badge>)}</div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </Card>
      </div>
    </div>
  )
}

function Field({ k, v, tone }: { k: string; v?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-xl bg-ink-900/60 px-3 py-2 ring-1 ring-white/5">
      <dt className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{k}</dt>
      <AnimatePresence mode="wait">
        <motion.dd key={v ?? 'none'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={`mt-0.5 truncate text-[13px] font-medium ${!v ? 'text-slate-600' : tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-amber-300' : 'text-slate-100'}`} title={v}>
          {v ?? '—'}
        </motion.dd>
      </AnimatePresence>
    </div>
  )
}

function NeuralToggle({ status, onClick }: { status: NeuralStatus; onClick: () => void }) {
  const label = { off: 'Neural sentiment: off', loading: 'Loading model…', ready: 'Neural sentiment: on', failed: 'Model unavailable · lexicon' }[status]
  return (
    <button onClick={onClick} title="Optionally refine sentiment with DistilBERT (SST-2) via transformers.js, running in your browser. Falls back to the fast lexicon scorer." className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 transition ${status === 'ready' ? 'bg-violet-400/15 text-violet-200 ring-violet-400/40' : status === 'failed' ? 'text-amber-300 ring-amber-400/30' : 'text-slate-400 ring-white/10 hover:text-slate-200'}`}>
      <Cpu size={12} className={status === 'loading' ? 'animate-spin' : ''} />{label}
    </button>
  )
}

function Transcript({ lines, state, animateLast, speed, empty }: { lines: Line[]; state: ReturnType<typeof initialState>; animateLast: boolean; speed: number; empty: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = ref.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }) }, [lines.length])
  const objLines = new Set(state.objections.map((o) => o.line))
  return (
    <div ref={ref} className="scroll-thin h-[340px] space-y-2.5 overflow-y-auto pr-1" data-testid="transcript">
      {lines.length === 0 && <div className="flex h-full items-center justify-center text-sm text-slate-500">{empty}</div>}
      {lines.map((ln, i) => {
        const s = state.lineSentiment[i]
        const isLast = i === lines.length - 1
        return (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2.5 ${ln.speaker === 'buyer' ? 'flex-row-reverse text-right' : ''}`}>
            <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ln.speaker === 'agent' ? 'bg-cyan-400/15 text-cyan-300' : 'bg-violet-400/15 text-violet-300'}`}>
              {ln.speaker === 'agent' ? <Bot size={14} /> : <User size={14} />}
            </div>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${ln.speaker === 'agent' ? 'rounded-tl-sm bg-white/[0.04] text-slate-200' : 'rounded-tr-sm bg-violet-500/10 text-slate-100'} ${objLines.has(i) ? 'ring-1 ring-amber-400/50' : ''}`}>
              <div className={`mb-0.5 flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500 ${ln.speaker === 'buyer' ? 'justify-end' : ''}`}>
                <span className="font-mono">{Math.floor(ln.t / 60)}:{String(Math.round(ln.t % 60)).padStart(2, '0')}</span>
                <span>{ln.speaker}</span>
                {s != null && s !== 0 && <span className={s > 0 ? 'text-emerald-400' : 'text-rose-400'}>{s > 0 ? '▲' : '▼'} {s.toFixed(2)}</span>}
                {objLines.has(i) && <span className="text-amber-400">objection</span>}
              </div>
              {isLast && animateLast ? <Typewriter text={ln.text} speed={speed} /> : ln.text}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function LiveMic({ onLine, onReset }: { onLine: (l: Omit<Line, 't'>) => void; onReset: () => void }) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [text, setText] = useState('')
  const [speaker, setSpeaker] = useState<'buyer' | 'agent'>('buyer')
  const [err, setErr] = useState<string | null>(null)
  const recRef = useRef<any>(null)
  const supported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  const speakerRef = useRef(speaker)
  speakerRef.current = speaker

  const start = () => {
    const r = getRecognition()
    if (!r) return
    r.onresult = (e: any) => {
      let inter = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) { const t = res[0].transcript.trim(); if (t) onLine({ speaker: speakerRef.current, text: t.charAt(0).toUpperCase() + t.slice(1) }) } else inter += res[0].transcript
      }
      setInterim(inter)
    }
    r.onerror = (e: any) => { setErr(e.error === 'not-allowed' ? 'Microphone permission was blocked.' : `Speech error: ${e.error}`); setListening(false) }
    r.onend = () => { setListening(false); setInterim('') }
    r.start(); recRef.current = r; setListening(true); setErr(null)
  }
  const stop = () => { recRef.current?.stop(); setListening(false) }
  useEffect(() => () => recRef.current?.stop(), [])
  const submit = (t: string) => { if (t.trim()) { onLine({ speaker, text: t.trim() }); setText('') } }

  return (
    <div data-testid="live-mic">
      <div className="flex items-center gap-4">
        <button disabled={!supported} onClick={listening ? stop : start} className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition ${listening ? 'rec-pulse bg-rose-500 text-white' : 'bg-gradient-to-br from-cyan-400 to-violet-500 text-ink-950 hover:scale-105'} disabled:opacity-40`}>
          {listening ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">{listening ? 'Listening… speak a line' : supported ? 'Tap the mic and speak (en-IN)' : 'Speech recognition needs Chrome or Edge'}</div>
          <div className="truncate text-xs text-slate-400">{interim || err || 'Each finished sentence is scored instantly. Typing works everywhere.'}</div>
          <Waveform active={listening} speaker={speaker} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex rounded-lg bg-ink-900/80 p-0.5 ring-1 ring-white/5">
          {(['buyer', 'agent'] as const).map((s) => (
            <button key={s} onClick={() => setSpeaker(s)} className={`rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize ${speaker === s ? (s === 'buyer' ? 'bg-violet-400/20 text-violet-200' : 'bg-cyan-400/20 text-cyan-200') : 'text-slate-400'}`}>{s}</button>
          ))}
        </div>
        <form className="flex flex-1 items-center gap-2 rounded-xl bg-ink-900/80 px-3 py-1.5 ring-1 ring-white/5 transition focus-within:ring-cyan-400/40" onSubmit={(e) => { e.preventDefault(); submit(text) }}>
          <input data-testid="live-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Type a ${speaker} line…`} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-500" />
          <button type="submit" className="text-cyan-300 hover:text-cyan-200"><Send size={15} /></button>
        </form>
        <button title="Clear" onClick={onReset} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 ring-1 ring-white/10 hover:bg-white/5"><RotateCcw size={14} /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLES.map((x) => (
          <button key={x} onClick={() => onLine({ speaker: 'buyer', text: x })} className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-300 ring-1 ring-white/10 transition hover:bg-white/[0.08]">{x}</button>
        ))}
      </div>
    </div>
  )
}
