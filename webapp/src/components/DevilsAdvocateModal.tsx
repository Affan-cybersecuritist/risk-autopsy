import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, X, CheckCircle2 } from 'lucide-react'

interface Gate {
  name: string
  detail: string
  passed: boolean
  threshold: string
}

export default function DevilsAdvocateModal({
  onAccept,
  onCancel,
  gates
}: {
  onAccept: () => void
  onCancel: () => void
  gates: Gate[]
}) {
  const failed = gates.filter(g => !g.passed)

  // This component mounts/unmounts with the modal (the parent conditionally
  // renders it), so a plain mount-time lock/unmount-time unlock is enough -
  // unlike SettingsPanel, which stays mounted and needs to key off `open`.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-6"
        style={{ background: 'rgba(20,10,10,0.65)', backdropFilter: 'blur(8px)' }}
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="glass-card w-[520px] max-w-[92vw] p-8 relative border-t-4 border-t-[#A6392F]"
          style={{ background: 'rgba(255,255,255,0.95)' }}
          onClick={e => e.stopPropagation()}
        >
          <button onClick={onCancel} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700">
            <X size={18} />
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-[#A6392F]/10 rounded-full">
              <ShieldAlert size={24} className="text-[#A6392F]" />
            </div>
            <h2 className="text-xl font-extrabold text-neutral-900">Before you approve...</h2>
          </div>

          <p className="text-sm text-neutral-600 mb-4">
            This candidate's real, machine-computed gate results — the exact same 8-gate checklist every version in
            this timeline carries. Nothing below is generated for this dialog; it's read straight from this version's
            recorded gate results.
          </p>

          <div className="space-y-2 mb-6 max-h-[300px] overflow-y-auto overscroll-contain pr-1">
            {gates.length === 0 && (
              <p className="text-sm text-neutral-400 italic">No gate results recorded for this version.</p>
            )}
            {gates.map(g => (
              <div
                key={g.name}
                className={`flex items-start gap-2 rounded-lg p-3 text-[13px] ${g.passed ? 'bg-neutral-50 border border-neutral-100' : 'bg-[#A6392F]/5 border border-[#A6392F]/20'}`}
              >
                {g.passed
                  ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                  : <span className="mt-0.5 shrink-0 font-bold text-[#A6392F]">✕</span>}
                <div>
                  <span className="font-bold text-neutral-800">{g.name}</span>
                  <span className="text-neutral-600"> — {g.detail}</span>
                  {!g.passed && <div className="text-[11px] text-[#A6392F] mt-0.5">needs {g.threshold}</div>}
                </div>
              </div>
            ))}
          </div>

          {failed.length > 0 && (
            <div className="bg-[#A6392F]/5 rounded-xl p-4 mb-6 border border-[#A6392F]/20">
              <p className="text-sm font-semibold text-[#A6392F] mb-1">
                {failed.length} gate{failed.length > 1 ? 's' : ''} did not pass on this version.
              </p>
              <p className="text-[13px] text-neutral-700">
                Approving anyway is possible, but this version did not clear every check that decides eligibility.
              </p>
            </div>
          )}

          <p className="text-sm text-neutral-600 mb-6">
            Do you want to proceed to the biometric approval step?
          </p>

          <div className="flex gap-3 mt-2">
            <button
              onClick={onCancel}
              className="flex-1 py-3 px-4 rounded-xl text-neutral-700 font-semibold bg-neutral-100 hover:bg-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              className="flex-1 py-3 px-4 rounded-xl text-white font-bold bg-[#A6392F] hover:bg-[#922A36] transition-colors shadow-lg shadow-[#A6392F]/20"
            >
              Continue to approval
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
