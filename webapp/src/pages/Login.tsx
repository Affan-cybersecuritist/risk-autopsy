import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type * as FaceApi from 'face-api.js'
import { supabase } from '../lib/supabase'
const Background3D = lazy(() => import('../components/Background3D'))
import { Microscope, Check } from 'lucide-react'

type Step = 'login' | 'signup' | 'face' | 'success'
type FaceMode = 'enroll' | 'verify'

const MODEL_URL = '/models'
const MATCH_THRESHOLD = 0.6

export default function Login() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('login')
  const [msg, setMsg] = useState<{ text: string; type: 'error' | 'info' | 'ok' } | null>(null)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')

  const [faceMode, setFaceMode] = useState<FaceMode>('enroll')
  const [pendingUserId, setPendingUserId] = useState<string | null>(null)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [faceStep, setFaceStep] = useState('Loading face models…')
  const [ringState, setRingState] = useState<'idle' | 'scanning' | 'match' | 'nomatch'>('idle')
  const [captureBusy, setCaptureBusy] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const faceapiRef = useRef<typeof FaceApi | null>(null)

  useEffect(() => {
    return () => stopCamera()
  }, [])

  async function loadModels() {
    if (modelsLoaded) return
    const faceapi = await import('face-api.js')
    faceapiRef.current = faceapi
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ])
    setModelsLoaded(true)
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      return true
    } catch (err) {
      setMsg({ text: `Camera access denied or unavailable: ${(err as Error).message}`, type: 'error' })
      return false
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  async function openFaceStep(mode: FaceMode, userId: string) {
    setFaceMode(mode)
    setPendingUserId(userId)
    setMsg(null)
    setRingState('idle')
    setFaceStep('Loading face models…')
    setStep('face')

    await loadModels()
    setFaceStep('Requesting camera access — click "Allow" in your browser…')
    const ok = await startCamera()
    if (!ok) return
    setFaceStep('Position your face in frame')
    setRingState('scanning')
  }

  async function handleLogin() {
    setMsg(null)
    if (!loginEmail || !loginPassword) { setMsg({ text: 'Enter your email and password.', type: 'error' }); return }
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) { setMsg({ text: error.message, type: 'error' }); return }
    await openFaceStep('verify', data.user.id)
  }

  async function handleSignup() {
    setMsg(null)
    if (!signupEmail || !signupPassword || signupPassword.length < 6) {
      setMsg({ text: 'Enter a valid email and a password of at least 6 characters.', type: 'error' }); return
    }
    const { data, error } = await supabase.auth.signUp({ email: signupEmail, password: signupPassword })
    if (error) { setMsg({ text: error.message, type: 'error' }); return }
    if (!data.user) { setMsg({ text: 'Check your inbox to confirm your email, then sign in.', type: 'info' }); return }

    const { error: profErr } = await supabase.from('profiles').insert({ id: data.user.id, email: signupEmail })
    if (profErr && profErr.code !== '23505') {
      setMsg({ text: `Account created, but profile setup failed: ${profErr.message}`, type: 'error' }); return
    }
    await openFaceStep('enroll', data.user.id)
  }

  async function handleCapture() {
    if (!videoRef.current || !pendingUserId || !faceapiRef.current) return
    const faceapi = faceapiRef.current
    setCaptureBusy(true)
    setFaceStep('Analyzing…')

    const detection = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks().withFaceDescriptor()

    if (!detection) {
      setMsg({ text: "No face detected. Make sure you're well-lit and centered, then try again.", type: 'error' })
      setFaceStep('Position your face in frame')
      setCaptureBusy(false)
      return
    }

    const descriptor = Array.from(detection.descriptor)

    if (faceMode === 'enroll') {
      const { error } = await supabase.from('profiles').update({ face_descriptor: descriptor }).eq('id', pendingUserId)
      if (error) {
        setMsg({ text: `Could not save face profile: ${error.message}`, type: 'error' })
        setCaptureBusy(false)
        return
      }
      setRingState('match')
      setMsg({ text: 'Face enrolled successfully.', type: 'ok' })
      stopCamera()
      setSuccessMsg("Account created and face enrolled. You're all set.")
      setTimeout(() => setStep('success'), 700)
    } else {
      const { data, error } = await supabase.from('profiles').select('face_descriptor').eq('id', pendingUserId).single()
      if (error || !data?.face_descriptor) {
        setMsg({ text: 'No enrolled face found for this account. Please sign up again.', type: 'error' })
        setCaptureBusy(false)
        return
      }
      const stored = new Float32Array(data.face_descriptor)
      const distance = faceapi.euclideanDistance(descriptor, stored)
      if (distance < MATCH_THRESHOLD) {
        setRingState('match')
        setMsg({ text: `Identity confirmed (distance ${distance.toFixed(3)}).`, type: 'ok' })
        stopCamera()
        setSuccessMsg('Identity verified. Opening your risk console…')
        setTimeout(() => setStep('success'), 700)
      } else {
        setRingState('nomatch')
        setMsg({ text: `Face does not match enrolled profile (distance ${distance.toFixed(3)}). Try again.`, type: 'error' })
        setFaceStep('Position your face in frame')
        setCaptureBusy(false)
        setTimeout(() => setRingState('scanning'), 1200)
        return
      }
    }
  }

  function cancelFace() {
    stopCamera()
    setStep(faceMode === 'enroll' ? 'signup' : 'login')
  }

  const ringClass = {
    idle: 'border-transparent',
    scanning: 'border-[#2B5D5E] shadow-[inset_0_0_40px_rgba(43,93,94,0.25)] animate-pulse',
    match: 'border-[#356B3F] shadow-[inset_0_0_40px_rgba(53,107,63,0.25)]',
    nomatch: 'border-[#A6392F] shadow-[inset_0_0_40px_rgba(166,57,47,0.25)]',
  }[ringState]

  const msgClass = msg ? {
    error: 'bg-[#A6392F]/8 text-[#A6392F]',
    info: 'bg-[#2B5D5E]/8 text-[#966A22]',
    ok: 'bg-[#356B3F]/8 text-[#356B3F]',
  }[msg.type] : ''

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden">
      <Suspense fallback={null}><Background3D /></Suspense>

      <div className="fixed top-8 left-10 flex items-center gap-3 z-10">
        <div className="w-[34px] h-[34px] rounded-[9px] flex items-center justify-center text-white"
             style={{ background: 'linear-gradient(135deg,#3E7A7B,#2B5D5E)', boxShadow: '0 4px 14px rgba(43,93,94,0.35)' }}>
          <Microscope size={17} />
        </div>
        <div>
          <div className="font-bold text-[17px]">Risk Autopsy</div>
          <div className="text-[11px] text-neutral-400 tracking-wide">REVIEWER ACCOUNT</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 'login' && (
          <motion.div key="login" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card w-[420px] max-w-[92vw] p-9 z-10">
            <h1 className="text-[22px] font-bold mb-1">Welcome back</h1>
            <p className="text-[13px] text-neutral-500 mb-6">This account is used to biometrically verify policy approvals — not required just to browse the dashboard.</p>
            {msg && <div className={`text-[13px] px-3 py-2.5 rounded-[10px] mb-4 ${msgClass}`}>{msg.text}</div>}
            <Field label="Email"><input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
              placeholder="you@razorpay.com" className="input" /></Field>
            <Field label="Password"><input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
              placeholder="••••••••" className="input" /></Field>
            <button onClick={handleLogin} className="gold-btn w-full py-3 rounded-xl mt-2">Continue</button>
            <div className="text-center mt-4 text-[13px] text-neutral-500">
              New here? <a onClick={() => { setStep('signup'); setMsg(null) }} className="text-[#2B5D5E] font-semibold cursor-pointer">Create an account</a>
            </div>
          </motion.div>
        )}

        {step === 'signup' && (
          <motion.div key="signup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card w-[420px] max-w-[92vw] p-9 z-10">
            <h1 className="text-[22px] font-bold mb-1">Create your account</h1>
            <p className="text-[13px] text-neutral-500 mb-6">You'll enroll your face next, for secure biometric login.</p>
            {msg && <div className={`text-[13px] px-3 py-2.5 rounded-[10px] mb-4 ${msgClass}`}>{msg.text}</div>}
            <Field label="Email"><input type="email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)}
              placeholder="you@razorpay.com" className="input" /></Field>
            <Field label="Password"><input type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)}
              placeholder="min 6 characters" className="input" /></Field>
            <button onClick={handleSignup} className="gold-btn w-full py-3 rounded-xl mt-2">Create account</button>
            <div className="text-center mt-4 text-[13px] text-neutral-500">
              Already have an account? <a onClick={() => { setStep('login'); setMsg(null) }} className="text-[#2B5D5E] font-semibold cursor-pointer">Sign in</a>
            </div>
          </motion.div>
        )}

        {step === 'face' && (
          <motion.div key="face" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card w-[420px] max-w-[92vw] p-9 z-10">
            <h1 className="text-[22px] font-bold mb-1">{faceMode === 'enroll' ? 'Enroll your face' : 'Verify your identity'}</h1>
            <p className="text-[13px] text-neutral-500 mb-6">
              {faceMode === 'enroll' ? 'This becomes your biometric key for future logins.' : 'Confirming this is really you before granting access.'}
            </p>
            {msg && <div className={`text-[13px] px-3 py-2.5 rounded-[10px] mb-4 ${msgClass}`}>{msg.text}</div>}
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black mb-4 border border-black/10">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
              <div className={`absolute inset-0 rounded-2xl border-[3px] transition-colors duration-300 pointer-events-none ${ringClass}`} />
            </div>
            <div className="text-center text-xs text-neutral-400 mb-2.5">{faceStep}</div>
            <button onClick={handleCapture} disabled={captureBusy || !modelsLoaded} className="gold-btn w-full py-3 rounded-xl mb-2.5">
              Capture &amp; Verify
            </button>
            <button onClick={cancelFace} className="w-full py-3 rounded-xl border border-black/10 font-semibold">Cancel</button>
          </motion.div>
        )}

        {step === 'success' && (
          <motion.div key="success" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="glass-card w-[420px] max-w-[92vw] p-9 z-10 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}
              className="w-[72px] h-[72px] mx-auto mb-4 rounded-full flex items-center justify-center text-white"
              style={{ background: 'linear-gradient(135deg,#3fae4a,#356B3F)', boxShadow: '0 14px 30px rgba(53,107,63,0.35)' }}>
              <Check size={34} strokeWidth={3} />
            </motion.div>
            <h1 className="text-[22px] font-bold mb-1">Access granted</h1>
            <p className="text-[13px] text-neutral-500 mb-6">{successMsg}</p>
            <button onClick={() => navigate('/')} className="gold-btn w-full py-3 rounded-xl">Return to the risk console</button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="fixed bottom-5 left-0 right-0 text-center text-[11px] text-neutral-400 z-10">
        Every loss becomes a defense. — Risk Autopsy, Track 2
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="text-[11px] font-semibold text-neutral-500 tracking-wide uppercase block mb-1.5">{label}</label>
      {children}
    </div>
  )
}
