import React, { useEffect, useRef, useCallback } from 'react'

interface Logo {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  opacity: number
  rotation: number
  rotSpeed: number
}

interface FloatingLogosProps {
  count?: number
  
  interactive?: boolean
  
  baseOpacity?: number
}

export const FloatingLogos: React.FC<FloatingLogosProps> = ({
  count = 12,
  interactive = true,
  baseOpacity = 0.07,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const logosRef = useRef<Logo[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const rafRef = useRef<number>(0)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const initialized = useRef(false)

  const initLogos = useCallback((w: number, h: number) => {
    const logos: Logo[] = []
    for (let i = 0; i < count; i++) {
      const size = 20 + Math.random() * 50
      logos.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size,
        opacity: baseOpacity * (0.7 + Math.random() * 0.3),
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.002,
      })
    }
    logosRef.current = logos
  }, [count, baseOpacity])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.src = '/uvt.svg'
    imgRef.current = img

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (!initialized.current) {
        initLogos(w, h)
        initialized.current = true
      }
    }

    const onMouse = (e: MouseEvent) => {
      if (!interactive) return
      const rect = canvas.getBoundingClientRect()
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const onLeave = () => {
      mouseRef.current = { x: -1000, y: -1000 }
    }

    resize()
    window.addEventListener('resize', resize)
    canvas.addEventListener('mousemove', onMouse)
    canvas.addEventListener('mouseleave', onLeave)

    const animate = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const w = parent.clientWidth
      const h = parent.clientHeight

      ctx.clearRect(0, 0, w, h)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const fleeRadius = 150
      const returnRadius = 350

      for (const logo of logosRef.current) {
        
        if (interactive) {
          const dx = logo.x - mx
          const dy = logo.y - my
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < fleeRadius && dist > 0) {
            const force = (fleeRadius - dist) / fleeRadius * 0.8
            logo.vx += (dx / dist) * force
            logo.vy += (dy / dist) * force
          } else if (dist > fleeRadius && dist < returnRadius) {
            
            const pull = 0.015 * (1 - (dist - fleeRadius) / (returnRadius - fleeRadius))
            logo.vx -= (dx / dist) * pull
            logo.vy -= (dy / dist) * pull
          }
        }

        logo.vx *= 0.993
        logo.vy *= 0.993

        const speed = Math.sqrt(logo.vx * logo.vx + logo.vy * logo.vy)
        if (speed < 0.1) {
          logo.vx += (Math.random() - 0.5) * 0.03
          logo.vy += (Math.random() - 0.5) * 0.03
        }

        const maxSpeed = 1.5
        if (speed > maxSpeed) {
          logo.vx = (logo.vx / speed) * maxSpeed
          logo.vy = (logo.vy / speed) * maxSpeed
        }

        logo.x += logo.vx
        logo.y += logo.vy
        logo.rotation += logo.rotSpeed

        const pad = logo.size
        if (logo.x < -pad) logo.x = w + pad
        if (logo.x > w + pad) logo.x = -pad
        if (logo.y < -pad) logo.y = h + pad
        if (logo.y > h + pad) logo.y = -pad

        if (imgRef.current?.complete) {
          ctx.save()
          ctx.globalAlpha = logo.opacity
          ctx.translate(logo.x, logo.y)
          ctx.rotate(logo.rotation)
          ctx.drawImage(imgRef.current, -logo.size / 2, -logo.size / 2, logo.size, logo.size * (244 / 300))
          ctx.restore()
        }
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    img.onload = () => {
      rafRef.current = requestAnimationFrame(animate)
    }
    
    if (img.complete) {
      rafRef.current = requestAnimationFrame(animate)
    }

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('mousemove', onMouse)
      canvas.removeEventListener('mouseleave', onLeave)
    }
  }, [count, interactive, baseOpacity, initLogos])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 0 }}
    />
  )
}
