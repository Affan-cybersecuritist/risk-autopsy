import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import type * as FaceApi from 'face-api.js'
import { supabase } from '../lib/supabase'
import { passwordIssues, passwordStrength } from '../lib/password'
const Background3D = lazy(() => import('../components/Background3D'))
import { Microscope, Check, Loader2, ShieldCheck, ScanFace, FileCheck } from 'lucide-react'

type Step = 'login' | 'signup' | 'face' | 'greeting'
type FaceMode = 'enroll' | 'verify'

const MODEL_URL = '/models'
const MATCH_THRESHOLD = 0.6

// Shared step-card transition: a soft blur+scale cross-dissolve reads as
// more deliberate than a plain slide, without being showy about it.
const cardMotion = {
  initial: { opacity: 0, y: 14, scale: 0.97, filter: 'blur(6px)' },
  animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, y: -14, scale: 0.97, filter: 'blur(6px)' },
  transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
} as const

const EASE_OUT = [0.22, 1, 0.36, 1] as const

export default function Login() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('login')
  const [msg, setMsg] = useState<{ text: string; type: 'error' | 'info' | 'ok' } | null>(null)

  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [greetingName, setGreetingName] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

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

  // The greeting is a fixed beat, not a screen the user lingers on - it
  // always resolves into the dashboard on its own once the animation reads.
  useEffect(() => {
    if (step !== 'greeting') return
    const t = setTimeout(() => navigate('/console'), 2600)
    return () => clearTimeout(t)
  }, [step, navigate])

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
    setAuthBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
    if (error) { setMsg({ text: error.message, type: 'error' }); setAuthBusy(false); return }

    const { data: profile } = await supabase.from('profiles').select('username').eq('id', data.user.id).single()
    setGreetingName(profile?.username || loginEmail.split('@')[0])
    await openFaceStep('verify', data.user.id)
    setAuthBusy(false)
  }

  async function handleSignup() {
    setMsg(null)
    if (!signupUsername || signupUsername.trim().length < 3) {
      setMsg({ text: 'Choose a username of at least 3 characters.', type: 'error' }); return
    }
    if (!signupEmail) { setMsg({ text: 'Enter a valid email.', type: 'error' }); return }
    const missing = passwordIssues(signupPassword)
    if (missing.length > 0) {
      setMsg({ text: `Password needs ${missing.join(', ')}.`, type: 'error' }); return
    }
    setAuthBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: { data: { username: signupUsername.trim() } },
    })
    if (error) { setMsg({ text: error.message, type: 'error' }); setAuthBusy(false); return }
    if (!data.user) { setMsg({ text: 'Check your inbox to confirm your email, then sign in.', type: 'info' }); setAuthBusy(false); return }

    const { error: profErr } = await supabase.from('profiles').insert({ id: data.user.id, email: signupEmail, username: signupUsername.trim() })
    if (profErr && profErr.code !== '23505') {
      setMsg({ text: `Account created, but profile setup failed: ${profErr.message}`, type: 'error' }); setAuthBusy(false); return
    }
    setGreetingName(signupUsername.trim())
    await openFaceStep('enroll', data.user.id)
    setAuthBusy(false)
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
      setTimeout(() => setStep('greeting'), 700)
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
        setTimeout(() => setStep('greeting'), 700)
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      className="relative min-h-screen overflow-hidden text-white"
      style={{ background: 'linear-gradient(165deg,#16302F,#2B5D5E 55%,#3E7A7B)' }}>

      {/* One continuous canvas for the whole page - the wireframe, scan
          line and vignette all run underneath everything, so the brand
          copy and the auth card read as one composition instead of two
          different pages stitched together. The card stays legible simply
          because it's an opaque surface, not because it needs its own
          separately-colored region. */}
      <Suspense fallback={null}><Background3D variant="login" contained /></Suspense>
      <motion.div aria-hidden className="absolute left-0 right-0 h-[2px] pointer-events-none z-[5]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(217,199,154,0.85), rgba(217,199,154,0.5), transparent)', boxShadow: '0 0 22px 5px rgba(217,199,154,0.35)' }}
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'linear' }} />
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 15% 15%, rgba(255,255,255,0.10), transparent 55%)' }} />

      <div className="relative z-10 min-h-screen flex flex-col">
        <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.15, ease: EASE_OUT }}
          className="flex items-center gap-4 px-8 sm:px-12 lg:px-20 pt-10">
          <div className="w-11 h-11 rounded-[10px] flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)' }}>
            <Microscope size={21} />
          </div>
          <div>
            <div className="font-bold text-[19px]">Risk Autopsy</div>
            <div className="text-[12px] text-white/55 tracking-wide">REVIEWER ACCOUNT</div>
          </div>
        </motion.div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[1320px] mx-auto px-8 sm:px-12 lg:px-20 flex flex-col lg:flex-row items-center gap-16 lg:gap-24 py-12">

            {/* Editorial half - hidden below lg purely to keep the mobile
                page from getting too tall before reaching the form, not
                because it belongs to a different surface. */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5, ease: EASE_OUT }}
              className="hidden lg:block flex-1 max-w-[500px]">
              <h2 className="text-[46px] leading-[1.14] font-bold mb-6" style={{ fontFamily: "'Fraunces', serif" }}>
                Every loss becomes a defense.
              </h2>
              <p className="text-[17px] text-white/80 leading-relaxed mb-12">
                Each chargeback here becomes a reviewed, auditable policy change — never auto-deployed, always signed off by a verified human.
              </p>
              <div className="flex flex-col gap-7">
                {[
                  { icon: ShieldCheck, label: 'Server-verified session', sub: 'Re-checked against Supabase on every approval' },
                  { icon: ScanFace, label: 'Biometric enrollment', sub: 'Face-ID keyed to your account, not a password alone' },
                  { icon: FileCheck, label: 'Full audit trail', sub: 'Every approval is signed, timestamped, and reviewable' },
                ].map((item, i) => (
                  <motion.div key={item.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5 + i * 0.1, duration: 0.4, ease: EASE_OUT }}
                    className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-[12px] flex items-center justify-center flex-none"
                      style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)' }}>
                      <item.icon size={21} />
                    </div>
                    <div>
                      <div className="text-[16px] font-semibold">{item.label}</div>
                      <div className="text-[13px] text-white/65">{item.sub}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Auth card - the one opaque surface on the page, floating
                directly on the shared canvas rather than sitting in its
                own separately-colored zone. Needs a real shadow here (not
                the app's default subtle .glass-card one, tuned for sitting
                on a near-identical light paper background) - against this
                dark, busy scene the card must visibly lift off it. */}
            <div className="w-full lg:w-auto flex-none flex justify-center"
              style={{ filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.45)) drop-shadow(0 8px 20px rgba(0,0,0,0.3))' }}>
              <div className="glass-card w-full max-w-[460px] p-11 sm:p-12" style={{ color: '#151912' }}>
                <AnimatePresence mode="wait">
            {step === 'login' && (
              <motion.div key="login" {...cardMotion} className="w-full">
                <h1 className="text-[30px] font-bold mb-2">Welcome back</h1>
                <p className="text-[15px] text-neutral-500 mb-8">Sign in with your face to open the risk console.</p>
                {msg && <div className={`text-[14px] px-3.5 py-3 rounded-[10px] mb-5 ${msgClass}`}>{msg.text}</div>}
                <Field label="Email" index={0}><input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                  placeholder="you@razorpay.com" className="input" style={{ padding: '14px 16px', fontSize: '15px' }} /></Field>
                <Field label="Password" index={1}><input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••" className="input" style={{ padding: '14px 16px', fontSize: '15px' }} /></Field>
                <motion.button whileHover={{ scale: 1.012 }} whileTap={{ scale: 0.98 }}
                  onClick={handleLogin} disabled={authBusy} className="gold-btn w-full py-3.5 text-[15px] rounded-xl mt-2 flex items-center justify-center gap-2">
                  {authBusy && <Loader2 size={16} className="animate-spin" />} {authBusy ? 'Signing in…' : 'Continue'}
                </motion.button>
                <div className="text-center mt-5 text-[14px] text-neutral-500">
                  New here? <a onClick={() => { setStep('signup'); setMsg(null) }} className="text-[#2B5D5E] font-semibold cursor-pointer">Create an account</a>
                </div>
              </motion.div>
            )}

            {step === 'signup' && (
              <motion.div key="signup" {...cardMotion} className="w-full">
                <h1 className="text-[30px] font-bold mb-2">Create your account</h1>
                <p className="text-[15px] text-neutral-500 mb-8">You'll enroll your face next, for secure biometric login.</p>
                {msg && <div className={`text-[14px] px-3.5 py-3 rounded-[10px] mb-5 ${msgClass}`}>{msg.text}</div>}
                <Field label="Username" index={0}><input type="text" value={signupUsername} onChange={e => setSignupUsername(e.target.value)}
                  placeholder="e.g. affan" className="input" style={{ padding: '14px 16px', fontSize: '15px' }} /></Field>
                <Field label="Email" index={1}><input type="email" value={signupEmail} onChange={e => setSignupEmail(e.target.value)}
                  placeholder="you@razorpay.com" className="input" style={{ padding: '14px 16px', fontSize: '15px' }} /></Field>
                <Field label="Password" index={2}>
                  <input type="password" value={signupPassword} onChange={e => setSignupPassword(e.target.value)}
                    placeholder="At least 8 chars, mixed case, number, symbol" className="input" style={{ padding: '14px 16px', fontSize: '15px' }} />
                  <PasswordStrengthMeter password={signupPassword} />
                </Field>
                <motion.button whileHover={{ scale: 1.012 }} whileTap={{ scale: 0.98 }}
                  onClick={handleSignup} disabled={authBusy} className="gold-btn w-full py-3.5 text-[15px] rounded-xl mt-2 flex items-center justify-center gap-2">
                  {authBusy && <Loader2 size={16} className="animate-spin" />} {authBusy ? 'Creating account…' : 'Create account'}
                </motion.button>
                <div className="text-center mt-5 text-[14px] text-neutral-500">
                  Already have an account? <a onClick={() => { setStep('login'); setMsg(null) }} className="text-[#2B5D5E] font-semibold cursor-pointer">Sign in</a>
                </div>
              </motion.div>
            )}

            {step === 'face' && (
              <motion.div key="face" {...cardMotion} className="w-full">
                <h1 className="text-[30px] font-bold mb-2">{faceMode === 'enroll' ? 'Enroll your face' : 'Verify your identity'}</h1>
                <p className="text-[15px] text-neutral-500 mb-8">
                  {faceMode === 'enroll' ? 'This becomes your biometric key for future logins.' : 'Confirming this is really you before granting access.'}
                </p>
                {msg && <div className={`text-[14px] px-3.5 py-3 rounded-[10px] mb-5 ${msgClass}`}>{msg.text}</div>}
                <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1, duration: 0.35, ease: EASE_OUT }}
                  className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden bg-black mb-4 border border-black/10">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover -scale-x-100" />
                  <div className={`absolute inset-0 rounded-2xl border-[3px] transition-colors duration-300 pointer-events-none ${ringClass}`} />
                </motion.div>
                <div className="text-center text-xs text-neutral-400 mb-2.5">{faceStep}</div>
                <motion.button whileHover={{ scale: 1.012 }} whileTap={{ scale: 0.98 }}
                  onClick={handleCapture} disabled={captureBusy || !modelsLoaded} className="gold-btn w-full py-3.5 text-[15px] rounded-xl mb-2.5">
                  Capture &amp; Verify
                </motion.button>
                <button onClick={cancelFace} className="w-full py-3 rounded-xl border border-black/10 font-semibold">Cancel</button>
              </motion.div>
            )}

            {step === 'greeting' && (
              <motion.div key="greeting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="w-full flex flex-col items-center text-center">
                <div className="relative w-[64px] h-[64px] mx-auto mb-5">
                  {[...Array(8)].map((_, i) => {
                    const angle = (i / 8) * Math.PI * 2
                    return (
                      <motion.span key={i}
                        className="absolute top-1/2 left-1/2 w-[6px] h-[6px] rounded-full"
                        style={{ background: i % 2 === 0 ? '#356B3F' : '#966A22' }}
                        initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
                        animate={{ opacity: [0, 1, 0], x: Math.cos(angle) * 46, y: Math.sin(angle) * 46, scale: 1 }}
                        transition={{ delay: 0.15, duration: 0.7, ease: EASE_OUT }} />
                    )
                  })}
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 15 }}
                    className="relative w-[64px] h-[64px] rounded-full flex items-center justify-center text-white"
                    style={{ background: 'linear-gradient(135deg,#3fae4a,#356B3F)', boxShadow: '0 14px 30px rgba(53,107,63,0.35)' }}>
                    <Check size={30} strokeWidth={3} />
                  </motion.div>
                </div>
                <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
                  className="text-[30px] font-bold mb-2">
                  Welcome{greetingName ? `, ${greetingName}` : ''}
                </motion.h1>
                <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                  className="text-[15px] text-neutral-500 mb-7">{successMsg}</motion.p>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
                  className="flex items-center gap-3">
                  <motion.div
                    animate={{ rotate: [0, 8, -8, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-white"
                    style={{ background: 'linear-gradient(135deg,#3E7A7B,#2B5D5E)', boxShadow: '0 4px 14px rgba(43,93,94,0.35)' }}>
                    <Microscope size={15} />
                  </motion.div>
                  <span className="font-bold text-[16px]">Risk Autopsy</span>
                </motion.div>
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
                  className="text-[11px] text-neutral-400 mt-6">Every loss becomes a defense.</motion.p>
              </motion.div>
            )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}
          className="text-center text-[11px] text-white/55 tracking-wide uppercase pb-8">
          Every loss becomes a defense. — Risk Autopsy, Track 2
        </motion.div>
      </div>
    </motion.div>
  )
}

function Field({ label, children, index = 0 }: { label: string; children: React.ReactNode; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.08 + index * 0.06, duration: 0.3, ease: EASE_OUT }}
      className="mb-5">
      <label className="text-[12px] font-semibold text-neutral-500 tracking-wide uppercase block mb-2">{label}</label>
      {children}
    </motion.div>
  )
}

function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null
  const score = passwordStrength(password)
  const missing = passwordIssues(password)
  const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Excellent']
  const colors = ['#A6392F', '#966A22', '#966A22', '#356B3F', '#356B3F']
  return (
    <div className="mt-2">
      <div className="flex gap-1 mb-1.5">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-1 flex-1 rounded-full transition-colors"
            style={{ background: i <= score ? colors[score] : '#E5E5E0' }} />
        ))}
      </div>
      <div className="text-[11px]" style={{ color: colors[score] }}>
        {labels[score]}{missing.length > 0 ? ` — needs ${missing.join(', ')}` : ''}
      </div>
    </div>
  )
}
