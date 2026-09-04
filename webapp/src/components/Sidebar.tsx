import { useState, useEffect } from 'react'
import { Microscope } from 'lucide-react'

const SECTIONS = [
  { id: 'sec-1', label: 'The Loss', num: '1' },
  { id: 'sec-2', label: 'Autopsy', num: '2' },
  { id: 'sec-3', label: 'Policy Comparison', num: '3' },
  { id: 'sec-4', label: 'Adversarial Test', num: '4' },
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
  { id: 'sec-5', label: 'Approval Gate', num: '5' },
  { id: 'sec-6', label: 'Workspaces', num: '6' },
]

export default function Sidebar({ apiOnline }: { apiOnline: boolean }) {
  const [active, setActive] = useState('sec-1')

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
    <aside className="fixed left-0 top-0 bottom-0 w-[272px] flex flex-col border-r border-black/5 bg-white/70 backdrop-blur-xl z-20">
      <div className="flex items-center gap-3 px-6 pt-8 pb-6">
        <div
          className="w-10 h-10 rounded-[11px] flex items-center justify-center flex-none text-white"
          style={{ background: 'linear-gradient(135deg,#D4AF37,#B8860B)', boxShadow: '0 6px 16px rgba(184,134,11,0.35)' }}
        >
          <Microscope size={19} />
        </div>
        <div className="min-w-0">
          <div className="font-extrabold text-[16px] leading-tight truncate">Risk Autopsy</div>
          <div className="text-[10px] font-semibold tracking-wide truncate" style={{ color: '#9a8560' }}>ABUSE-RING SENTINEL</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-colors mb-1 ${
              active === s.id ? 'text-white' : 'text-neutral-600 hover:bg-black/5'
            }`}
            style={active === s.id ? { background: 'linear-gradient(135deg,#D4AF37,#B8860B)', boxShadow: '0 8px 18px rgba(184,134,11,0.3)' } : {}}
          >
            <span className={`flex-none w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${
              active === s.id ? 'bg-white/25' : 'bg-black/5 text-neutral-500'
            }`}>
              {s.num}
            </span>
            <span className="truncate">{s.label}</span>
          </button>
        ))}
      </nav>

      <div className="px-6 py-5 border-t border-black/5">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-500">
          <span className={`w-2 h-2 rounded-full ${apiOnline ? 'bg-emerald-500' : 'bg-red-400'}`} />
          {apiOnline ? 'Backend live' : 'Backend offline'}
        </div>
        <div className="text-[11px] text-neutral-400 mt-1">Every loss becomes a defense.</div>
      </div>
    </aside>
  )
}
