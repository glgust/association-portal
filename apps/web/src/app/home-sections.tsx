import Link from 'next/link'

import { getPublicAnnouncementPage } from '@/server/announcements'
import { getPublicContactPage } from '@/server/association-pages'
import {
  composeHomeSections,
  type AnnouncementSection,
  type ContactSection,
  type HomeSectionDependencies,
  type HomeSectionsData,
} from '@/server/home-composition'

import styles from './home.module.css'

const productionDependencies: HomeSectionDependencies = {
  loadAnnouncements: () => getPublicAnnouncementPage(1, 3),
  loadContacts: getPublicContactPage,
}

/** Injectable composition boundary: each dependency returns a parsed public DTO. */
export async function loadHomeSections(
  dependencies: HomeSectionDependencies = productionDependencies,
): Promise<HomeSectionsData> {
  return composeHomeSections(dependencies)
}

export function HomeContactSection({ data }: { data: ContactSection }) {
  return (
    <section aria-labelledby="home-contacts" className={styles.contactSection}>
      <header className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>Signal Channel · 保持联系</p>
          <h2 id="home-contacts">联系方式</h2>
        </div>
        <Link href="/contact">查看完整列表</Link>
      </header>

      {data.status === 'ready' ? (
        <ul className={styles.contactList}>
          {data.contacts.map((contact) => (
            <li key={contact.contactId}>
              <span>{contact.label}</span>
              {'href' in contact ? (
                <a href={contact.href}>{contact.value}</a>
              ) : (
                <span className={styles.contactValue}>{contact.value}</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {data.status === 'empty' ? (
        <p className={styles.sectionState}>暂无公开联系方式。</p>
      ) : null}
      {data.status === 'not-published' ? (
        <p className={styles.sectionState}>联系方式尚未公开。</p>
      ) : null}
      {data.status === 'unavailable' ? (
        <div className={styles.sectionState} role="status">
          <p>联系方式暂时无法载入，请稍后再试。</p>
          {data.requestId ? (
            <p className="association-request-id">请求编号：{data.requestId}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export function HomeAnnouncementSection({
  data,
}: {
  data: AnnouncementSection
}) {
  return (
    <section aria-labelledby="home-announcements" className={styles.bulletin}>
      <header className={styles.bulletinHeading}>
        <h2 id="home-announcements">Latest · 最新公告</h2>
        <span aria-hidden="true">RA 05h 35m · DEC −05° 23′</span>
      </header>

      <span className={styles.rule} aria-hidden="true" />

      {data.status === 'ready' ? (
        <ol className={styles.announcementList}>
          {data.page.items.map((announcement) => (
            <li key={announcement.id}>
              <article>
                <Link href={`/announcements/${announcement.slug}`}>
                  <time dateTime={announcement.publishedAt}>
                    {formatDate(announcement.publishedAt)}
                  </time>
                  <span className={styles.announcementBody}>
                    <h3>{announcement.title}</h3>
                    {announcement.summary ? (
                      <span>{announcement.summary}</span>
                    ) : null}
                  </span>
                </Link>
              </article>
            </li>
          ))}
        </ol>
      ) : null}
      {data.status === 'empty' ? (
        <p className={styles.sectionState}>暂无公开公告。</p>
      ) : null}
      {data.status === 'unavailable' ? (
        <p className={styles.sectionState} role="status">
          公告暂时无法载入，请稍后再试。
        </p>
      ) : null}

      {data.status === 'ready' ? (
        <Link className={styles.bulletinMore} href="/announcements">
          全部公告 →
        </Link>
      ) : null}
    </section>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'long',
    timeZone: 'Asia/Shanghai',
  }).format(new Date(value))
}
