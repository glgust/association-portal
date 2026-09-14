import type { PublicActivityStatus } from '@ascnucc/contracts'

const statusLabels: Record<PublicActivityStatus, string> = {
  cancelled: '已取消',
  ended: '已结束',
  ongoing: '进行中',
  upcoming: '即将开始',
}

export function ActivityStatus({ status }: { status: PublicActivityStatus }) {
  return (
    <span
      className={`activity-status activity-status-${status} item-status st-${status}`}
    >
      <span aria-hidden="true" className="sd" />
      <span>{statusLabels[status]}</span>
    </span>
  )
}
