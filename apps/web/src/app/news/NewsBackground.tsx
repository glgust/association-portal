'use client'

import { useEffect, useRef } from 'react'

interface NewsBackgroundProps {
  year?: string
}

export function NewsBackground({ year }: NewsBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ghostWrapRef = useRef<HTMLDivElement | null>(null)
  const displayYear = year ?? String(new Date().getFullYear())

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    let isReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleMotionChange = (event: MediaQueryListEvent) => {
      isReducedMotion = event.matches
      if (isReducedMotion) {
        if (animationFrameId) cancelAnimationFrame(animationFrameId)
        drawStatic()
      } else {
        animationFrameId = requestAnimationFrame(animate)
      }
    }
    motionQuery.addEventListener('change', handleMotionChange)

    let animationFrameId: number | null = null
    let width = 0
    let height = 0

    interface Star {
      a: number
      ph: number
      r: number
      tw: number
      x: number
      y: number
    }

    let stars: Star[] = []

    function createPrng(seed: number) {
      let state = seed | 0
      return function next() {
        state = (state + 0x6d2b79f5) | 0
        let temp = Math.imul(state ^ (state >>> 15), 1 | state)
        temp = (temp + Math.imul(temp ^ (temp >>> 7), 61 | temp)) ^ temp
        return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296
      }
    }

    const rand = createPrng(20260902)

    function resize() {
      if (!canvas || !context) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      stars = []
      const count = Math.round((width * height) / 9000)
      for (let index = 0; index < count; index++) {
        stars.push({
          a: 0.06 + rand() * 0.3,
          ph: rand() * Math.PI * 2,
          r: 0.2 + Math.pow(rand(), 2.4) * 0.9,
          tw: rand() < 0.08 ? 0.4 + rand() : 0,
          x: rand() * width,
          y: rand() * height,
        })
      }

      if (isReducedMotion) {
        drawStatic()
      }
    }

    function drawStatic() {
      if (!context) return
      context.clearRect(0, 0, width, height)
      for (const star of stars) {
        context.globalAlpha = star.a
        context.fillStyle = '#dfe6f2'
        context.beginPath()
        context.arc(star.x, star.y, star.r, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
    }

    function animate(time: number) {
      if (!context) return
      context.clearRect(0, 0, width, height)
      const elapsed = time * 0.001

      for (const star of stars) {
        let alpha = star.a
        if (star.tw && !isReducedMotion) {
          alpha *= 0.6 + 0.4 * Math.sin(elapsed * star.tw + star.ph)
        }
        context.globalAlpha = alpha
        context.fillStyle = '#dfe6f2'
        context.beginPath()
        context.arc(star.x, star.y, star.r, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1

      if (!isReducedMotion && !document.hidden) {
        animationFrameId = requestAnimationFrame(animate)
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
      } else if (!isReducedMotion) {
        animationFrameId = requestAnimationFrame(animate)
      }
    }

    function handleScroll() {
      const ghostWrap = ghostWrapRef.current
      if (!ghostWrap) return
      const factor = Math.max(0, 1 - window.scrollY / 520)
      ghostWrap.style.opacity = (0.15 + 0.85 * factor).toFixed(3)
    }

    resize()
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('scroll', handleScroll, { passive: true })
    document.addEventListener('visibilitychange', handleVisibility)

    if (!isReducedMotion) {
      animationFrameId = requestAnimationFrame(animate)
    } else {
      drawStatic()
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', resize)
      window.removeEventListener('scroll', handleScroll)
      document.removeEventListener('visibilitychange', handleVisibility)
      motionQuery.removeEventListener('change', handleMotionChange)
    }
  }, [])

  return (
    <>
      <div aria-hidden="true" className="news-archive-underlay" />
      <canvas
        aria-hidden="true"
        className="news-starfield"
        id="starfield"
        ref={canvasRef}
      />
      <div
        aria-hidden="true"
        className="ghost-wrap"
        id="ghostWrap"
        ref={ghostWrapRef}
      >
        <div className="ghost-year" id="ghostYear">
          {displayYear}
        </div>
      </div>
      <div aria-hidden="true" className="ghost-word">
        ARCHIVE
      </div>
    </>
  )
}
