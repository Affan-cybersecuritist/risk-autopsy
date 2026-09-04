import { useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
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

function Particles() {
  const ref = useRef<THREE.Points>(null)
  const count = 200
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
      <pointsMaterial color="#B8860B" size={0.035} transparent opacity={0.32} />
    </points>
  )
}

export default function Background3D() {
  return (
    <div className="fixed inset-0 -z-10">
      <Canvas camera={{ position: [0, 0, 9], fov: 50 }} gl={{ alpha: true, antialias: true }}>
        <Wireframe position={[3.5, 1.5, -2]} size={3.4} color="#B8860B" opacity={0.15} speed={[0.0009, 0.0013]} />
        <Wireframe position={[-4, -2, -3]} size={2.3} color="#D4AF37" opacity={0.11} speed={[-0.0007, -0.0010]} />
        <Particles />
      </Canvas>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.88) 55%, rgba(255,255,255,0.97) 100%)',
        }}
      />
    </div>
  )
}
