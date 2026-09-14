import type { CSSProperties } from 'react'

import { generateAnnouncementSpectrum, spectrumPosition } from './spectrum'

const scaleTicks = Array.from({ length: 38 }, (_, index) => 380 + index * 10)

export function AnnouncementSpectrumAxis() {
  return (
    <div className="announcement-spectrum-axis" aria-hidden="true">
      <div className="announcement-spectrum-axis-clip">
        <div className="announcement-spectrum-streak" />
        <div className="announcement-spectrum-band" />
        <div className="announcement-spectrum-scale">
          {scaleTicks.map((wavelength) => (
            <i
              className={wavelength % 50 === 0 ? 'major' : undefined}
              key={`tick-${wavelength}`}
              style={spectrumStyle(wavelength)}
            />
          ))}
          {scaleTicks
            .filter(
              (wavelength) =>
                wavelength % 50 === 0 ||
                wavelength === 380 ||
                wavelength === 750,
            )
            .map((wavelength) => (
              <span
                className={
                  wavelength === 380 ||
                  wavelength === 500 ||
                  wavelength === 600 ||
                  wavelength === 700 ||
                  wavelength === 750
                    ? 'announcement-spectrum-label announcement-spectrum-label-mobile'
                    : 'announcement-spectrum-label'
                }
                key={`label-${wavelength}`}
                style={spectrumStyle(wavelength)}
              >
                {wavelength}
              </span>
            ))}
        </div>
      </div>
      <div className="announcement-spectrum-glow" />
    </div>
  )
}

export function AnnouncementSpectrumWindow({ seed }: { seed: string }) {
  const lines = generateAnnouncementSpectrum(seed)
  return (
    <div className="announcement-spectrum-window" aria-hidden="true">
      {lines.map((line, index) => (
        <i
          key={`${line.wavelength}-${line.intensity}-${index}`}
          style={
            {
              '--announcement-line-alpha': 0.45 + line.intensity * 0.55,
              '--announcement-line-color': line.color,
              '--announcement-line-position': `${spectrumPosition(line.wavelength)}%`,
              '--announcement-line-width': `${0.8 + line.intensity * 5.2}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

export function AnnouncementSpectrumMark({ seed }: { seed: string }) {
  const strongest = generateAnnouncementSpectrum(seed).reduce(
    (current, line) => (line.intensity > current.intensity ? line : current),
  )

  return (
    <span
      aria-hidden="true"
      className="announcement-spectrum-mark"
      style={
        {
          '--announcement-line-color': strongest.color,
          '--announcement-mark-width': `${0.6 + strongest.intensity * 1.15}rem`,
        } as CSSProperties
      }
    />
  )
}

function spectrumStyle(wavelength: number): CSSProperties {
  return {
    '--announcement-spectrum-position': `${spectrumPosition(wavelength)}%`,
  } as CSSProperties
}
