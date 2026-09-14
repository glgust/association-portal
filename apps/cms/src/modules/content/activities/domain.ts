import type {
  PublicActivityListItem,
  PublicActivityStatus,
} from '@ascnucc/contracts'

type ActivityStatusInput =
  | {
      activityType: 'standing'
      isCancelled: boolean
    }
  | {
      activityType: 'temporary'
      endsAt: string
      isCancelled: boolean
      startsAt: string
    }

function epoch(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed))
    throw new Error(`Invalid activity time: ${value}`)
  return parsed
}

export function deriveActivityStatus(
  activity: ActivityStatusInput,
  asOf: Date,
): PublicActivityStatus {
  if (activity.isCancelled) return 'cancelled'
  if (activity.activityType === 'standing') return 'ongoing'

  const now = asOf.getTime()
  if (now < epoch(activity.startsAt)) return 'upcoming'
  if (now < epoch(activity.endsAt)) return 'ongoing'
  return 'ended'
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function compareEpoch(a: string, b: string, direction: 1 | -1): number {
  const difference = epoch(a) - epoch(b)
  return difference === 0 ? 0 : difference < 0 ? -direction : direction
}

function groupRank(status: PublicActivityStatus): number {
  if (status === 'ongoing') return 0
  if (status === 'upcoming') return 1
  return 2
}

export function compareActivityCatalogItems(
  left: PublicActivityListItem,
  right: PublicActivityListItem,
): number {
  const groupDifference = groupRank(left.status) - groupRank(right.status)
  if (groupDifference !== 0) return groupDifference

  if (left.status === 'ongoing' && right.status === 'ongoing') {
    if (left.activityType !== right.activityType) {
      return left.activityType === 'temporary' ? -1 : 1
    }
    const timeDifference =
      left.activityType === 'temporary' && right.activityType === 'temporary'
        ? compareEpoch(left.endsAt, right.endsAt, 1)
        : compareEpoch(left.publishedAt, right.publishedAt, -1)
    return timeDifference || compareId(left.id, right.id)
  }

  if (left.status === 'upcoming' && right.status === 'upcoming') {
    const timeDifference = compareEpoch(left.startsAt, right.startsAt, 1)
    return timeDifference || compareId(left.id, right.id)
  }

  const leftHistoryAt =
    left.activityType === 'temporary' ? left.endsAt : left.publishedAt
  const rightHistoryAt =
    right.activityType === 'temporary' ? right.endsAt : right.publishedAt
  return (
    compareEpoch(leftHistoryAt, rightHistoryAt, -1) ||
    compareId(left.id, right.id)
  )
}
