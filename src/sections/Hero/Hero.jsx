import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { useLang } from '../../context/LangContext'
import './Hero.css'

function createSoftPointTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64

  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.22, 'rgba(255, 255, 255, 0.85)')
  gradient.addColorStop(0.55, 'rgba(210, 225, 255, 0.22)')
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function useTyping(words, lang, speed = 80, pause = 1800) {
  const [text, setText] = useState('')
  const [wordIdx, setWordIdx] = useState(0)
  const [charIdx, setCharIdx] = useState(0)
  const [deleting, setDeleting] = useState(false)

  // Reset when language changes
  useEffect(() => {
    setText('')
    setWordIdx(0)
    setCharIdx(0)
    setDeleting(false)
  }, [lang])

  useEffect(() => {
    const current = words[wordIdx] ?? ''
    let timeout

    if (!deleting && charIdx < current.length) {
      timeout = setTimeout(() => setCharIdx((c) => c + 1), speed)
    } else if (!deleting && charIdx === current.length) {
      timeout = setTimeout(() => setDeleting(true), pause)
    } else if (deleting && charIdx > 0) {
      timeout = setTimeout(() => setCharIdx((c) => c - 1), speed / 2)
    } else if (deleting && charIdx === 0) {
      setDeleting(false)
      setWordIdx((w) => (w + 1) % words.length)
    }

    setText(current.slice(0, charIdx))
    return () => clearTimeout(timeout)
  }, [charIdx, deleting, wordIdx, words, speed, pause])

  return text
}

function ParticleScene({ containerRef }) {
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const W = container.clientWidth
    const H = container.clientHeight
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000)
    camera.position.z = 80

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    const COUNT = 1800
    const positions = new Float32Array(COUNT * 3)
    const colors = new Float32Array(COUNT * 3)

    for (let i = 0; i < COUNT; i++) {
      const r = 64 + Math.random() * 38
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)

      positions[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i * 3 + 2] = r * Math.cos(phi)

      const brightness = 0.55 + Math.random() * 0.45
      colors[i * 3 + 0] = brightness * 0.92
      colors[i * 3 + 1] = brightness * 0.96
      colors[i * 3 + 2] = brightness
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const pointTexture = createSoftPointTexture()
    const mat = new THREE.PointsMaterial({
      size: 1.25,
      map: pointTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      alphaTest: 0.02,
    })

    const particles = new THREE.Points(geo, mat)
    scene.add(particles)

    const mouse = { x: 0, y: 0 }
    const onMouse = (e) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 0.4
      mouse.y = -(e.clientY / window.innerHeight - 0.5) * 0.4
    }
    window.addEventListener('mousemove', onMouse)

    let animId
    const clock = new THREE.Clock()
    const animate = () => {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      particles.rotation.y = t * 0.04 + mouse.x * 0.5
      particles.rotation.x = t * 0.02 + mouse.y * 0.5
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      const W2 = container.clientWidth
      const H2 = container.clientHeight
      camera.aspect = W2 / H2
      camera.updateProjectionMatrix()
      renderer.setSize(W2, H2)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('mousemove', onMouse)
      window.removeEventListener('resize', onResize)
      cancelAnimationFrame(animId)
      geo.dispose()
      mat.dispose()
      pointTexture.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [containerRef])

  return null
}

export default function Hero() {
  const canvasRef = useRef(null)
  const { lang, t } = useLang()
  const typedText = useTyping(t.hero.roles, lang)

  const handleScroll = () => {
    document.querySelector('#about')?.scrollIntoView({ behavior: 'smooth' })
  }

  const descLines = t.hero.desc.split('\n')

  return (
    <section className="hero" id="home">
      <div className="hero-canvas" ref={canvasRef}>
        <ParticleScene containerRef={canvasRef} />
      </div>

      <div className="hero-overlay" />

      <div className="hero-content container">
        <div className="hero-tag fade-up">
          <span className="hero-tag-dot" />
          {t.hero.tag}
        </div>

        <h1 className="hero-title fade-up delay-1">
          Hi, I'm <span className="hero-name">Evan</span>
        </h1>

        <div className="hero-role fade-up delay-2" aria-live="polite" aria-atomic="true">
          <span className="role-text">{typedText}</span>
          <span className="role-cursor" aria-hidden="true">|</span>
        </div>

        <p className="hero-desc fade-up delay-3">
          {descLines[0]}<br />
          {descLines[1]}
        </p>

        <div className="hero-actions fade-up delay-4">
          <a
            href="#projects"
            className="btn btn-primary"
            onClick={(e) => { e.preventDefault(); document.querySelector('#projects')?.scrollIntoView({ behavior: 'smooth' }) }}
          >
            {t.hero.viewProjects}
          </a>
          <a
            href="#contact"
            className="btn btn-outline"
            onClick={(e) => { e.preventDefault(); document.querySelector('#contact')?.scrollIntoView({ behavior: 'smooth' }) }}
          >
            {t.hero.getInTouch}
          </a>
        </div>

        <div className="hero-socials fade-up delay-5">
          <a href="https://github.com/Evvvaaaaan" target="_blank" rel="noreferrer" className="social-link" aria-label="GitHub">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
            </svg>
          </a>
          <a href="https://www.linkedin.com/in/evvvaaaaan/" target="_blank" rel="noreferrer" className="social-link" aria-label="LinkedIn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        </div>
      </div>

      <button className="scroll-indicator" onClick={handleScroll} aria-label="Scroll to about section">
        <span className="scroll-line" />
      </button>
    </section>
  )
}
