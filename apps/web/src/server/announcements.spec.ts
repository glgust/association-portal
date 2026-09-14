import assert from 'node:assert/strict'
import test from 'node:test'
import type { PublicAnnouncementDetail } from '@ascnucc/contracts'

import {
  AnnouncementNotFoundError,
  createAnnouncementDetailLoader,
} from './announcements'

const detail: PublicAnnouncementDetail = {
  body: {
    blocks: [
      {
        children: [{ text: '公告正文', type: 'text' }],
        type: 'paragraph',
      },
    ],
    version: 1,
  },
  id: '6d59a027-e8c4-4783-9bed-07db56fa37f1',
  publishedAt: '2026-08-28T19:30:00+08:00',
  slug: 'public-notice',
  summary: '公告摘要',
  title: '公告标题',
}

test('memoizes one detail outcome for metadata and page consumers', async () => {
  let calls = 0
  const load = createAnnouncementDetailLoader(
    async () => {
      calls += 1
      return detail
    },
    (loader) => {
      const results = new Map<string, ReturnType<typeof loader>>()
      return (slug) => {
        let result = results.get(slug)
        if (!result) {
          result = loader(slug)
          results.set(slug, result)
        }
        return result
      }
    },
  )

  assert.deepEqual(await load(detail.slug), { data: detail })
  assert.deepEqual(await load(detail.slug), { data: detail })
  assert.equal(calls, 1)
})

test('maps a controlled not-found error without swallowing unknown errors', async () => {
  const notFound = createAnnouncementDetailLoader(
    async () => {
      throw new AnnouncementNotFoundError()
    },
    (loader) => loader,
  )
  const notFoundOutcome = await notFound('missing')
  assert.ok(notFoundOutcome.error instanceof AnnouncementNotFoundError)

  const failed = createAnnouncementDetailLoader(
    async () => {
      throw new TypeError('unexpected')
    },
    (loader) => loader,
  )
  await assert.rejects(failed('broken'), /unexpected/)
})
