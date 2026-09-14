import Link from 'next/link'

import styles from './admin-experience.module.css'

export function ContentListGuidance() {
  return (
    <aside className={styles.listGuidance} aria-label="内容编辑说明">
      <p>
        <strong>点击标题进入编辑。</strong>
        列表不提供批量操作；先保存草稿并核对内容，再使用现有发布动作公开。下线只通过现有
        Unpublish 动作完成。
      </p>
      <Link href="/admin">返回工作台</Link>
    </aside>
  )
}
