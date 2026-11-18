import { motion } from 'framer-motion'
import { Activity, Brain, LayoutDashboard, PhoneCall } from 'lucide-react'
import { useEffect, useState } from 'react'
import Dashboard from './pages/Dashboard'
import LiveCall from './pages/LiveCall'
import ModelPage from './pages/ModelPage'

const TABS = [
  { id: 'call', label: 'Live call', short: 'Live call', icon: PhoneCall },
  { id: 'dashboard', label: 'Manager dashboard', short: 'Dashboard', icon: LayoutDashboard },
  { id: 'model', label: 'Model', short: 'Model', icon: Brain },
] as const
type Tab = (typeof TABS)[number]['id']
const fromHash = (): Tab => {
  const h = window.location.hash.replace('#/', '')
  return (TABS.some((t) => t.id === h) ? h : 'call') as Tab
}

export default function App() {
  const [tab, setTab] = useState<Tab>(fromHash)
  useEffect(() => {
    const on = () => setTab(fromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return (
    <div className="mx-auto max-w-[1600px] px-3 pb-10 sm:px-6">
      <header className="sticky top-0 z-20 -mx-3 mb-5 border-b border-white/5 bg-ink-950/70 px-3 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <a href="#/call" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-500 shadow-lg shadow-cyan-500/20">
              <Activity size={19} className="text-ink-950" strokeWidth={2.6} />
            </div>
            <div className="leading-tight">
              <div className="text-lg font-extrabold tracking-tight text-white">Deal<span className="grad-text">Sense</span></div>
              <div className="text-[11px] text-slate-400">Live sales-call intelligence for real estate</div>
            </div>
          </a>
          <nav className="order-3 flex w-full gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-white/5 sm:order-none sm:ml-6 sm:w-auto">
            {TABS.map((t) => (
              <a key={t.id} href={`#/${t.id}`} data-testid={`tab-${t.id}`} className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition sm:flex-none ${tab === t.id ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {tab === t.id && <motion.span layoutId="tab" className="absolute inset-0 rounded-lg bg-white/10" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                <t.icon size={14} className="relative" /><span className="relative hidden sm:inline">{t.label}</span><span className="relative sm:hidden">{t.short}</span>
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-amber-400/25 md:flex">● Synthetic demo data</span>
            <a href="https://github.com/JiyaSingh18/dealsense" target="_blank" rel="noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 ring-1 ring-white/10 hover:bg-white/5" title="Source on GitHub">
              <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
            </a>
          </div>
        </div>
      </header>
      <motion.main key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        {tab === 'call' && <LiveCall />}
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'model' && <ModelPage />}
      </motion.main>
      <footer className="mt-10 text-center text-xs text-slate-500">
        DealSense · built by Jiya Singh · All calls, names, leads and outcomes are synthetic demo data. Scoring runs entirely in your browser.
      </footer>
    </div>
  )
}
