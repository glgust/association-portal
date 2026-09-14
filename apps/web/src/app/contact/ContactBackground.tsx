'use client'

import { useEffect, useRef } from 'react'

interface Star {
  a: number
  ph: number
  r: number
  tw: number
  x: number
  y: number
}

function mulberry32(seed: number) {
  let s = seed | 0
  return function () {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function ContactBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ghostWrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    )
    let reduced = reducedMotionQuery.matches

    let animationFrameId: number | null = null
    let width = 0
    let height = 0
    let stars: Star[] = []

    function createStars() {
      if (!canvas || !context) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      stars = []
      const rand = mulberry32(20260902)
      const count = Math.round((width * height) / 9000)
      for (let i = 0; i < count; i++) {
        stars.push({
          a: 0.06 + rand() * 0.3,
          ph: rand() * Math.PI * 2,
          r: 0.2 + Math.pow(rand(), 2.4) * 0.9,
          tw: rand() < 0.08 ? 0.4 + rand() : 0,
          x: rand() * width,
          y: rand() * height,
        })
      }
    }

    function renderFrame(timestamp: number) {
      if (!context) return
      context.clearRect(0, 0, width, height)
      const seconds = timestamp * 0.001

      for (const star of stars) {
        let alpha = star.a
        if (star.tw && !reduced) {
          alpha *= 0.6 + 0.4 * Math.sin(seconds * star.tw + star.ph)
        }
        context.globalAlpha = alpha
        context.fillStyle = '#dfe6f2'
        context.beginPath()
        context.arc(star.x, star.y, star.r, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1

      if (!reduced && !document.hidden) {
        animationFrameId = requestAnimationFrame(renderFrame)
      }
    }

    function handleResize() {
      createStars()
      if (reduced) {
        renderFrame(0)
      }
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
      } else if (!reduced) {
        animationFrameId = requestAnimationFrame(renderFrame)
      }
    }

    function handleReducedMotionChange(event: MediaQueryListEvent) {
      reduced = event.matches
      if (reduced) {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
        renderFrame(0)
      } else {
        animationFrameId = requestAnimationFrame(renderFrame)
      }
    }

    createStars()
    if (reduced) {
      renderFrame(0)
    } else {
      animationFrameId = requestAnimationFrame(renderFrame)
    }

    window.addEventListener('resize', handleResize)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    reducedMotionQuery.addEventListener('change', handleReducedMotionChange)

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId)
      }
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      reducedMotionQuery.removeEventListener(
        'change',
        handleReducedMotionChange,
      )
    }
  }, [])

  useEffect(() => {
    const ghostWrap = ghostWrapRef.current
    if (!ghostWrap) return

    function fadeGhost() {
      if (!ghostWrap) return
      const k = Math.max(0, 1 - window.scrollY / 520)
      ghostWrap.style.opacity = (0.15 + 0.85 * k).toFixed(3)
    }

    window.addEventListener('scroll', fadeGhost, { passive: true })
    fadeGhost()

    return () => {
      window.removeEventListener('scroll', fadeGhost)
    }
  }, [])

  return (
    <>
      <canvas
        aria-hidden="true"
        className="contact-starfield"
        ref={canvasRef}
      />
      <div aria-hidden="true" className="contact-ghost-wrap" ref={ghostWrapRef}>
        <div className="contact-ghost-num">23.13°N</div>
      </div>
      <div aria-hidden="true" className="contact-ghost-word">
        SIGNAL
      </div>
    </>
  )
}
