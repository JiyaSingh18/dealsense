export default function Waveform({ active, speaker }: { active: boolean; speaker: 'agent' | 'buyer' | null }) {
  const color = speaker === 'buyer' ? 'bg-violet-400' : 'bg-cyan-400'
  return (
    <div className="flex h-10 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
      {Array.from({ length: 42 }).map((_, i) => (
        <span
          key={i}
          className={`w-[3px] shrink-0 rounded-full ${active ? `wave-bar ${color}` : 'bg-slate-600/60'}`}
          style={{ height: `${30 + ((i * 37) % 70)}%`, animationDelay: `${(i * 73) % 900}ms`, animationDuration: `${700 + ((i * 131) % 600)}ms`, transform: active ? undefined : 'scaleY(0.25)' }}
        />
      ))}
    </div>
  )
}
