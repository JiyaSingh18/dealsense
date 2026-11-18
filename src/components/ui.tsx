import type { ReactNode } from 'react'

export function Card({ title, icon, right, children, className = '' }: { title?: ReactNode; icon?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass rounded-2xl p-4 sm:p-5 ${className}`}>
      {(title || right) && (
        <header className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-slate-300">
            {icon && <span className="text-cyan-300">{icon}</span>}
            {title}
          </h3>
          {right}
        </header>
      )}
      {children}
    </section>
  )
}

const tones = {
  slate: 'bg-slate-500/10 text-slate-300 ring-slate-400/20',
  cyan: 'bg-cyan-400/10 text-cyan-300 ring-cyan-400/25',
  violet: 'bg-violet-400/10 text-violet-300 ring-violet-400/25',
  green: 'bg-emerald-400/10 text-emerald-300 ring-emerald-400/25',
  amber: 'bg-amber-400/10 text-amber-300 ring-amber-400/25',
  red: 'bg-rose-500/10 text-rose-300 ring-rose-400/25',
}
export type Tone = keyof typeof tones
export function Badge({ children, tone = 'slate', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tones[tone]} ${className}`}>{children}</span>
}

export function Stat({ label, value, sub, accent = 'text-white' }: { label: string; value: ReactNode; sub?: ReactNode; accent?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accent}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  )
}

export const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  booked: { label: 'Booked', tone: 'green' },
  follow_up: { label: 'Follow-up', tone: 'amber' },
  lost: { label: 'Lost', tone: 'red' },
}

export const pct = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`

export const chartTooltip = {
  contentStyle: { background: '#0e1322', border: '1px solid rgba(148,163,255,0.18)', borderRadius: 12, fontSize: 12 },
  labelStyle: { color: '#94a3b8' },
  itemStyle: { color: '#e2e8f0' },
}
