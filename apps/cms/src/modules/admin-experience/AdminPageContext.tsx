import Link from 'next/link'

import styles from './admin-experience.module.css'

export function AdminPageContext({
  group,
  title,
}: {
  group: string
  title: string
}) {
  return (
    <nav aria-label="当前位置" className={styles.contextNav}>
      <Link href="/admin">工作台</Link>
      <span aria-hidden="true">/</span>
      <span>{group}</span>
      <span aria-hidden="true">/</span>
      <strong aria-current="page">{title}</strong>
    </nav>
  )
}
