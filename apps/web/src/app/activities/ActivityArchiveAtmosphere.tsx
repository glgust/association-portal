'use client'

import { useEffect, useRef } from 'react'

function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Star {
  a: number
  ph: number
  r: number
  tw: number
  x: number
  y: number
}

export function ActivityArchiveAtmosphere({
  ghostText = 'UTC+8',
  veilText = 'PROGRAM',
}: {
  ghostText?: string
  veilText?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ghostWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // 1. Enter choreography
    document.body.classList.add('enter')

    // 2. Scroll fade for ghost wrap
    const ghostWrap = ghostWrapRef.current
    const handleScroll = () => {
      if (!ghostWrap) return
      const k = Math.max(0, 1 - window.scrollY / 520)
      ghostWrap.style.opacity = (0.15 + 0.85 * k).toFixed(3)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()

    // 3. Starfield canvas
    const canvas = canvasRef.current
    if (!canvas) {
      return () => {
        window.removeEventListener('scroll', handleScroll)
      }
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return () => {
        window.removeEventListener('scroll', handleScroll)
      }
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const isReduced = mediaQuery.matches

    let animationFrameId: number | null = null
    let stars: Star[] = []
    let width = 0
    let height = 0
    const random = mulberry32(20260902)

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      stars = []
      const count = Math.round((width * height) / 9000)
      for (let i = 0; i < count; i++) {
        stars.push({
          a: 0.06 + random() * 0.3,
          ph: random() * Math.PI * 2,
          r: 0.2 + Math.pow(random(), 2.4) * 0.9,
          tw: random() < 0.08 ? 0.4 + random() : 0,
          x: random() * width,
          y: random() * height,
        })
      }

      if (isReduced) {
        draw(0)
      }
    }

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height)
      for (const s of stars) {
        let a = s.a
        if (s.tw && !isReduced) {
          a *= 0.6 + 0.4 * Math.sin(time * 0.001 * s.tw + s.ph)
        }
        context.globalAlpha = a
        context.fillStyle = '#dfe6f2'
        context.beginPath()
        context.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1

      if (!isReduced && document.visibilityState === 'visible') {
        animationFrameId = requestAnimationFrame(draw)
      }
    }

    resize()
    window.addEventListener('resize', resize)

    const handleVisibilityChange = () => {
      if (isReduced) return
      if (document.visibilityState === 'visible') {
        if (!animationFrameId) {
          animationFrameId = requestAnimationFrame(draw)
        }
      } else {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    if (!isReduced) {
      animationFrameId = requestAnimationFrame(draw)
    }

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [])

  return (
    <>
      <canvas aria-hidden="true" id="starfield" ref={canvasRef} />
      <div
        aria-hidden="true"
        className="ghost-wrap"
        id="ghostWrap"
        ref={ghostWrapRef}
      >
        <div className="ghost-num" id="ghostNum">
          {ghostText}
        </div>
      </div>
      <div aria-hidden="true" className="ghost-word">
        PROGRAM
      </div>
      <div aria-hidden="true" className="veil" id="veil">
        <div className="veil-inner">
          <p className="veil-cap">PORTAL · ACTIVITY PROGRAM</p>
          <p className="veil-no" id="veilNo">
            {veilText}
          </p>
          <div className="veil-rule" />
        </div>
      </div>
    </>
  )
}
