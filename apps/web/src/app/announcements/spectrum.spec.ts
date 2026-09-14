import assert from 'node:assert/strict'
import test from 'node:test'

import { generateAnnouncementSpectrum, spectrumPosition } from './spectrum'

test('generates a stable decorative spectrum for one announcement', () => {
  const first = generateAnnouncementSpectrum(
    '3025e468-13af-4fe4-b1f7-7dc5747c15ca',
  )
  const second = generateAnnouncementSpectrum(
    '3025e468-13af-4fe4-b1f7-7dc5747c15ca',
  )

  assert.deepEqual(first, second)
  assert.ok(first.length >= 4 && first.length <= 7)
  assert.ok(
    first.every(
      (line) =>
        line.wavelength >= 380 &&
        line.wavelength <= 750 &&
        line.intensity >= 0.35 &&
        line.intensity <= 1,
    ),
  )
  assert.deepEqual(
    [...first].sort((left, right) => left.wavelength - right.wavelength),
    first,
  )
})

test('varies the generated spectrum for a different stable id', () => {
  assert.notDeepEqual(
    generateAnnouncementSpectrum('announcement-a'),
    generateAnnouncementSpectrum('announcement-b'),
  )
})

test('maps the supported wavelength range onto the full visual window', () => {
  assert.equal(spectrumPosition(380), 0)
  assert.equal(spectrumPosition(750), 100)
})
