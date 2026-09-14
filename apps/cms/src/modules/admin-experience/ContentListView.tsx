'use client'

import { DefaultListView } from '@payloadcms/ui'
import type { ListViewClientProps } from 'payload'

export function ContentListView(props: ListViewClientProps) {
  return <DefaultListView {...props} enableRowSelections={false} />
}
