import { motion } from 'framer-motion'
import { Microscope } from 'lucide-react'

// Shown while RequireAuth is checking for a session, so the gate between
// "app just loaded" and "redirected to login / dashboard shown" is a
// branded beat instead of a blank white flash.
export default function LoadingScreen({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-5" style={{ background: '#F1F2EC' }}>
      <motion.div
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative w-14 h-14 rounded-[12px] flex items-center justify-center text-white"
        style={{ background: 'linear-gradient(135deg,#3E7A7B,#2B5D5E)', boxShadow: '0 8px 22px rgba(43,93,94,0.35)' }}
      >
        <Microscope size={24} />
        <motion.div
          className="absolute -inset-2 rounded-[16px] border-2"
          style={{ borderColor: '#2B5D5E' }}
          animate={{ opacity: [0.5, 0, 0.5], scale: [1, 1.15, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
      <div className="text-[13px] text-neutral-400 font-medium">{label}</div>
    </div>
  )
}
