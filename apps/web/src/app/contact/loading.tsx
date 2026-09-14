import { ContactBackground } from './ContactBackground'

export default function ContactLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="contact-shell"
      id="main-content"
    >
      <ContactBackground />
      <div className="contact-status-shell">
        <section className="contact-status-panel">
          <p className="contact-status-eyebrow">正在载入 · LOADING</p>
          <h1>正在载入联系方式</h1>
          <p>请稍候，正在获取协会公开联络渠道。</p>
        </section>
      </div>
    </main>
  )
}
