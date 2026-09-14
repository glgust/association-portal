export default function AnnouncementsLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="announcement-loading"
      id="main-content"
    >
      <span>正在载入公告…</span>
    </main>
  )
}
