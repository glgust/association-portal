export type AnnouncementSpectrumLine = {
  color: string
  intensity: number
  wavelength: number
}

const spectrumColors = [
  { color: '#7657ff', maximum: 430 },
  { color: '#527dff', maximum: 480 },
  { color: '#42c8e8', maximum: 510 },
  { color: '#43d785', maximum: 565 },
  { color: '#d5dc48', maximum: 590 },
  { color: '#f0b43d', maximum: 620 },
  { color: '#ef7435', maximum: 670 },
  { color: '#e54455', maximum: 750 },
] as const

/**
 * Generates a stable decorative spectrum from a public announcement id.
 * Values are intentionally not exposed as scientific or business metadata.
 */
export function generateAnnouncementSpectrum(
  announcementId: string,
): AnnouncementSpectrumLine[] {
  const random = createRandom(hashString(announcementId))
  const lineCount = 4 + Math.floor(random() * 4)
  const lines = Array.from({ length: lineCount }, () => {
    const wavelength = round(380 + random() * 370, 1)
    return {
      color: colorForWavelength(wavelength),
      intensity: round(0.35 + random() * 0.65, 2),
      wavelength,
    }
  })

  return lines.sort((left, right) => left.wavelength - right.wavelength)
}

export function spectrumPosition(wavelength: number): number {
  return ((wavelength - 380) / 370) * 100
}

function colorForWavelength(wavelength: number): string {
  return (
    spectrumColors.find((entry) => wavelength <= entry.maximum)?.color ??
    spectrumColors.at(-1)!.color
  )
}

function hashString(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function createRandom(seed: number): () => number {
  let state = seed || 0x6d2b79f5
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}
