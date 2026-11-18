import { animate, useMotionValue } from 'framer-motion'
import { useEffect, useState } from 'react'

/** Semicircular purchase-likelihood gauge with a spring-animated needle. */
export default function Gauge({ value, threshold }: { value: number; threshold: number }) {
  const mv = useMotionValue(value)
  const [display, setDisplay] = useState(value)
  useEffect(() => {
    const c = animate(mv, value, { type: 'spring', stiffness: 60, damping: 14, onUpdate: setDisplay })
    return () => c.stop()
  }, [value, mv])
  const angle = -90 + Math.max(0, Math.min(1, display)) * 180
  const R = 88, cx = 110, cy = 105
  const arc = (a0: number, a1: number) => {
    const p = (a: number) => [cx + R * Math.cos(Math.PI * (1 - a)), cy - R * Math.sin(Math.PI * (1 - a))]
    const [x0, y0] = p(a0), [x1, y1] = p(a1)
    return `M ${x0} ${y0} A ${R} ${R} 0 0 1 ${x1} ${y1}`
  }
  const tier = display >= threshold + 0.25 ? { t: 'Hot lead', c: 'text-emerald-300' } : display >= threshold ? { t: 'Likely to book', c: 'text-cyan-300' } : display >= 0.15 ? { t: 'Nurture', c: 'text-amber-300' } : { t: 'At risk', c: 'text-rose-300' }
  const thrA = Math.PI * (1 - threshold)
  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 220 125" className="w-full">
        <defs>
          <linearGradient id="gg" x1="0" x2="1">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="40%" stopColor="#f59e0b" />
            <stop offset="70%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
          <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <path d={arc(0, 1)} stroke="#1d2640" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d={arc(0, Math.max(0.001, Math.min(1, display)))} stroke="url(#gg)" strokeWidth="14" fill="none" strokeLinecap="round" filter="url(#glow)" />
        <line x1={cx + (R - 14) * Math.cos(thrA)} y1={cy - (R - 14) * Math.sin(thrA)} x2={cx + (R + 12) * Math.cos(thrA)} y2={cy - (R + 12) * Math.sin(thrA)} stroke="#94a3b8" strokeDasharray="2 2" strokeWidth="1.5" />
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - R + 18} stroke="white" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="7" fill="#0e1322" stroke="white" strokeWidth="2.5" />
      </svg>
      <div className="-mt-3 text-center">
        <div className="text-4xl font-extrabold tabular-nums text-white" data-testid="score">{display < 0.01 ? '<1' : Math.round(display * 100)}<span className="text-xl text-slate-400">%</span></div>
        <div className={`text-sm font-semibold ${tier.c}`}>{tier.t}</div>
      </div>
    </div>
  )
}
