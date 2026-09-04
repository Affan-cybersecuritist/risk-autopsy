import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type * as FaceApi from 'face-api.js'
import { X, ShieldCheck, Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { api } from '../lib/api'

type Step = 'login' | 'face' | 'done'
const MODEL_URL = '/models'
const MATCH_THRESHOLD = 0.6

export default function ApprovalModal({ onClose, onApproved }: { onClose: () => void; onApproved: (approvalToken: string, identity: string) => void }) {
  const [step, setStep] = useState<Step>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState<{ text: string; type: 'error' | 'ok' } | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [ringState, setRingState] = useState<'scanning' | 'match' | 'nomatch'>('scanning')
  const [faceStep, setFaceStep] = useState('Loading face models…')
  const [busy, setBusy] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faceapiRef = useRef<typeof FaceApi | null>(null)

  useEffect(() => () => streamRef.current?.getTracks().forEach(t => t.stop()), [])

  async function handleLogin() {
    setMsg(null)
    if (!email || !password) { setMsg({ text: 'Enter your email and password.', type: 'error' }); return }
    setBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) { setMsg({ text: error.message, type: 'error' }); return }
    setUserId(data.user.id)
    setStep('face')
    setFaceStep('Loading face models…')

    const faceapi = await import('face-api.js')
    faceapiRef.current = faceapi
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    setFaceStep('Requesting camera access — click "Allow" in your browser…')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setFaceStep('Position your face in frame to confirm this approval')
    } catch (err) {
      setMsg({ text: `Camera access denied: ${(err as Error).message}`, type: 'error' })
    }
  }

  async function handleVerify() {
    if (!videoRef.current || !userId || !faceapiRef.current) return
    const faceapi = faceapiRef.current
    setBusy(true)
    setFaceStep('Verifying…')
    const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks().withFaceDescriptor()

    if (!detection) {
      setMsg({ text: 'No face detected. Make sure you\'re well-lit and centered, then try again.', type: 'error' })
      setFaceStep('Position your face in frame to confirm this approval')
      setBusy(false)
      return
    }

    const { data, error } = await supabase.from('profiles').select('face_descriptor').eq('id', userId).single()
    if (error || !data?.face_descriptor) {
      setMsg({ text: 'No enrolled face found for this account.', type: 'error' })
      setBusy(false)
      return
    }
    // Client-side check first, purely for instant visual feedback (the ring
    // color, the "no match, try again" prompt) - it is NOT what authorizes
    // the approval. The backend independently re-fetches the enrolled
    // descriptor and re-computes this same comparison itself; only its
    // verdict can mint an approval token. See backend/auth.py.
    const distance = faceapi.euclideanDistance(Array.from(detection.descriptor), new Float32Array(data.face_descriptor))
    if (distance >= MATCH_THRESHOLD) {
      setRingState('nomatch')
      setMsg({ text: `Face does not match this account (distance ${distance.toFixed(3)}). Try again.`, type: 'error' })
      setBusy(false)
      setTimeout(() => setRingState('scanning'), 1200)
      return
    }

    setFaceStep('Confirming with server…')
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      setMsg({ text: 'Session expired - please sign in again.', type: 'error' })
      setBusy(false)
      return
    }

    try {
      const result = await api.getApprovalToken(accessToken, Array.from(detection.descriptor))
      setRingState('match')
      streamRef.current?.getTracks().forEach(t => t.stop())
      setTimeout(() => {
        setStep('done')
        onApproved(result.token, result.email)
      }, 500)
    } catch (err) {
      // The server independently re-checked the face match and disagreed
      // with (or couldn't reproduce) the client-side result - this is the
      // real gate, so a server rejection wins even if the browser thought
      // it matched.
      setRingState('nomatch')
      setMsg({ text: `Server could not verify identity: ${(err as Error).message}`, type: 'error' })
      setBusy(false)
      setTimeout(() => setRingState('scanning'), 1200)
    }
  }

  const ringClass = { scanning: 'border-[#B8860B]', match: 'border-[#2E7D32]', nomatch: 'border-[#B23A48]' }[ringState]

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
            <ShieldCheck size={20} className="text-[#B8860B]" />
            <h2 className="text-lg font-bold">Verify identity to approve</h2>
          </div>
          <p className="text-[13px] text-neutral-500 mb-5">This policy affects real transaction decisions. Approval requires a verified human — this system never auto-deploys.</p>

          {msg && <div className={`text-[13px] px-3 py-2.5 rounded-[10px] mb-4 ${msg.type === 'error' ? 'bg-[#B23A48]/8 text-[#B23A48]' : 'bg-[#2E7D32]/8 text-[#2E7D32]'}`}>{msg.text}</div>}

          {step === 'login' && (
            <>
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@razorpay.com" className="input mb-3" />
              <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wide block mb-1.5">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="input mb-4" />
              <button onClick={handleLogin} disabled={busy} className="gold-btn w-full py-3 rounded-xl mb-3">
                {busy ? 'Signing in…' : 'Continue to face verification'}
              </button>
              <p className="text-xs text-center text-neutral-400">No reviewer account yet? <Link to="/account" className="text-[#B8860B] font-semibold">Create one</Link></p>
            </>
          )}

          {step === 'face' && (
            <>
              <div className={`relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black mb-4 border-[3px] transition-colors ${ringClass}`}>
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
              </div>
              <div className="text-center text-xs text-neutral-400 mb-3">{faceStep}</div>
              <button onClick={handleVerify} disabled={busy} className="gold-btn w-full py-3 rounded-xl">
                {busy ? 'Verifying…' : 'Capture & approve'}
              </button>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}
                className="w-16 h-16 mx-auto mb-3 rounded-full flex items-center justify-center text-white"
                style={{ background: 'linear-gradient(135deg,#3fae4a,#2E7D32)' }}>
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
