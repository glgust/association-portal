import { ActivityArchiveAtmosphere } from './ActivityArchiveAtmosphere'

export default function ActivitiesLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="activity-surface sb-shell"
      id="main-content"
    >
      <ActivityArchiveAtmosphere ghostText="UTC+8" />
      <div className="view">
        <header className="masthead activity-page-heading">
          <div className="mast-meta">
            <span>PORTAL · ACTIVITY PROGRAM · 活动目录</span>
            <span>STATUS — LOADING</span>
          </div>
          <h1 className="mast-title">
            EVENTS<span className="slash"> / </span>
            <span className="outline">PROGRAM</span>
          </h1>
        </header>
        <section className="activity-status-panel anim" role="status">
          <p className="activity-eyebrow">SYSTEM / 载入中</p>
          <h2>正在载入活动目录</h2>
          <p>正在连接活动服务并同步档案记录，请稍候。</p>
        </section>
      </div>
    </main>
  )
}
