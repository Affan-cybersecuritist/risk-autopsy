import { useRef, type ReactNode } from 'react'
import { motion, useScroll, useTransform, useSpring } from 'framer-motion'

export default function GlassCard({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'], // 0 when card enters bottom of viewport, 1 when it exits top
  })

  // continuous, scroll-linked (not a one-shot animation): as the card moves
  // through the viewport, it tilts, recedes in Z, and fades near the edges.
  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [10, 0, -10])
  const translateZ = useTransform(scrollYProgress, [0, 0.5, 1], [-60, 0, -60])
  const opacity = useTransform(scrollYProgress, [0, 0.12, 0.5, 0.88, 1], [0.3, 1, 1, 1, 0.3])
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.965, 1, 0.965])

  const smoothRotateX = useSpring(rotateX, { stiffness: 120, damping: 24 })
  const smoothTranslateZ = useSpring(translateZ, { stiffness: 120, damping: 24 })
  const smoothScale = useSpring(scale, { stiffness: 120, damping: 24 })

  return (
    <motion.div
      ref={ref}
      id={id}
      style={{
        rotateX: smoothRotateX,
        z: smoothTranslateZ,
        scale: smoothScale,
        opacity,
        transformPerspective: 1400,
      }}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, ease: [0.16, 0.8, 0.24, 1] }}
      className={`glass-card p-6 md:p-8 mb-8 ${className}`}
    >
      {children}
    </motion.div>
  )
}
