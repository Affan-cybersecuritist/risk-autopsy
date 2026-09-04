import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

export default function GlassCard({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, ease: [0.16, 0.8, 0.24, 1] }}
      className={`glass-card p-6 md:p-8 mb-8 ${className}`}
    >
      {children}
    </motion.div>
  )
}
