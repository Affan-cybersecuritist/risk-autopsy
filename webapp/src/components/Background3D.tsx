import { useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

function Wireframe({ position, size, color, opacity, speed }: {
  position: [number, number, number]; size: number; color: string; opacity: number; speed: [number, number]
}) {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    if (!ref.current) return
    ref.current.rotation.x += speed[0]
    ref.current.rotation.y += speed[1]
  })
  return (
    <mesh ref={ref} position={position}>
      <icosahedronGeometry args={[size, 1]} />
      <meshBasicMaterial color={color} wireframe transparent opacity={opacity} />
    </mesh>
  )
}

function Particles({ count = 200, opacity = 0.32, color = '#2B5D5E' }: { count?: number; opacity?: number; color?: string }) {
  const ref = useRef<THREE.Points>(null)
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 22
    positions[i * 3 + 1] = (Math.random() - 0.5) * 16
    positions[i * 3 + 2] = (Math.random() - 0.5) * 8 - 2
  }
  useFrame(() => { if (ref.current) ref.current.rotation.y += 0.0004 })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.035} transparent opacity={opacity} />
    </points>
  )
}

// Group that drifts slightly toward the cursor - a barely-there parallax so
// the scene feels alive/responsive rather than a static looping render.
// Kept to the login variant only: the dashboard's background should stay
// out of the way of real content, not react to every mouse move over it.
function ParallaxGroup({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const pointer = useThree((s) => s.pointer)
  useFrame(() => {
    if (!ref.current) return
    ref.current.position.x += (pointer.x * 0.6 - ref.current.position.x) * 0.02
    ref.current.position.y += (pointer.y * 0.4 - ref.current.position.y) * 0.02
  })
  return <group ref={ref}>{children}</group>
}

// `contained`: renders as absolute-fill instead of viewport-fixed, for use
// inside a positioned panel (e.g. the login page's brand rail) rather than
// as a full-page backdrop. `variant="login"` on a dark host surface swaps
// the wireframe/particle colors from teal-on-paper to a lighter mint-on-ink
// palette so it actually reads against a dark background instead of
// vanishing into it.
export default function Background3D({ variant = 'default', contained = false }: {
  variant?: 'default' | 'login'; contained?: boolean
}) {
  const isLogin = variant === 'login'
  const lineColor = isLogin ? '#8FC7C4' : '#2B5D5E'
  const lineColor2 = isLogin ? '#D9C79A' : '#3E7A7B'
  const scene = (
    <>
      <Wireframe position={[3.5, 1.5, -2]} size={3.4} color={lineColor} opacity={isLogin ? 0.28 : 0.15} speed={[0.0009, 0.0013]} />
      <Wireframe position={[-4, -2, -3]} size={2.3} color={lineColor2} opacity={isLogin ? 0.2 : 0.11} speed={[-0.0007, -0.0010]} />
      {isLogin && (
        <Wireframe position={[0.5, 3.2, -5]} size={1.5} color="#ffffff" opacity={0.14} speed={[0.0012, -0.0008]} />
      )}
      <Particles count={isLogin ? 260 : 200} opacity={isLogin ? 0.5 : 0.32} color={isLogin ? '#C9E4E2' : '#2B5D5E'} />
    </>
  )
  return (
    <div className={contained ? 'absolute inset-0' : 'fixed inset-0 -z-10'}>
      <Canvas camera={{ position: [0, 0, 9], fov: 50 }} gl={{ alpha: true, antialias: true }}>
        {isLogin ? <ParallaxGroup>{scene}</ParallaxGroup> : scene}
      </Canvas>
      {!contained && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.88) 55%, rgba(255,255,255,0.97) 100%)',
          }}
        />
      )}
    </div>
  )
}
