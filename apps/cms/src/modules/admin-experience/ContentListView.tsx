'use client'

import { DefaultListView, Table, useListQuery } from '@payloadcms/ui'
import type { ListViewClientProps } from 'payload'

export function ContentListView(props: ListViewClientProps) {
  const { data } = useListQuery()
  // Payload prepares the initial Table on the server before this view runs.
  // Reuse its permission-filtered columns, which exclude the selection column.
  return (
    <DefaultListView
      {...props}
      enableRowSelections={false}
      Table={
        <div className="table-wrap">
          <Table columns={props.columnState} data={data?.docs ?? []} />
        </div>
      }
    />
  )
}
