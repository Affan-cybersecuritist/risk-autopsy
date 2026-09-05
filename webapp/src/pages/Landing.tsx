import { lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Microscope, ArrowRight, Code2, AlertTriangle, GitBranch, Sparkles, Swords,
  ShieldCheck, Radar, UserCheck, Activity, RefreshCw, ShieldAlert,
} from 'lucide-react'
const Background3D = lazy(() => import('../components/Background3D'))

const EASE_OUT = [0.22, 1, 0.36, 1] as const
const GITHUB_URL = 'https://github.com/Affan-cybersecuritist/risk-autopsy'

// The real, already-verified narrative from README.md's "See it end-to-end"
// section - the exact numbers that ship in the codebase, not invented copy
// for a pitch page. Reused here so a first-time visitor gets the same
// honest story a judge reading the README would.
const PIPELINE = [
  { icon: AlertTriangle, title: 'A confirmed loss occurs', body: '₹47,58,059 in chargebacks over 90 days, across 180 customers, 45 detected abuse rings.' },
  { icon: Microscope, title: 'Risk Autopsy reconstructs the decision chain', body: 'Customer #3000: a low-value purchase, a wait, an escalated high-value purchase — and a shared address with 3 other accounts. A coordinated ring the existing threshold never flagged.' },
  { icon: GitBranch, title: 'Root cause', body: 'The existing control was amount > ₹25,000 — a static number with no memory of behavior. It misses everything that hides in the shape of the sequence instead of its size.' },
  { icon: Sparkles, title: 'New policy discovered', body: 'A decision tree over leakage-free behavioral features (escalation ratio, time-to-escalation, device/address sharing) — 90.6% precision, 100% recall, vs. the baseline’s 32.9%/58.3%.' },
  { icon: Swords, title: 'Adversarial test', body: 'The policy’s own feature importances are read back to find its blind spot, and an evasion is crafted specifically to exploit it. v1 misses 100% of that evasion.' },
  { icon: ShieldCheck, title: 'Hardened policy', body: 'Retrained against the evasion, then verified against the full population: 100% precision / 100% recall / 0 false positives, catching 40/40 adversarial attempts.' },
  { icon: Radar, title: 'Blast radius review', body: 'Before anyone approves this: 25 customers newly flagged, 57 newly cleared. Of those 82 flips, 5 are genuinely worth a human’s attention — the rest is the policy working as intended.' },
  { icon: UserCheck, title: 'Human approval', body: 'An identity-verified reviewer approves the specific version that was reviewed above — not a rubber stamp on an aggregate metric.' },
  { icon: Activity, title: 'Post-deployment monitoring', body: 'Months later, drift simulation exposes that the adversarial search itself had an untested region — a ring that strikes within a week evades the "converged" policy entirely.' },
  { icon: RefreshCw, title: 'Closed the loop', body: 'The exact gap the drift monitor found is fed back into the arms race, which re-converges — recall now holding at 100% across all 12 months. Registered as v3.' },
] as const

const ACTIONS = ['ALLOW', 'STEP_UP', 'DELAY', 'MANUAL_REVIEW', 'BLOCK'] as const

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="relative">
      {/* Hero - same visual language as the login page (dark canvas, live
          wireframe, scan line) so the first thing a judge sees and the
          sign-in screen read as one product, not two different demos. */}
      <div className="relative min-h-screen overflow-hidden text-white flex flex-col"
        style={{ background: 'linear-gradient(165deg,#16302F,#2B5D5E 55%,#3E7A7B)' }}>
        <Suspense fallback={null}><Background3D variant="login" contained /></Suspense>
        <motion.div aria-hidden className="absolute left-0 right-0 h-[2px] pointer-events-none z-[5]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(217,199,154,0.85), rgba(217,199,154,0.5), transparent)', boxShadow: '0 0 22px 5px rgba(217,199,154,0.35)' }}
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'linear' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 15% 15%, rgba(255,255,255,0.10), transparent 55%)' }} />

        <div className="relative z-10 flex items-center justify-between px-8 sm:px-12 lg:px-20 pt-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[10px] flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)' }}>
              <Microscope size={19} />
            </div>
            <div className="font-bold text-[18px]">Risk Autopsy</div>
          </div>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"
            className="flex items-center gap-2 text-[13px] font-semibold text-white/80 hover:text-white transition-colors">
            <Code2 size={16} /> Source
          </a>
        </div>

        <div className="relative z-10 flex-1 flex items-center">
          <div className="w-full max-w-[900px] mx-auto px-8 sm:px-12 lg:px-20 py-16 text-center">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}
              className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wide uppercase px-3 py-1.5 rounded-full mb-7"
              style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}>
              Razorpay AI Buildathon · Track 2: AI Risk Manager
            </motion.div>

            <motion.h1 initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.55, ease: EASE_OUT }}
              className="text-[44px] sm:text-[58px] leading-[1.08] font-bold mb-6" style={{ fontFamily: "'Fraunces', serif" }}>
              Every loss becomes a defense.
            </motion.h1>

            <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.5, ease: EASE_OUT }}
              className="text-[17px] sm:text-[19px] text-white/80 leading-relaxed mb-10 max-w-[720px] mx-auto">
              A fraud model tells you "is this transaction fraud?" Risk Autopsy answers a different question:
              {' '}<span className="font-semibold text-white">"prove this new policy is safer and cheaper than the one running today — before it deploys."</span>
              {' '}An Autonomous Risk Policy Engineer runs the full loss → autopsy → discover → attack → harden pipeline on its own, stopping only at human approval.
            </motion.p>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, duration: 0.5, ease: EASE_OUT }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/console')}
                className="gold-btn px-7 py-3.5 rounded-xl text-[15px] flex items-center gap-2">
                Open the risk console <ArrowRight size={16} />
              </motion.button>
              <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="px-7 py-3.5 rounded-xl text-[15px] font-semibold flex items-center gap-2"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)' }}>
                  <Code2 size={16} /> View source
                </motion.div>
              </a>
            </motion.div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 0.5 }}
              className="flex flex-wrap items-center justify-center gap-3 text-[12px] text-white/60">
              {['Tests passing', 'Python 3.12', 'React + TypeScript', 'Synthetic data'].map(badge => (
                <span key={badge} className="px-3 py-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)' }}>
                  {badge}
                </span>
              ))}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Pipeline - the exact "See it end-to-end" case study from the
          README, one real case using the project's actual data. */}
      <div className="relative py-24 px-6" style={{ background: '#F1F2EC' }}>
        <div className="max-w-[720px] mx-auto text-center mb-16">
          <div className="text-[12px] font-semibold tracking-wide uppercase mb-3" style={{ color: '#2B5D5E' }}>See it end-to-end</div>
          <h2 className="text-[32px] sm:text-[38px] font-bold mb-4" style={{ fontFamily: "'Fraunces', serif" }}>
            One real case, all the way through
          </h2>
          <p className="text-[15px] text-neutral-500 leading-relaxed">
            Using this project's actual data — nothing below is invented for the pitch.
          </p>
        </div>

        <div className="max-w-[760px] mx-auto">
          {PIPELINE.map((stage, i) => (
            <motion.div key={stage.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, ease: EASE_OUT }}
              className="relative flex gap-5 pb-10 last:pb-0">
              {i < PIPELINE.length - 1 && (
                <div className="absolute left-[23px] top-[52px] bottom-0 w-px" style={{ background: '#D7D9CD' }} />
              )}
              <div className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-none text-white"
                style={{ background: 'linear-gradient(135deg,#3E7A7B,#2B5D5E)', boxShadow: '0 6px 16px rgba(43,93,94,0.3)' }}>
                <stage.icon size={20} />
              </div>
              <div className="glass-card flex-1 p-6">
                <div className="text-[11px] font-bold tracking-wide uppercase mb-1.5" style={{ color: '#966A22' }}>Step {i + 1}</div>
                <h3 className="text-[18px] font-bold mb-2">{stage.title}</h3>
                <p className="text-[14px] text-neutral-500 leading-relaxed">{stage.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Defense-only guardrail - the structural claim from README section 3,
          not a slogan: every action is one of five, and deployment is
          impossible without a server-verified human approval. */}
      <div className="relative py-24 px-6" style={{ background: '#151912' }}>
        <div className="max-w-[820px] mx-auto text-center text-white">
          <div className="flex items-center justify-center gap-2 mb-6">
            <ShieldAlert size={20} className="text-[#D9C79A]" />
            <div className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: '#D9C79A' }}>Defense-only, by design</div>
          </div>
          <h2 className="text-[28px] sm:text-[34px] font-bold mb-8" style={{ fontFamily: "'Fraunces', serif" }}>
            Every action is one of five. No exceptions.
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
            {ACTIONS.map(action => (
              <span key={action} className="px-4 py-2 rounded-lg text-[13px] font-bold tracking-wide font-mono"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.15)' }}>
                {action}
              </span>
            ))}
          </div>
          <p className="text-[15px] text-white/60 leading-relaxed max-w-[640px] mx-auto">
            No autonomous fund movement, no punitive customer action without a human approval gate.
            The LLM proposes. ML and statistics verify. Deployment is impossible without a reviewer whose identity is
            independently re-checked server-side — not just trusted because the frontend said so.
          </p>
        </div>
      </div>

      {/* Closing CTA */}
      <div className="relative py-20 px-6 text-center" style={{ background: '#F1F2EC' }}>
        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={() => navigate('/console')}
          className="gold-btn px-8 py-4 rounded-xl text-[16px] inline-flex items-center gap-2">
          Open the risk console <ArrowRight size={17} />
        </motion.button>
        <div className="text-[12px] text-neutral-400 mt-6">Every loss becomes a defense. — Risk Autopsy, Track 2</div>
      </div>
    </div>
  )
}
