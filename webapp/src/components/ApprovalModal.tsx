import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ShieldCheck, Check, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

// Face-ID stays only on the login page now (see Login.tsx) - approving a
// policy just needs a fresh, server-verified Supabase session, checked
// independently in backend/auth.py rather than trusted from the client.
type Step = 'login' | 'done'

export default function ApprovalModal({ onClose, onApproved }: { onClose: () => void; onApproved: (approvalToken: string, identity: string) => void }) {
  const [step, setStep] = useState<Step>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ text: string; type: 'error' | 'ok' } | null>(null)
  const [busy, setBusy] = useState(false)

  // Mounts/unmounts with the modal (parent conditionally renders it) - locks
  // the page behind so a scroll gesture aimed at this modal can't leak
  // through to the dashboard underneath.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  async function handleApprove() {
    setMsg(null)
    if (!email || !password) { setMsg({ text: 'Enter your email and password.', type: 'error' }); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setMsg({ text: error.message, type: 'error' }); setBusy(false); return }

    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      setMsg({ text: 'Session expired - please try again.', type: 'error' })
      setBusy(false)
      return
    }

    try {
      const result = await api.getApprovalToken(accessToken)
      setStep('done')
      onApproved(result.token, result.email)
    } catch (err) {
      // The server independently re-checks the session against Supabase -
      // this is the real gate, not the browser's own sign-in call.
      setMsg({ text: `Server could not verify identity: ${(err as Error).message}`, type: 'error' })
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(20,17,10,0.45)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}>
        <motion.div initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
          className="glass-card w-[420px] max-w-[92vw] p-8 relative" style={{ background: 'rgba(255,255,255,0.92)' }}
          onClick={e => e.stopPropagation()}>
          <button onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700"><X size={18} /></button>

          <div className="flex items-center gap-2.5 mb-1">
            <ShieldCheck size={20} className="text-[#2B5D5E]" />
            <h2 className="text-lg font-bold">Verify identity to approve</h2>
          </div>
          <p className="text-[13px] text-neutral-500 mb-5">This policy affects real transaction decisions. Approval requires a verified human — this system never auto-deploys.</p>

          {msg && <div className={`text-[13px] px-3 py-2.5 rounded-[10px] mb-4 ${msg.type === 'error' ? 'bg-[#A6392F]/8 text-[#A6392F]' : 'bg-[#356B3F]/8 text-[#356B3F]'}`}>{msg.text}</div>}

          {step === 'login' && (
            <>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@razorpay.com" className="input mb-3" />
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="input mb-4" />
              <button onClick={handleApprove} disabled={busy} className="gold-btn w-full py-3 rounded-xl mb-3 flex items-center justify-center gap-2">
                {busy && <Loader2 size={16} className="animate-spin" />} {busy ? 'Verifying…' : 'Verify & approve'}
              </button>
              <p className="text-xs text-center text-neutral-400">No reviewer account yet? <Link to="/account" className="text-[#2B5D5E] font-semibold">Create one</Link></p>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}
                className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center text-white"
                style={{ background: 'linear-gradient(135deg,#3fae4a,#356B3F)' }}>
                <Check size={28} strokeWidth={3} />
              </motion.div>
              <div className="font-bold">Identity verified</div>
              <div className="text-sm text-neutral-500 mt-1">Approved by {email}</div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
