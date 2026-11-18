import { Crown, Filter, ListChecks, Scale, Trophy, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import leadsJson from '../data/leads.json'
import { Badge, Card, Stat, chartTooltip, pct } from '../components/ui'
import { MODEL, score } from '../lib/model'
import { PLAYBOOK_BY_ID } from '../lib/playbook'
import type { FeatureName, ObjectionId } from '../lib/types'

type Cols = Record<string, (string | number)[]>
const L = leadsJson as unknown as Cols
const N = (L.lead_id as string[]).length
type Lead = Record<string, number | string> & { booked: number; registered: number; qualified: number; rep: string; source: string; primary_objection: string; week: number }
const LEADS: Lead[] = Array.from({ length: N }, (_, i) => Object.fromEntries(Object.keys(L).map((k) => [k, L[k][i]])) as Lead)

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export default function Dashboard() {
  const [rep, setRep] = useState('All reps')
  const reps = useMemo(() => ['All reps', ...Array.from(new Set(LEADS.map((l) => l.rep)))], [])
  const leads = useMemo(() => (rep === 'All reps' ? LEADS : LEADS.filter((l) => l.rep === rep)), [rep])

  const d = useMemo(() => {
    const n = leads.length
    const q = leads.filter((l) => l.qualified).length
    const r = leads.filter((l) => l.registered).length
    const b = leads.filter((l) => l.booked).length
    const funnel = [
      { stage: 'Calls analysed', n, sub: 'AI + human sales calls' },
      { stage: 'Qualified', n: q, sub: 'Budget & need confirmed' },
      { stage: '₹999 registered', n: r, sub: 'Refundable registration' },
      { stage: 'Booked (9.9%)', n: b, sub: 'Booking amount paid' },
    ]
    const objMap = new Map<string, { n: number; booked: number }>()
    for (const l of leads) {
      if (l.primary_objection === 'none') continue
      const o = objMap.get(l.primary_objection) ?? { n: 0, booked: 0 }
      o.n++; o.booked += l.booked; objMap.set(l.primary_objection, o)
    }
    const objections = [...objMap.entries()].map(([id, o]) => ({ id, name: PLAYBOOK_BY_ID[id as ObjectionId]?.title ?? id, n: o.n, winRate: o.booked / o.n })).sort((a, b) => b.n - a.n)
    // win/loss drivers: standardised mean difference booked vs not booked
    const won = leads.filter((l) => l.booked), lost = leads.filter((l) => !l.booked)
    const drivers = MODEL.features.map((f: FeatureName, i: number) => ({
      feature: MODEL.labels[f], d: (mean(won.map((l) => +l[f])) - mean(lost.map((l) => +l[f]))) / MODEL.scale[i],
    })).sort((a, b) => b.d - a.d)
    const avgScore = mean(leads.map((l) => score(Object.fromEntries(MODEL.features.map((f) => [f, +l[f]])) as never).probability))
    const weeks = Array.from({ length: 12 }, (_, i) => {
      const w = leads.filter((l) => l.week === i + 1)
      return { week: `W${i + 1}`, bookings: w.filter((l) => l.booked).length, registrations: w.filter((l) => l.registered).length }
    })
    const sources = [...new Set(leads.map((l) => l.source))].map((s) => {
      const g = leads.filter((l) => l.source === s)
      return { source: s, n: g.length, conv: g.filter((l) => l.booked).length / g.length }
    }).sort((a, b) => b.conv - a.conv)
    const drops = funnel.slice(1).map((s, i) => ({ from: funnel[i].stage, to: s.stage, rate: s.n / funnel[i].n })).sort((a, b) => a.rate - b.rate)
    const worstObj = [...objections].sort((a, b) => a.winRate - b.winRate)[0]
    return { n, q, r, b, funnel, objections, drivers, avgScore, weeks, sources, drops, worstObj }
  }, [leads])

  const board = useMemo(() => reps.slice(1).map((r) => {
    const g = LEADS.filter((l) => l.rep === r)
    const raised = g.reduce((a, l) => a + +l.objections_raised, 0)
    const open = g.reduce((a, l) => a + +l.open_objections, 0)
    return {
      rep: r, calls: g.length, reg: g.filter((l) => l.registered).length, booked: g.filter((l) => l.booked).length,
      conv: g.filter((l) => l.booked).length / g.length, sentiment: mean(g.map((l) => +l.buyer_sentiment)),
      resolution: raised ? 1 - open / raised : 0, plan: mean(g.map((l) => +l.plan_interest)),
    }
  }).sort((a, b) => b.conv - a.conv), [reps])

  const maxN = d.funnel[0].n
  const maxConv = Math.max(...board.map((b) => b.conv))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Sales manager dashboard</h2>
          <p className="text-sm text-slate-400">Computed live in your browser from {N.toLocaleString()} synthetic call records (Naigaon-style digital launch, 12 weeks).</p>
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-ink-900/80 px-3 py-2 text-sm ring-1 ring-white/10">
          <Filter size={14} className="text-cyan-300" />
          <select value={rep} onChange={(e) => setRep(e.target.value)} className="bg-transparent outline-none">
            {reps.map((r) => <option key={r} className="bg-ink-900">{r}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Calls analysed" value={d.n.toLocaleString()} sub="voice + AI agent" />
        <Stat label="₹999 registrations" value={d.r.toLocaleString()} sub={`${pct(d.r / d.n, 1)} of calls`} accent="text-cyan-300" />
        <Stat label="Bookings" value={d.b.toLocaleString()} sub={`${pct(d.b / d.n, 1)} conversion`} accent="text-emerald-300" />
        <Stat label="Reg → booking" value={pct(d.b / Math.max(1, d.r), 0)} sub="registration conversion" accent="text-violet-300" />
        <Stat label="Avg. model score" value={pct(d.avgScore, 0)} sub="mean purchase likelihood" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card title="Conversion funnel" icon={<ListChecks size={14} />} className="lg:col-span-5">
          <div className="space-y-3" data-testid="funnel">
            {d.funnel.map((s, i) => (
              <div key={s.stage}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-slate-100">{s.stage} <span className="text-xs font-normal text-slate-500">· {s.sub}</span></span>
                  <span className="font-mono text-slate-300">{s.n.toLocaleString()} {i > 0 && <span className="text-xs text-slate-500">({pct(s.n / d.funnel[i - 1].n)})</span>}</span>
                </div>
                <div className="h-7 overflow-hidden rounded-lg bg-white/[0.04]">
                  <div className="h-full rounded-lg bg-gradient-to-r from-cyan-400/80 to-violet-500/80 transition-all duration-700" style={{ width: `${(s.n / maxN) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs text-slate-300 ring-1 ring-white/5">
            <span className="font-semibold text-amber-300">Biggest drop-off:</span> {d.drops[0].from} → {d.drops[0].to} ({pct(d.drops[0].rate)} pass through).
            {d.worstObj && <> Calls where <span className="text-white">“{d.worstObj.name}”</span> came up convert at only {pct(d.worstObj.winRate)}.</>}
          </div>
        </Card>
        <Card title="Top objections" icon={<Scale size={14} />} right={<span className="text-[11px] text-slate-500">bar length = how often · colour = win rate</span>} className="lg:col-span-7">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={d.objections} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid stroke="rgba(148,163,255,0.07)" horizontal={false} />
                <XAxis type="number" stroke="#64748b" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={11} width={175} tickLine={false} />
                <Tooltip {...chartTooltip} formatter={(v, n, p) => (n === 'n' ? [`${v} calls · win rate ${pct((p.payload as { winRate: number }).winRate)}`, 'Raised'] : [v, n])} />
                <Bar isAnimationActive={false} dataKey="n" radius={[0, 6, 6, 0]}>
                  {d.objections.map((o) => <Cell key={o.id} fill={o.winRate < 0.2 ? '#f43f5e' : o.winRate < 0.26 ? '#f59e0b' : '#22d3ee'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-1 flex gap-3 text-[11px] text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-rose-500" />win rate &lt; 20%</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />20–26%</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-cyan-400" />&gt; 26%</span></div>
        </Card>
        <Card title="Win / loss drivers" icon={<Trophy size={14} />} right={<span className="text-[11px] text-slate-500">booked vs. not, in std. devs</span>} className="lg:col-span-6">
          <div className="space-y-1.5">
            {d.drivers.map((x) => (
              <div key={x.feature} className="grid grid-cols-[170px_1fr_48px] items-center gap-2 text-xs">
                <span className="truncate text-slate-300">{x.feature}</span>
                <div className="relative h-2.5 rounded-full bg-white/5">
                  <div className="absolute top-0 left-1/2 h-full w-px bg-white/20" />
                  <div className={`absolute top-0 h-full rounded-full ${x.d >= 0 ? 'left-1/2 bg-emerald-400' : 'right-1/2 bg-rose-400'}`} style={{ width: `${Math.min(50, Math.abs(x.d) * 40)}%` }} />
                </div>
                <span className={`text-right font-mono ${x.d >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{x.d >= 0 ? '+' : ''}{x.d.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl bg-white/[0.03] px-3 py-2.5 text-xs text-slate-300 ring-1 ring-white/5">
            <span className="font-semibold text-emerald-300">Coaching takeaway:</span> won calls end with a clear ask (“{d.drivers[0].feature.toLowerCase()}”), while unresolved objections are the strongest loss signal. Close every objection before asking for the ₹999 registration.
          </div>
        </Card>
        <div className="space-y-4 lg:col-span-6">
          <Card title="Weekly registrations & bookings" icon={<ListChecks size={14} />}>
            <div className="h-40">
              <ResponsiveContainer>
                <LineChart data={d.weeks} margin={{ left: -20, right: 8 }}>
                  <CartesianGrid stroke="rgba(148,163,255,0.07)" vertical={false} />
                  <XAxis dataKey="week" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip {...chartTooltip} />
                  <Line isAnimationActive={false} dataKey="registrations" stroke="#22d3ee" strokeWidth={2.5} dot={false} />
                  <Line isAnimationActive={false} dataKey="bookings" stroke="#34d399" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Conversion by lead source" icon={<Filter size={14} />}>
            <div className="h-36">
              <ResponsiveContainer>
                <BarChart data={d.sources} margin={{ left: -20, right: 8 }}>
                  <XAxis dataKey="source" stroke="#64748b" fontSize={10} interval={0} tickLine={false} tickFormatter={(v: string) => v.replace(' Campaign', '').replace(' Search', '').replace('.com', '')} />
                  <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => pct(v)} domain={[0, 0.6]} ticks={[0, 0.15, 0.3, 0.45, 0.6]} />
                  <Tooltip {...chartTooltip} formatter={(v) => pct(Number(v), 1)} />
                  <Bar isAnimationActive={false} dataKey="conv" name="Booking rate" fill="#a78bfa" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
      <Card title="Salesperson leaderboard" icon={<Users size={14} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm" data-testid="leaderboard">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="py-2">#</th><th>Salesperson</th><th className="text-right">Calls</th><th className="text-right">₹999 reg.</th><th className="text-right">Bookings</th><th className="text-right">Conversion</th><th className="text-right">Objection resolution</th><th className="text-right">Avg sentiment</th>
              </tr>
            </thead>
            <tbody>
              {board.map((b, i) => (
                <tr key={b.rep} className="border-t border-white/5">
                  <td className="py-2.5 text-slate-500">{i === 0 ? <Crown size={14} className="text-amber-300" /> : i + 1}</td>
                  <td className="font-semibold text-slate-100">{b.rep} {b.rep.includes('AI') && <Badge tone="cyan" className="ml-1">AI</Badge>}</td>
                  <td className="text-right font-mono text-slate-300">{b.calls}</td>
                  <td className="text-right font-mono text-slate-300">{b.reg}</td>
                  <td className="text-right font-mono text-slate-300">{b.booked}</td>
                  <td className="text-right"><div className="ml-auto flex w-36 items-center gap-2"><div className="h-1.5 flex-1 rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${(b.conv / maxConv) * 100}%` }} /></div><span className="w-12 font-mono text-emerald-300">{pct(b.conv, 1)}</span></div></td>
                  <td className="text-right font-mono text-slate-300">{pct(b.resolution)}</td>
                  <td className={`text-right font-mono ${b.sentiment >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{b.sentiment.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
