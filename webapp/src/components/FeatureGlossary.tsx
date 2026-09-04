import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, BookOpen } from 'lucide-react'

// Definitions here are the exact formulas from the code that computes each
// feature (src/feature_engineering.py for the base 7, backend/agent.py's
// FEATURE_DESCRIPTIONS for the 5 the autonomous engineer can discover) -
// not paraphrased separately, so this can never drift from what the
// dashboard actually computes.
const BASE_FEATURES: { name: string; def: string }[] = [
  { name: 'max_amount', def: "The customer's single largest purchase amount." },
  { name: 'escalation_ratio', def: 'How much bigger the biggest purchase is than the smallest one (max_amount ÷ min_amount) — a sudden jump stands out.' },
  { name: 'time_to_escalation', def: 'Days between the first purchase and the largest one — a fast jump to a big purchase is the core abuse pattern this project targets.' },
  { name: 'account_age_at_escalation', def: 'Days between account creation and the largest purchase — a brand-new account escalating immediately reads differently than an old one.' },
  { name: 'n_purchases_before_max', def: 'How many purchases happened before, and including, the largest one.' },
  { name: 'device_sharing', def: "How many OTHER customers share this customer's device ID — a ring signal." },
  { name: 'address_sharing', def: "How many OTHER customers share this customer's address ID — a ring signal." },
]

const DISCOVERED_FEATURES: { name: string; def: string }[] = [
  { name: 'amount_velocity', def: 'How fast the escalated amount was reached (max_amount ÷ days to escalate) — a patient ring and a fast-strike ring look different here even at the same amount.' },
  { name: 'ring_density', def: 'Combined device + address sharing count — a stronger single ring signal than either alone.' },
  { name: 'burst_ratio', def: 'Purchase count relative to time — flags accounts that transact unusually rapidly before escalating.' },
  { name: 'dual_sharing_signal', def: '1 only if BOTH device and address are shared — isolates coordinated rings from incidental single-signal overlap, e.g. a shared household address alone.' },
  { name: 'age_to_escalation_gap', def: 'The dormant gap before any activity started — a long quiet period before the first purchase is itself a pattern.' },
]

export default function FeatureGlossary({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          style={{ background: 'rgba(20,17,10,0.45)', backdropFilter: 'blur(4px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="glass-card w-[520px] max-w-[92vw] max-h-[85vh] p-7 relative"
            // Same Tailwind v4 cascade-layer fix as every other modal in this
            // app - .glass-card's plain overflow:hidden beats overflow-y-auto
            // unless it's inline.
            style={{ background: 'rgba(255,255,255,0.97)', overflowY: 'auto', overscrollBehavior: 'contain' }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700"><X size={18} /></button>

            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-none" style={{ background: 'rgba(43,93,94,0.1)' }}>
                <BookOpen size={16} className="text-[#2B5D5E]" />
              </div>
              <h2 className="text-lg font-bold">Feature glossary</h2>
            </div>
            <p className="text-[13px] text-neutral-500 mb-5">
              Every behavioral signal referenced anywhere in this dashboard, in one place. These are the exact formulas the pipeline computes — not simplified for this list.
            </p>

            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Core features (used by v1 / v2 / v3)</div>
            <div className="space-y-2.5 mb-5">
              {BASE_FEATURES.map(f => (
                <div key={f.name} className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(0,0,0,0.03)' }}>
                  <div className="font-mono text-[12.5px] font-bold mb-0.5" style={{ color: '#2B5D5E' }}>{f.name}</div>
                  <div className="text-[12.5px] text-neutral-600 leading-snug">{f.def}</div>
                </div>
              ))}
            </div>

            <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Discovered by the Autonomous Engineer (section 4.12)</div>
            <div className="space-y-2.5">
              {DISCOVERED_FEATURES.map(f => (
                <div key={f.name} className="rounded-lg px-3 py-2.5" style={{ background: 'rgba(150,106,34,0.06)' }}>
                  <div className="font-mono text-[12.5px] font-bold mb-0.5" style={{ color: '#966A22' }}>{f.name}</div>
                  <div className="text-[12.5px] text-neutral-600 leading-snug">{f.def}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
