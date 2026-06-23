import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef, useMemo, useState, useEffect } from 'react'
import * as THREE from 'three'
import '../shared/exp.css'

const THEMES = [
  { id: 'dots',   label: '파란 점', hint: '마우스를 가까이 가져가보세요' },
  { id: 'leaves', label: '단풍잎',  hint: '마우스를 가까이 가져가보세요' },
  { id: 'snow',   label: '눈',      hint: '스페이스바로 일시정지' },
]

const BG = {
  dots:   '#0a0a0f',
  leaves: '#0e0802',
  snow:   '#060d1a',
}

function makeLeafTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.font = '200px serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('🍁', 128, 132)
  return new THREE.CanvasTexture(c)
}

function makeSnowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 62)
  g.addColorStop(0,    'rgba(240, 252, 255, 1)')
  g.addColorStop(0.38, 'rgba(210, 238, 255, 0.88)')
  g.addColorStop(0.72, 'rgba(180, 222, 255, 0.38)')
  g.addColorStop(1,    'rgba(160, 210, 255, 0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  return new THREE.CanvasTexture(c)
}

// ─── Blue Dots ────────────────────────────────────────────────────────────────

const DOT_COUNT = 6000

function DotsParticles() {
  const geomRef = useRef()
  const { viewport } = useThree()

  const { pos, orig } = useMemo(() => {
    const pos  = new Float32Array(DOT_COUNT * 3)
    const orig = new Float32Array(DOT_COUNT * 3)
    for (let i = 0; i < DOT_COUNT; i++) {
      const x = (Math.random() - 0.5) * viewport.width  * 1.6
      const y = (Math.random() - 0.5) * viewport.height * 1.6
      pos[i*3] = orig[i*3] = x
      pos[i*3+1] = orig[i*3+1] = y
    }
    return { pos, orig }
  }, [viewport.width, viewport.height])

  useFrame(({ pointer, viewport: vp }) => {
    if (!geomRef.current) return
    const arr = geomRef.current.attributes.position.array
    const mx  = pointer.x * vp.width  / 2
    const my  = pointer.y * vp.height / 2
    const R2  = 3.5 * 3.5

    for (let i = 0; i < DOT_COUNT; i++) {
      const ix = i * 3
      const dx = arr[ix]   - mx
      const dy = arr[ix+1] - my
      const d2 = dx*dx + dy*dy
      if (d2 < R2 && d2 > 0.0001) {
        const inv = 1 / Math.sqrt(d2)
        const f   = (R2 - d2) / R2 * 0.08
        arr[ix]   += dx * inv * f
        arr[ix+1] += dy * inv * f
      }
      arr[ix]   += (orig[ix]   - arr[ix])   * 0.03
      arr[ix+1] += (orig[ix+1] - arr[ix+1]) * 0.03
    }
    geomRef.current.attributes.position.needsUpdate = true
  })

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.022} color="#4f9cf9" transparent opacity={0.8} sizeAttenuation />
    </points>
  )
}

// ─── Leaves (dots mechanic + leaf texture) ───────────────────────────────────

const LEAF_COUNT = 3000

function LeavesParticles() {
  const geomRef = useRef()
  const { viewport } = useThree()
  const tex = useMemo(() => makeLeafTexture(), [])

  const { pos, orig } = useMemo(() => {
    const pos  = new Float32Array(LEAF_COUNT * 3)
    const orig = new Float32Array(LEAF_COUNT * 3)
    for (let i = 0; i < LEAF_COUNT; i++) {
      const x = (Math.random() - 0.5) * viewport.width  * 1.6
      const y = (Math.random() - 0.5) * viewport.height * 1.6
      pos[i*3] = orig[i*3] = x
      pos[i*3+1] = orig[i*3+1] = y
    }
    return { pos, orig }
  }, [viewport.width, viewport.height])

  useFrame(({ pointer, viewport: vp }) => {
    if (!geomRef.current) return
    const arr = geomRef.current.attributes.position.array
    const mx  = pointer.x * vp.width  / 2
    const my  = pointer.y * vp.height / 2
    const R2  = 3.5 * 3.5

    for (let i = 0; i < LEAF_COUNT; i++) {
      const ix = i * 3
      const dx = arr[ix]   - mx
      const dy = arr[ix+1] - my
      const d2 = dx*dx + dy*dy
      if (d2 < R2 && d2 > 0.0001) {
        const inv = 1 / Math.sqrt(d2)
        const f   = (R2 - d2) / R2 * 0.08
        arr[ix]   += dx * inv * f
        arr[ix+1] += dy * inv * f
      }
      arr[ix]   += (orig[ix]   - arr[ix])   * 0.03
      arr[ix+1] += (orig[ix+1] - arr[ix+1]) * 0.03
    }
    geomRef.current.attributes.position.needsUpdate = true
  })

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.55}
        map={tex}
        transparent
        opacity={0.88}
        sizeAttenuation
        alphaTest={0.04}
        depthWrite={false}
      />
    </points>
  )
}

// ─── Snow ─────────────────────────────────────────────────────────────────────

function SnowCloud({ count, size, opacity, color, speedMult, swayAmp, tex, pausedRef }) {
  const geomRef = useRef()
  const { viewport } = useThree()

  const { pos, vel, phase } = useMemo(() => {
    const pos   = new Float32Array(count * 3)
    const vel   = new Float32Array(count * 2)
    const phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i*3]   = (Math.random() - 0.5) * viewport.width  * 1.5
      pos[i*3+1] = (Math.random() - 0.5) * viewport.height * 1.5
      pos[i*3+2] = (Math.random() - 0.5) * 10
      vel[i*2]   = (Math.random() - 0.5) * 0.002
      vel[i*2+1] = -(0.001 + Math.random() * 0.003) * speedMult
      phase[i]   = Math.random() * Math.PI * 2
    }
    return { pos, vel, phase }
  }, [viewport.width, viewport.height, count, speedMult])

  useFrame(({ clock, viewport: vp }) => {
    if (pausedRef.current || !geomRef.current) return
    const arr   = geomRef.current.attributes.position.array
    const t     = clock.getElapsedTime()
    const halfW = vp.width  / 2
    const halfH = vp.height / 2

    for (let i = 0; i < count; i++) {
      const ix = i * 3
      const iv = i * 2

      vel[iv]   += Math.sin(t * 0.3 + phase[i]) * swayAmp
      vel[iv+1] -= 0.0009 * speedMult
      vel[iv]   *= 0.988
      vel[iv+1] *= 0.988

      arr[ix]   += vel[iv]
      arr[ix+1] += vel[iv+1]

      if (arr[ix+1] < -halfH * 1.35 || Math.abs(arr[ix]) > halfW * 1.75) {
        arr[ix]   = (Math.random() - 0.5) * vp.width  * 1.4
        arr[ix+1] = halfH * 1.2
        arr[ix+2] = (Math.random() - 0.5) * 10
        vel[iv]   = (Math.random() - 0.5) * 0.004
        vel[iv+1] = -(0.001 + Math.random() * 0.003) * speedMult
      }
    }
    geomRef.current.attributes.position.needsUpdate = true
  })

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={color}
        map={tex}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

function SnowParticles() {
  const tex       = useMemo(() => makeSnowTexture(), [])
  const pausedRef = useRef(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space') {
        e.preventDefault()
        pausedRef.current = !pausedRef.current
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <SnowCloud
        count={1600} size={0.055} opacity={0.38} color="#6aaeff"
        speedMult={0.4} swayAmp={0.0006} tex={tex} pausedRef={pausedRef}
      />
      <SnowCloud
        count={1100} size={0.13} opacity={0.65} color="#aad4ff"
        speedMult={0.72} swayAmp={0.0013} tex={tex} pausedRef={pausedRef}
      />
      <SnowCloud
        count={420} size={0.28} opacity={0.92} color="#dff0ff"
        speedMult={1.0} swayAmp={0.0022} tex={tex} pausedRef={pausedRef}
      />
    </>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function ParticleField() {
  const [theme, setTheme] = useState('dots')
  const current = THEMES.find(t => t.id === theme)

  return (
    <div className="exp-wrap" style={{ background: BG[theme] }}>
      <span className="exp-hint">{current.hint}</span>
      <div className="exp-controls">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`exp-btn${theme === t.id ? ' active' : ''}`}
            onClick={() => setTheme(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Canvas
        key={theme}
        camera={{ fov: 60 }}
        style={{ background: 'transparent' }}
      >
        {theme === 'dots'   && <DotsParticles />}
        {theme === 'leaves' && <LeavesParticles />}
        {theme === 'snow'   && <SnowParticles />}
      </Canvas>
    </div>
  )
}
