import { useEffect, useRef } from 'react'

interface Props {
  width?: number
  height?: number
  className?: string
}

interface Particle {
  baseX: number
  baseY: number
  x: number
  y: number
  vx: number
  vy: number
  ray: number
  stepIndex: number
  isCenter: boolean
}

/**
 * Interactive starburst particle canvas modeled after burst.purduehackers.com's starCanvas.
 * Particles radiate in an 8-spoke starburst that repels with elastic spring physics on mouse move.
 */
export function BurstArtCanvas({ width = 160, height = 44, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = width * dpr
    canvas.height = height * dpr
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const cx = (width * dpr) / 2
    const cy = (height * dpr) / 2
    const rays = 8
    const particlesPerRay = 9
    const spacing = Math.min(width, height) * 0.05 * dpr

    const particles: Particle[] = []

    // Center star core particle
    particles.push({
      baseX: cx,
      baseY: cy,
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      ray: 0,
      stepIndex: 0,
      isCenter: true,
    })

    // Radial ray points
    for (let r = 0; r < rays; r++) {
      const angle = (r * Math.PI * 2) / rays
      for (let s = 1; s <= particlesPerRay; s++) {
        const dist = s * spacing
        const bx = cx + Math.cos(angle) * dist
        const by = cy + Math.sin(angle) * dist
        particles.push({
          baseX: bx,
          baseY: by,
          x: bx,
          y: by,
          vx: 0,
          vy: 0,
          ray: r,
          stepIndex: s,
          isCenter: false,
        })
      }
    }

    let mouseX = -9999
    let mouseY = -9999
    let isHovering = false
    let animId: number
    let time = 0

    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      mouseX = (e.clientX - rect.left) * dpr
      mouseY = (e.clientY - rect.top) * dpr
      isHovering = true
    }

    function handleMouseLeave() {
      mouseX = -9999
      mouseY = -9999
      isHovering = false
    }

    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)

    const repelRadius = 42 * dpr
    const spring = 0.075
    const damping = 0.84

    function render() {
      time += 1
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        if (isHovering) {
          const dx = p.x - mouseX
          const dy = p.y - mouseY
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < repelRadius && dist > 0.001) {
            const force = (1 - dist / repelRadius) * 3.2 * dpr
            const angle = Math.atan2(dy, dx)
            p.vx += Math.cos(angle) * force
            p.vy += Math.sin(angle) * force
          }
        } else {
          // Subtle organic cosmic breathing oscillation when idle
          const wave = Math.sin(time * 0.04 + p.ray * 0.8 + p.stepIndex * 0.5) * (0.6 * dpr)
          p.vx += (p.baseX + (p.stepIndex % 2 === 0 ? wave : -wave) - p.x) * spring
          p.vy += (p.baseY + (p.stepIndex % 2 === 0 ? -wave : wave) - p.y) * spring
        }

        p.vx += (p.baseX - p.x) * spring
        p.vy += (p.baseY - p.y) * spring
        p.vx *= damping
        p.vy *= damping
        p.x += p.vx
        p.y += p.vy

        // Draw particle
        if (p.isCenter) {
          ctx!.fillStyle = '#e6002a' // Burst red
          const size = 5 * dpr
          ctx!.fillRect(p.x - size / 2, p.y - size / 2, size, size)
        } else {
          // Alternate white and subtle crimson
          const isRedAccent = p.stepIndex === 3 || p.stepIndex === 7
          ctx!.fillStyle = isRedAccent ? '#e6002a' : 'rgba(255, 255, 255, 0.85)'
          const size = Math.max(1.8 * dpr, (3.2 - p.stepIndex * 0.2) * dpr)
          ctx!.fillRect(p.x - size / 2, p.y - size / 2, size, size)
        }
      }

      animId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animId)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [width, height])

  return (
    <canvas
      ref={canvasRef}
      className={`burst-art-canvas ${className}`.trim()}
      title="Interactive Burst Star - hover to interact"
      aria-hidden="true"
    />
  )
}
