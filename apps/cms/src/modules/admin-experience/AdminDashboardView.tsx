import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import { loadActor } from '@/modules/authorization/load-actor'

import { buildAdminExperience, demoSafetyNotice } from './capabilities'
import styles from './admin-experience.module.css'

export async function AdminDashboardView(props: AdminViewServerProps) {
  const req = props.initPageResult.req
  const actor = await loadActor(req.payload, req)
  const model = buildAdminExperience(
    actor,
    new Date(),
    new Set(props.initPageResult.visibleEntities.collections),
  )

  return (
    <main className={styles.dashboard}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>ASCNUCC · {model.roleLabel}</p>
        <h1>管理工作台</h1>
        <p>按任务进入受控页面。导航是否可见不改变服务端权限。</p>
      </header>
      {model.groups.length ? (
        model.groups.map((group) => (
          <section
            aria-labelledby={`dashboard-${group.id}`}
            className={styles.group}
            key={group.id}
          >
            <h2 id={`dashboard-${group.id}`}>{group.label}</h2>
            {group.id === 'legacy' ? (
              <p className={styles.warning}>{demoSafetyNotice}</p>
            ) : null}
            <div className={styles.grid}>
              {group.tasks.map((item) => (
                <article className={styles.card} key={item.id}>
                  <h3>{item.label}</h3>
                  <dl>
                    <div>
                      <dt>何时使用</dt>
                      <dd>{item.when}</dd>
                    </div>
                    <div>
                      <dt>会发生什么</dt>
                      <dd>{item.impact}</dd>
                    </div>
                    <div>
                      <dt>下一步</dt>
                      <dd>{item.next}</dd>
                    </div>
                  </dl>
                  <Link href={item.href}>进入{item.label}</Link>
                </article>
              ))}
            </div>
          </section>
        ))
      ) : (
        <section className={styles.empty} aria-labelledby="empty-title">
          <h2 id="empty-title">当前没有可用的管理任务</h2>
          <p>
            请检查账号是否已激活及权限是否仍有效；你仍可使用右上角账号菜单或退出登录。
          </p>
        </section>
      )}
    </main>
  )
}
