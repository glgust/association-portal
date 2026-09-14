import type { PublicRichTextV1 } from '@ascnucc/contracts'
import { PublicRichText } from '@/components/content/PublicRichText'

export function AnnouncementBody({ body }: { body: PublicRichTextV1 }) {
  return (
    <section aria-label="公告正文" className="announcement-body">
      <PublicRichText body={body} />
    </section>
  )
}
