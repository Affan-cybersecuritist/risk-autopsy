import { useState, useEffect } from 'react'
import { Microscope, ChevronDown, Settings, BookOpen, LogOut } from 'lucide-react'

// The primary spine: what a judge skimming for 90 seconds needs to see.
// Everything else is real, load-bearing evidence for these claims - not
// equal-weight content - so it's tucked behind a collapsed group instead
// of forcing 17 top-level items on first paint.
const PRIMARY_SECTIONS = [
  { id: 'sec-1', label: 'The Loss', num: '1' },
  { id: 'sec-2', label: 'Autopsy', num: '2' },
  { id: 'sec-3', label: 'Policy Comparison', num: '3' },
  { id: 'sec-4', label: 'Adversarial Test', num: '4' },
  { id: 'sec-5', label: 'Approval Gate', num: '5' },
  { id: 'sec-6', label: 'Workspaces', num: '6' },
]

const DEEP_SECTIONS = [
  { id: 'sec-4-5', label: 'Co-Evolution', num: '4.5' },
  { id: 'sec-4-6', label: 'Off-Policy Eval', num: '4.6' },
  { id: 'sec-4-7', label: 'Portfolio Check', num: '4.7' },
  { id: 'sec-4-8', label: 'Blast Radius', num: '4.8' },
  { id: 'sec-4-9', label: 'Version History', num: '4.9' },
  { id: 'sec-4-10', label: 'Drift Monitor', num: '4.10' },
  { id: 'sec-4-11', label: 'Counterfactual Replay', num: '4.11' },
  { id: 'sec-4-12', label: 'Autonomous Engineer', num: '4.12' },
  { id: 'sec-4-13', label: 'Intervention Optimizer', num: '4.13' },
  { id: 'sec-4-14', label: 'Residual Scan (experimental)', num: '4.14' },
  { id: 'sec-4-15', label: 'Evaluation Rigor', num: '4.15' },
]

const SECTIONS = [...PRIMARY_SECTIONS, ...DEEP_SECTIONS]

export default function Sidebar({ apiOnline, onOpenSettings, onOpenGlossary, username, onLogout }: {
  apiOnline: boolean
  onOpenSettings: () => void
  onOpenGlossary: () => void
  username?: string | null
  onLogout?: () => void
}) {
  const [active, setActive] = useState('sec-1')
  const [deepOpen, setDeepOpen] = useState(false)

  // Auto-expand the deep-validation group if scroll lands inside it, so the
  // active highlight is never hidden behind a collapsed toggle.
  useEffect(() => {
    if (DEEP_SECTIONS.some(s => s.id === active)) setDeepOpen(true)
  }, [active])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id)
        })
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    )
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[272px] flex flex-col z-20" style={{ borderRight: '1px solid #D7D9CD', background: '#F1F2EC' }}>
      <div className="flex items-center gap-3 px-6 pt-8 pb-5">
        <div
          className="w-9 h-9 rounded-[8px] flex items-center justify-center flex-none text-white"
          style={{ background: '#2B5D5E' }}
        >
          <Microscope size={17} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-[17px] leading-tight truncate" style={{ fontFamily: "'Fraunces', serif" }}>Risk Autopsy</div>
          <div className="text-[10px] font-semibold tracking-wide truncate uppercase" style={{ color: '#5C7370' }}>Case console</div>
        </div>
      </div>

      <div className="mx-4 mb-5 rounded-[10px] px-3.5 py-3 text-[12px] flex flex-col gap-1.5" style={{ background: '#FFFFFF', border: '1px solid #D7D9CD', color: '#5C7370' }}>
        <div className="flex justify-between gap-2"><span>Merchant</span><b style={{ color: '#151912' }}>Anonymised · #RZP-4471</b></div>
        <div className="flex justify-between gap-2"><span>Window</span><b style={{ color: '#151912' }}>Last 90 days</b></div>
        <div className="flex justify-between gap-2"><span>Status</span><b style={{ color: '#966A22' }}>Awaiting approval</b></div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {PRIMARY_SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm font-medium transition-colors mb-0.5 ${
              active === s.id ? '' : 'text-neutral-600 hover:bg-black/5'
            }`}
            style={active === s.id ? { background: '#E1EAE7', color: '#151912' } : {}}
          >
            <span className={`flex-none w-6 h-6 rounded-full border flex items-center justify-center text-[11px] font-bold font-mono ${
              active === s.id ? 'text-white' : 'bg-white text-neutral-500'
            }`} style={active === s.id ? { background: '#2B5D5E', borderColor: '#2B5D5E' } : { borderColor: '#B7BAA9' }}>
              {s.num}
            </span>
            <span className="truncate">{s.label}</span>
          </button>
        ))}

        <button
          onClick={() => setDeepOpen(o => !o)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold text-neutral-500 hover:bg-black/5 transition-colors mb-1 mt-2"
        >
          <span className="flex-none w-6 h-6 rounded-md flex items-center justify-center bg-black/5">
            <ChevronDown size={13} className={`transition-transform ${deepOpen ? 'rotate-180' : ''}`} />
          </span>
          <span className="truncate flex-1">Deep validation</span>
          <span className="flex-none text-[10px] font-bold text-neutral-400">{DEEP_SECTIONS.length}</span>
        </button>
        {deepOpen && (
          <div className="pl-3 border-l-2 border-black/5 ml-6 mb-1">
            {DEEP_SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[13px] font-medium transition-colors mb-0.5 ${
                  active === s.id ? '' : 'text-neutral-500 hover:bg-black/5'
                }`}
                style={active === s.id ? { background: '#E1EAE7', color: '#151912' } : {}}
              >
                <span className={`flex-none w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold font-mono ${
                  active === s.id ? 'text-white' : 'bg-black/5 text-neutral-400'
                }`} style={active === s.id ? { background: '#2B5D5E' } : {}}>
                  {s.num}
                </span>
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {username && (
        <div className="mx-4 mb-4 rounded-[10px] px-3.5 py-3 flex items-center justify-between gap-2" style={{ background: '#FFFFFF', border: '1px solid #D7D9CD' }}>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold tracking-wide uppercase" style={{ color: '#5C7370' }}>Signed in as</div>
            <div className="text-[13px] font-semibold truncate" style={{ color: '#151912' }}>{username}</div>
          </div>
          <button onClick={onLogout} title="Log out" className="flex-none text-neutral-400 hover:text-[#A6392F] transition-colors">
            <LogOut size={15} />
          </button>
        </div>
      )}

      <div className="px-6 py-5 border-t border-black/5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
            <span className={`w-2 h-2 rounded-full ${apiOnline ? 'bg-emerald-500' : 'bg-red-400'}`} />
            {apiOnline ? 'Backend live' : 'Backend offline'}
          </div>
          <div className="flex items-center gap-3 flex-none">
            <button
              onClick={onOpenGlossary}
              title="Feature glossary"
              className="text-neutral-400 hover:text-[#2B5D5E] transition-colors"
            >
              <BookOpen size={15} />
            </button>
            <button
              onClick={onOpenSettings}
              title="Settings"
              className="text-neutral-400 hover:text-[#2B5D5E] transition-colors"
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
        <div className="text-[11px] text-neutral-400 mt-1">Every loss becomes a defense.</div>
      </div>
    </aside>
  )
}
