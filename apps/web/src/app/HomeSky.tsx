'use client'

import { useEffect, useRef } from 'react'

import styles from './home.module.css'

type Vec3 = [number, number, number]

type Star = {
  alpha: number
  dust: boolean
  phase: number
  size: number
  tint: string
  twinkle: number
  x: number
  y: number
  z: number
}

type ProjectedPoint = { scale: number; x: number; y: number }

const NEAR = 250
const FAR = 2400
const FOCAL = 800
const Z_SPLIT = 1050
const ORIGIN_Z = 950
const DRIFT = 10

const palette = {
  brass: '#9c8557',
  halo: '#8fa0b4',
  label: '#9aa7b5',
  link: '#a8b8c8',
  node: '#e9edf3',
  origin: '#bfa06a',
  ring: '#c8d2de',
  tints: ['#e9edf3', '#dfe6f2', '#dfe6f2', '#ffd9a8', '#aecbf2'],
}

export function HomeSky() {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const rootElement = rootRef.current
    const canvasElement = canvasRef.current
    if (!rootElement || !canvasElement) return
    const drawingContext = canvasElement.getContext('2d')
    if (!drawingContext) return
    const root = rootElement
    const canvas = canvasElement
    const context = drawingContext
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointerQuery = window.matchMedia('(pointer: fine)')
    let reducedMotion = motionQuery.matches
    let finePointer = pointerQuery.matches
    let width = 0
    let height = 0
    let animationFrame = 0
    let previousTime = 0
    let introStart = -1
    let focus = 1
    let exposure = 1
    let labelExposure = 1
    let stopped = false
    let lampTargetX: number | null = null
    let lampTargetY: number | null = null
    let lampX: number | null = null
    let lampY: number | null = null
    const camera = { pitch: 0, targetPitch: 0, targetYaw: 0, yaw: 0 }
    const cameraBasis = {
      cosPitch: 1,
      cosYaw: 1,
      sinPitch: 0,
      sinYaw: 0,
      x: 0,
      y: 0,
      z: 0,
    }
    const random = seededRandom(20260721)
    const stars: Star[] = []
    const nodes: Star[] = []
    const links: Array<[number, number]> = []

    function resize() {
      const density = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * density)
      canvas.height = Math.round(height * density)
      context.setTransform(density, 0, 0, density, 0, 0)
    }

    function populate() {
      const compact = window.innerWidth < 720
      const brightCount = compact ? 1300 : 2600
      const dustCount = compact ? 2200 : 4800
      for (let index = 0; index < brightCount; index += 1) {
        stars.push(spawnStar(NEAR + random() * (FAR - NEAR), false, random))
      }
      for (let index = 0; index < dustCount; index += 1) {
        stars.push(spawnStar(NEAR + random() * (FAR - NEAR), true, random))
      }

      const candidates = stars.filter(
        (star) => !star.dust && star.z > 520 && star.z < 1500,
      )
      while (nodes.length < 36 && candidates.length > 0) {
        const [node] = candidates.splice(
          Math.floor(random() * candidates.length),
          1,
        )
        nodes.push(node)
      }
      const maximumDistance = 420 * 420
      nodes.forEach((node, nodeIndex) => {
        const neighbours = nodes
          .map((candidate, candidateIndex) => ({
            candidateIndex,
            distance:
              (node.x - candidate.x) ** 2 +
              (node.y - candidate.y) ** 2 +
              (node.z - candidate.z) ** 2,
          }))
          .filter(
            ({ candidateIndex, distance }) =>
              candidateIndex !== nodeIndex && distance < maximumDistance,
          )
          .sort((left, right) => left.distance - right.distance)
          .slice(0, 3)
        for (const neighbour of neighbours) {
          if (neighbour.candidateIndex > nodeIndex) {
            links.push([nodeIndex, neighbour.candidateIndex])
          }
        }
      })
    }

    function updateCamera() {
      camera.yaw += (camera.targetYaw - camera.yaw) * 0.05
      camera.pitch += (camera.targetPitch - camera.pitch) * 0.05
      cameraBasis.cosYaw = Math.cos(camera.yaw)
      cameraBasis.sinYaw = Math.sin(camera.yaw)
      cameraBasis.cosPitch = Math.cos(camera.pitch)
      cameraBasis.sinPitch = Math.sin(camera.pitch)
      cameraBasis.x = -ORIGIN_Z * cameraBasis.sinYaw * cameraBasis.cosPitch
      cameraBasis.y = ORIGIN_Z * cameraBasis.sinPitch
      cameraBasis.z =
        ORIGIN_Z - ORIGIN_Z * cameraBasis.cosYaw * cameraBasis.cosPitch
    }

    function project([x, y, z]: Vec3): ProjectedPoint {
      const translatedX = x - cameraBasis.x
      const translatedY = y - cameraBasis.y
      const translatedZ = z - cameraBasis.z
      const rotatedX =
        translatedX * cameraBasis.cosYaw - translatedZ * cameraBasis.sinYaw
      const firstRotatedZ =
        translatedX * cameraBasis.sinYaw + translatedZ * cameraBasis.cosYaw
      const rotatedY =
        translatedY * cameraBasis.cosPitch +
        firstRotatedZ * cameraBasis.sinPitch
      const rotatedZ = Math.max(
        60,
        -translatedY * cameraBasis.sinPitch +
          firstRotatedZ * cameraBasis.cosPitch,
      )
      const scale = FOCAL / rotatedZ
      return {
        scale,
        x: width / 2 + rotatedX * scale,
        y: height / 2 + rotatedY * scale,
      }
    }

    function drawStar(star: Star, time: number) {
      const projected = project([star.x, star.y, star.z])
      if (
        projected.x < -12 ||
        projected.x > width + 12 ||
        projected.y < -12 ||
        projected.y > height + 12
      ) {
        return
      }

      let alpha = star.alpha * Math.min(1, (FAR - star.z) / FAR + 0.22)
      if (star.twinkle && !reducedMotion) {
        alpha *= 0.72 + 0.28 * Math.sin(time * star.twinkle + star.phase)
      }
      if (exposure < 1) {
        const threshold = (1 - star.alpha) * 0.8
        alpha *= clamp((exposure - threshold) / (1 - threshold))
      }
      if (alpha <= 0.02) return

      let radius = Math.max(0.25, star.size * projected.scale)
      if (focus < 1) {
        const blurredRadius = radius + (1 - focus) ** 2 * 9
        alpha *= (radius * radius) / (blurredRadius * blurredRadius)
        radius = blurredRadius
      }
      if (alpha <= 0.02) return

      context.globalAlpha = Math.min(1, alpha)
      context.fillStyle = star.tint
      if (radius < 0.7) {
        context.fillRect(
          projected.x - radius,
          projected.y - radius,
          radius * 2,
          radius * 2,
        )
      } else {
        context.beginPath()
        context.arc(projected.x, projected.y, radius, 0, Math.PI * 2)
        context.fill()
      }
    }

    function drawLinks() {
      context.strokeStyle = palette.link
      context.lineWidth = 0.9
      for (const [fromIndex, toIndex] of links) {
        const from = nodes[fromIndex]
        const to = nodes[toIndex]
        const fromPoint = project([from.x, from.y, from.z])
        const toPoint = project([to.x, to.y, to.z])
        const depth = 1 - ((from.z + to.z) / 2 - NEAR) / (FAR - NEAR)
        context.globalAlpha = (0.05 + 0.14 * Math.max(0, depth)) * exposure
        context.beginPath()
        context.moveTo(fromPoint.x, fromPoint.y)
        context.lineTo(toPoint.x, toPoint.y)
        context.stroke()
      }

      context.fillStyle = palette.node
      for (const node of nodes) {
        const point = project([node.x, node.y, node.z])
        const depth = Math.max(0.2, 1 - (node.z - NEAR) / (FAR - NEAR))
        context.globalAlpha = (0.35 + 0.5 * depth) * exposure
        context.beginPath()
        context.arc(
          point.x,
          point.y,
          Math.max(0.9, 1.8 * point.scale),
          0,
          Math.PI * 2,
        )
        context.fill()
      }
    }

    function strokePath(
      points: Vec3[],
      color: string,
      lineWidth: number,
      dash?: number[],
    ) {
      context.setLineDash(dash ?? [])
      context.strokeStyle = color
      for (let index = 0; index < points.length - 1; index += 1) {
        const from = points[index]
        const to = points[index + 1]
        const depth = Math.max(
          0.12,
          Math.min(1, 1.35 - (from[2] + to[2]) / 2 / 2100),
        )
        const fromPoint = project(from)
        const toPoint = project(to)
        context.globalAlpha = depth * 0.8 * exposure
        context.lineWidth =
          Math.max(0.5, (lineWidth * (fromPoint.scale + toPoint.scale)) / 2) *
          (1 + (1 - focus) * 1.6)
        context.beginPath()
        context.moveTo(fromPoint.x, fromPoint.y)
        context.lineTo(toPoint.x, toPoint.y)
        context.stroke()
      }
      context.setLineDash([])
    }

    function ringPoints(
      radius: number,
      tilt: number,
      spin: number,
      plane: 'xy' | 'xz',
    ): Vec3[] {
      const points: Vec3[] = []
      for (let degrees = 0; degrees <= 360; degrees += 4) {
        const angle = (degrees * Math.PI) / 180
        const point: Vec3 =
          plane === 'xy'
            ? [radius * Math.cos(angle), radius * Math.sin(angle), 0]
            : [radius * Math.cos(angle), 0, radius * Math.sin(angle)]
        const rotated = rotateY(rotateX(point, tilt), spin)
        points.push([rotated[0], rotated[1], rotated[2] + ORIGIN_Z])
      }
      return points
    }

    function ringPointAt(
      radius: number,
      tilt: number,
      spin: number,
      plane: 'xy' | 'xz',
      degrees: number,
    ): Vec3 {
      const angle = (degrees * Math.PI) / 180
      const point: Vec3 =
        plane === 'xy'
          ? [radius * Math.cos(angle), radius * Math.sin(angle), 0]
          : [radius * Math.cos(angle), 0, radius * Math.sin(angle)]
      const rotated = rotateY(rotateX(point, tilt), spin)
      return [rotated[0], rotated[1], rotated[2] + ORIGIN_Z]
    }

    function drawTicks(
      radius: number,
      tilt: number,
      spin: number,
      plane: 'xy' | 'xz',
      step: number,
      length: number,
      labelEvery: number,
    ) {
      for (let degrees = 0; degrees < 360; degrees += step) {
        strokePath(
          [
            ringPointAt(radius, tilt, spin, plane, degrees),
            ringPointAt(radius + length, tilt, spin, plane, degrees),
          ],
          palette.brass,
          0.7,
        )
        if (labelEvery && degrees % labelEvery === 0) {
          const labelPoint = project(
            ringPointAt(radius + length + 18, tilt, spin, plane, degrees),
          )
          context.globalAlpha = 0.5 * labelExposure
          context.fillStyle = palette.brass
          context.font = '9px ui-monospace, Consolas, monospace'
          context.textAlign = 'center'
          context.fillText(`${degrees}°`, labelPoint.x, labelPoint.y)
        }
      }
      context.textAlign = 'left'
    }

    function drawDot(
      point: Vec3,
      radius: number,
      color: string,
      alpha: number,
    ) {
      const projected = project(point)
      context.globalAlpha = alpha * exposure
      context.fillStyle = color
      context.beginPath()
      context.arc(
        projected.x,
        projected.y,
        Math.max(0.8, radius * projected.scale),
        0,
        Math.PI * 2,
      )
      context.fill()
    }

    function drawLabel(
      text: string,
      point: Vec3,
      color: string,
      alpha: number,
    ) {
      const projected = project(point)
      context.globalAlpha = alpha * labelExposure
      context.fillStyle = color
      context.font = '10px ui-monospace, Consolas, monospace'
      context.textAlign = 'left'
      context.fillText(text, projected.x, projected.y)
    }

    function drawInstrument(time: number) {
      const spin = reducedMotion ? 0.6 : time * 0.021 + 0.6
      strokePath(
        ringPoints(1080, 1.22, 0.4, 'xz').map(([x, y, z]) => [x, y, z + 620]),
        palette.halo,
        0.7,
      )
      strokePath(
        ringPoints(1240, 1.85, 2.2, 'xz').map(([x, y, z]) => [x, y, z + 700]),
        palette.halo,
        0.6,
      )
      strokePath(ringPoints(430, 0.1, spin, 'xz'), palette.ring, 1)
      strokePath(
        ringPoints(430, 0.41, spin * 0.9 + 0.5, 'xz'),
        palette.brass,
        0.9,
        [2, 7],
      )
      strokePath(
        ringPoints(430, 1.35, -spin * 0.62 + 1.1, 'xy'),
        palette.ring,
        0.8,
      )
      strokePath(ringPoints(560, 0.21, spin * 0.35, 'xz'), palette.halo, 0.7)
      strokePath(ringPoints(250, 1.15, -spin * 0.85, 'xy'), palette.ring, 0.7)
      drawTicks(430, 0.1, spin, 'xz', 10, 16, 30)
      drawTicks(430, 0.41, spin * 0.9 + 0.5, 'xz', 10, 13, 30)
      drawTicks(430, 1.35, -spin * 0.62 + 1.1, 'xy', 15, 12, 0)
      for (const degrees of [0, 90, 180, 270]) {
        drawDot(
          ringPointAt(430, 0.41, spin * 0.9 + 0.5, 'xz', degrees),
          5,
          palette.ring,
          0.85,
        )
      }
      drawDot([0, 0, ORIGIN_Z], 3, palette.origin, 0.95)
      strokePath(
        [
          [-70, 0, ORIGIN_Z],
          [70, 0, ORIGIN_Z],
        ],
        palette.origin,
        0.8,
      )
      strokePath(
        [
          [0, -70, ORIGIN_Z],
          [0, 70, ORIGIN_Z],
        ],
        palette.origin,
        0.8,
      )
      drawLabel(
        'RA 05h 35m 17s',
        [-640, 300, ORIGIN_Z + 120],
        palette.label,
        0.75,
      )
      drawLabel(
        'DEC −05° 23′ 28″',
        [-640, 330, ORIGIN_Z + 120],
        palette.label,
        0.75,
      )
      drawLabel('EPOCH J2000.0', [470, -320, ORIGIN_Z + 60], palette.brass, 0.7)
      drawLabel('NCP +90° 00′', [470, -300, ORIGIN_Z + 60], palette.brass, 0.7)
      drawLabel(
        'HIP 27989 · MAG +0.5',
        [-560, -340, ORIGIN_Z + 160],
        palette.label,
        0.6,
      )
      drawLabel(
        'SAO 131840 · MAG +4.2',
        [520, 300, ORIGIN_Z + 140],
        palette.label,
        0.6,
      )
      drawLabel(
        'λ 123° 41′ ECL',
        [-430, 380, ORIGIN_Z + 40],
        palette.brass,
        0.55,
      )
    }

    function updateLamp() {
      if (lampTargetX === null || lampTargetY === null) return
      if (lampX === null || lampY === null) {
        lampX = lampTargetX
        lampY = lampTargetY
      }
      lampX += (lampTargetX - lampX) * 0.08
      lampY += (lampTargetY - lampY) * 0.08
      root.style.setProperty('--home-pointer-x', `${lampX.toFixed(1)}px`)
      root.style.setProperty('--home-pointer-y', `${lampY.toFixed(1)}px`)
    }

    function drawFrame(milliseconds: number) {
      if (stopped) return
      const time = milliseconds / 1000
      const elapsed = Math.min(0.05, time - previousTime || 0.016)
      previousTime = time
      if (introStart < 0) introStart = time

      if (reducedMotion) {
        focus = 1
        exposure = 1
        labelExposure = 1
      } else {
        const introTime = time - introStart
        const focusProgress = clamp(introTime / 1.8)
        focus = 1 - (1 - focusProgress) ** 3
        const exposureProgress = clamp(introTime / 2.6)
        exposure =
          exposureProgress * exposureProgress * (3 - 2 * exposureProgress)
        labelExposure = clamp((exposure - 0.55) / 0.45)
      }

      updateLamp()
      updateCamera()
      context.fillStyle = '#000'
      context.fillRect(0, 0, width, height)

      const farStars: Star[] = []
      const nearStars: Star[] = []
      for (const star of stars) {
        if (!reducedMotion) {
          star.z -= DRIFT * elapsed
          if (star.z < NEAR) {
            Object.assign(star, spawnStar(FAR, star.dust, random))
          }
        }
        ;(star.z > Z_SPLIT ? farStars : nearStars).push(star)
      }
      for (const star of farStars) drawStar(star, time)
      drawLinks()
      drawInstrument(time)
      for (const star of nearStars) drawStar(star, time)
      context.globalAlpha = 1

      if (!reducedMotion && !document.hidden) {
        animationFrame = window.requestAnimationFrame(safeDrawFrame)
      }
    }

    function safeDrawFrame(milliseconds: number) {
      try {
        drawFrame(milliseconds)
      } catch {
        stopped = true
        context.clearRect(0, 0, width, height)
      }
    }

    function restart() {
      window.cancelAnimationFrame(animationFrame)
      previousTime = 0
      stopped = false
      animationFrame = window.requestAnimationFrame(safeDrawFrame)
    }

    function handlePointerMove(event: PointerEvent) {
      if (!finePointer || reducedMotion) return
      const lampInset = Math.min(96, width / 4, height / 4)
      lampTargetX = clampBetween(
        event.clientX,
        lampInset,
        Math.max(lampInset, width - lampInset),
      )
      lampTargetY = clampBetween(
        event.clientY,
        lampInset,
        Math.max(lampInset, height - lampInset),
      )
      camera.targetYaw = clampSigned(
        (event.clientX / Math.max(width, 1) - 0.5) * 2 * 0.12,
        0.12,
      )
      camera.targetPitch = clampSigned(
        (event.clientY / Math.max(height, 1) - 0.5) * 2 * 0.07,
        0.07,
      )
    }

    function resetPointerTarget() {
      camera.targetYaw = 0
      camera.targetPitch = 0
    }

    function handleMotionChange(event: MediaQueryListEvent) {
      reducedMotion = event.matches
      introStart = -1
      restart()
    }

    function handlePointerChange(event: MediaQueryListEvent) {
      finePointer = event.matches
      if (!finePointer) resetPointerTarget()
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        window.cancelAnimationFrame(animationFrame)
      } else {
        restart()
      }
    }

    try {
      resize()
      populate()
    } catch {
      return
    }
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    })
    document.addEventListener('visibilitychange', handleVisibilityChange)
    motionQuery.addEventListener('change', handleMotionChange)
    pointerQuery.addEventListener('change', handlePointerChange)
    animationFrame = window.requestAnimationFrame(safeDrawFrame)

    return () => {
      stopped = true
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      motionQuery.removeEventListener('change', handleMotionChange)
      pointerQuery.removeEventListener('change', handlePointerChange)
    }
  }, [])

  return (
    <div aria-hidden="true" className={styles.sky} ref={rootRef}>
      <canvas className={styles.spaceCanvas} ref={canvasRef} />
      <div className={styles.lamp} />
    </div>
  )
}

function clamp(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function clampSigned(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value))
}

function clampBetween(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function spawnStar(z: number, dust: boolean, random: () => number): Star {
  for (;;) {
    const x = (random() * 2 - 1) * 1500
    const y = (random() * 2 - 1) * 950
    const radius = Math.sqrt(x * x + y * y)
    const angle = Math.atan2(y, x)
    let density = Math.exp(-radius / 1150) + 0.12
    if (Math.abs(Math.sin(2 * angle - radius / 380)) > 0.82) {
      density *= 2.2
    }
    if (random() < density) {
      return {
        alpha: dust ? 0.1 + random() * 0.24 : 0.3 + random() * 0.7,
        dust,
        phase: random() * Math.PI * 2,
        size: dust ? 0.16 + random() * 0.3 : 0.4 + random() ** 2.4 * 1.1,
        tint: palette.tints[Math.floor(random() * palette.tints.length)],
        twinkle: !dust && random() < 0.1 ? 0.6 + random() * 1.6 : 0,
        x,
        y,
        z,
      }
    }
  }
}

function rotateX([x, y, z]: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [x, y * cosine - z * sine, y * sine + z * cosine]
}

function rotateY([x, y, z]: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [x * cosine + z * sine, y, -x * sine + z * cosine]
}
