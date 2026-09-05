import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Microscope } from 'lucide-react'

const EASE_OUT = [0.22, 1, 0.36, 1] as const
const BOOT_MS = 1000

// One-time splash for a fresh page load (refresh / first visit) - wraps the
// whole app so it fires exactly once per mount, not on every client-side
// route change. Handshakes with whatever mounts underneath via a matching
// entrance animation, so the splash's exit and the app's entrance read as
// one continuous move rather than two unrelated fades.
export default function AppBoot({ children }: { children: React.ReactNode }) {
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), BOOT_MS)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      {/* Rendered as a sibling, never a wrapper - the app underneath (and
          the splash itself) relies heavily on position:fixed (sidebar,
          login header, this overlay), and animating scale/filter on an
          ancestor of a fixed element breaks it (the transform creates a new
          containing block, so "fixed" starts resolving against that
          shrink-wrapped ancestor instead of the viewport). Scale/blur are
          safe on the splash's OWN root since it has no fixed descendants;
          the app's entrance below only ever animates opacity for the same
          reason. */}
      <AnimatePresence>
        {!booted && <Splash key="splash" />}
      </AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: booted ? 1 : 0 }} transition={{ duration: 0.5, ease: EASE_OUT }}>
        {children}
      </motion.div>
    </>
  )
}

function Splash() {
  return (
    <motion.div
      exit={{ opacity: 0, scale: 1.06, filter: 'blur(10px)' }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      className="fixed inset-0 flex flex-col items-center justify-center gap-6 z-[100]" style={{ background: '#F1F2EC' }}>
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        className="relative w-16 h-16 rounded-[14px] flex items-center justify-center text-white"
        style={{ background: 'linear-gradient(135deg,#3E7A7B,#2B5D5E)', boxShadow: '0 10px 26px rgba(43,93,94,0.4)' }}
      >
        <Microscope size={28} />
        <motion.div
          className="absolute -inset-2.5 rounded-[18px] border-2"
          style={{ borderColor: '#2B5D5E' }}
          animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.18, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }}
        className="text-center">
        <div className="font-bold text-[19px]" style={{ fontFamily: "'Fraunces', serif" }}>Risk Autopsy</div>
        <div className="text-[11px] text-neutral-400 tracking-wide mt-0.5">EVERY LOSS BECOMES A DEFENSE</div>
      </motion.div>

      <div className="w-[160px] h-[3px] rounded-full overflow-hidden" style={{ background: '#D7D9CD' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg,#3E7A7B,#2B5D5E)' }}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: BOOT_MS / 1000, ease: EASE_OUT }}
        />
      </div>
    </motion.div>
  )
}
