import Link from 'next/link'
import { ActivityArchiveAtmosphere } from './ActivityArchiveAtmosphere'

export default function ActivityNotFound() {
  return (
    <main className="activity-surface sb-shell" id="main-content">
      <ActivityArchiveAtmosphere ghostText="404" />
      <div className="view">
        <div className="back-row">
          <nav aria-label="面包屑" className="activity-breadcrumbs">
            <Link className="back-link" href="/activities">
              返回活动目录
            </Link>
          </nav>
          <span className="back-no">HTTP 404</span>
        </div>

        <section className="activity-status-panel anim" role="status">
          <p className="activity-eyebrow">404 NOT FOUND / 未找到记录</p>
          <h1>没有找到这项活动</h1>
          <p>它可能不存在、仍是草稿，或者已经下线。</p>
          <div className="status-panel-actions">
            <Link className="back-link" href="/activities">
              返回活动目录
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}
