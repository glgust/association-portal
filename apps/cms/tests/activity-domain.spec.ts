import type { PublicActivityListItem } from '@ascnucc/contracts'
import { describe, expect, it } from 'vitest'

import {
  compareActivityCatalogItems,
  deriveActivityStatus,
} from '@/modules/content/activities/domain'

const asOf = new Date('2026-07-20T12:00:00.000Z')

describe('activity state projection', () => {
  it.each([
    ['2026-07-20T11:59:59.999Z', 'upcoming'],
    ['2026-07-20T12:00:00.000Z', 'ongoing'],
    ['2026-07-20T12:59:59.999Z', 'ongoing'],
    ['2026-07-20T13:00:00.000Z', 'ended'],
    ['2026-07-20T13:00:00.001Z', 'ended'],
  ] as const)('uses half-open temporary boundaries at %s', (now, expected) => {
    expect(
      deriveActivityStatus(
        {
          activityType: 'temporary',
          endsAt: '2026-07-20T13:00:00.000Z',
          isCancelled: false,
          startsAt: '2026-07-20T12:00:00.000Z',
        },
        new Date(now),
      ),
    ).toBe(expected)
  })

  it('treats an uncancelled standing activity as ongoing', () => {
    expect(
      deriveActivityStatus(
        { activityType: 'standing', isCancelled: false },
        asOf,
      ),
    ).toBe('ongoing')
  })

  it.each(['temporary', 'standing'] as const)(
    'gives cancellation priority for %s activities',
    (activityType) => {
      const activity =
        activityType === 'temporary'
          ? {
              activityType,
              endsAt: '2026-07-20T13:00:00.000Z',
              isCancelled: true,
              startsAt: '2026-07-20T12:00:00.000Z',
            }
          : { activityType, isCancelled: true }
      expect(deriveActivityStatus(activity, asOf)).toBe('cancelled')
    },
  )
})

const common = {
  cancellationNote: null,
  location: '虚构地点',
  publishedAt: '2026-07-16T00:00:00.000Z',
  summary: null,
  version: 1,
} as const

function temporary(
  id: string,
  status: 'ended' | 'ongoing' | 'upcoming',
  startsAt: string,
  endsAt: string,
): PublicActivityListItem {
  return {
    ...common,
    activityType: 'temporary',
    endsAt,
    id,
    slug: `temporary-${id}`,
    startsAt,
    status,
    title: `临时活动 ${id}`,
  }
}

function standing(
  id: string,
  status: 'ongoing',
  publishedAt: string,
): PublicActivityListItem {
  return {
    ...common,
    activityType: 'standing',
    id,
    publishedAt,
    scheduleText: '每周五',
    slug: `standing-${id}`,
    status,
    title: `常驻活动 ${id}`,
  }
}

function cancelledTemporary(
  id: string,
  endsAt: string,
): PublicActivityListItem {
  return {
    ...temporary(id, 'upcoming', '2026-07-30T12:00:00.000Z', endsAt),
    cancellationNote: '虚构取消说明',
    status: 'cancelled',
  }
}

describe('activity catalog sorting', () => {
  it('sorts the complete catalog by frozen groups and time keys', () => {
    const items: PublicActivityListItem[] = [
      cancelledTemporary(
        '00000000-0000-4000-8000-000000000007',
        '2026-08-01T00:00:00Z',
      ),
      temporary(
        '00000000-0000-4000-8000-000000000004',
        'upcoming',
        '2026-07-22T00:00:00Z',
        '2026-07-22T01:00:00Z',
      ),
      standing(
        '00000000-0000-4000-8000-000000000003',
        'ongoing',
        '2026-07-15T00:00:00Z',
      ),
      temporary(
        '00000000-0000-4000-8000-000000000006',
        'ended',
        '2026-07-10T00:00:00Z',
        '2026-07-10T01:00:00Z',
      ),
      temporary(
        '00000000-0000-4000-8000-000000000001',
        'ongoing',
        '2026-07-20T11:00:00Z',
        '2026-07-20T13:00:00Z',
      ),
      standing(
        '00000000-0000-4000-8000-000000000002',
        'ongoing',
        '2026-07-16T00:00:00Z',
      ),
      temporary(
        '00000000-0000-4000-8000-000000000005',
        'upcoming',
        '2026-07-21T00:00:00Z',
        '2026-07-21T01:00:00Z',
      ),
    ]

    expect(items.sort(compareActivityCatalogItems).map(({ id }) => id)).toEqual(
      [
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
        '00000000-0000-4000-8000-000000000005',
        '00000000-0000-4000-8000-000000000004',
        '00000000-0000-4000-8000-000000000007',
        '00000000-0000-4000-8000-000000000006',
      ],
    )
  })

  it('uses stable activity id ascending to break every tie', () => {
    const laterId = temporary(
      '00000000-0000-4000-8000-00000000000b',
      'upcoming',
      '2026-07-21T00:00:00Z',
      '2026-07-21T01:00:00Z',
    )
    const earlierId = { ...laterId, id: '00000000-0000-4000-8000-00000000000a' }
    expect([laterId, earlierId].sort(compareActivityCatalogItems)[0]?.id).toBe(
      earlierId.id,
    )
  })
})
