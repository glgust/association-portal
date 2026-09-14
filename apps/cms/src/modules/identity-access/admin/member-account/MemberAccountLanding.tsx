import type { MemberAccountLandingSummary } from './schema'
import styles from './member-account.module.css'

const identityLabels = { member: '会员', staff: '干事', cadre: '干部' } as const

export function MemberAccountLanding({
  summary,
}: {
  summary: MemberAccountLandingSummary
}) {
  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="member-account-title">
        <p className={styles.eyebrow}>协会账号</p>
        <h1 id="member-account-title">你好，{summary.displayName}</h1>
        <dl>
          <div>
            <dt>协会身份</dt>
            <dd>{identityLabels[summary.membershipIdentity]}</dd>
          </div>
          <div>
            <dt>账号状态</dt>
            <dd>正常</dd>
          </div>
        </dl>
        <section aria-labelledby="capabilities-title">
          <h2 id="capabilities-title">当前可用功能</h2>
          {summary.capabilities.length ? (
            <ul>
              {summary.capabilities.map((item) => (
                <li key={`${item.href}-${item.label}`}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p>当前没有默认后台业务权限。</p>
          )}
        </section>
      </section>
    </main>
  )
}
