import assert from 'node:assert/strict'
import type { Payload, PayloadRequest } from 'payload'
import { describe, it } from 'vitest'

import {
  listGalleryAuthorCandidates,
  previewGalleryAuthorName,
} from './author-candidates'

function request(role: 'admin' | 'staff'): PayloadRequest {
  return {
    context: {},
    user: {
      collection: 'auth-users',
      id: '11111111-2222-4333-8444-555555555555',
      role,
      status: 'active',
    },
  } as PayloadRequest
}

describe('Gallery author candidates', () => {
  it('limits ordinary editors to their own opaque identity', async () => {
    const calls: unknown[] = []
    const payload = {
      find: async (options: Record<string, unknown>) => {
        calls.push(options)
        if (options.collection === 'permission-overrides') return { docs: [] }
        return {
          docs: [
            {
              displayName: '虚构作者',
              id: '11111111-2222-4333-8444-555555555555',
              studentNumber: 'must-not-leak',
              username: 'must-not-leak',
            },
          ],
        }
      },
    } as unknown as Payload
    const result = await listGalleryAuthorCandidates(payload, request('staff'))
    assert.deepEqual(result, {
      hasNextPage: false,
      items: [
        {
          displayName: '虚构作者',
          id: '11111111-2222-4333-8444-555555555555',
          statusHint: 'ready',
        },
      ],
      page: 1,
    })
    const authorQuery = calls[1] as {
      limit: number
      select: object
      where: object
    }
    assert.equal(authorQuery.limit, 1)
    assert.deepEqual(authorQuery.select, {
      displayName: true,
      id: true,
      studentNumber: true,
      username: true,
    })
    assert.deepEqual(authorQuery.where, {
      id: { equals: '11111111-2222-4333-8444-555555555555' },
    })
    assert.equal(JSON.stringify(result).includes('must-not-leak'), false)
  })

  it('uses fixed-size pagination so an account manager can select beyond the first 50', async () => {
    const calls: Array<Record<string, unknown>> = []
    const payload = {
      find: async (options: Record<string, unknown>) => {
        calls.push(options)
        return {
          docs:
            options.page === 2
              ? [
                  {
                    displayName: '第 51 位虚构作者',
                    id: '22222222-3333-4444-8555-666666666666',
                  },
                ]
              : [],
          hasNextPage: options.page === 1,
        }
      },
    } as unknown as Payload
    const first = await listGalleryAuthorCandidates(payload, request('admin'))
    const second = await listGalleryAuthorCandidates(
      payload,
      request('admin'),
      2,
    )
    assert.equal(calls[1]?.limit, 50)
    assert.deepEqual(calls[1]?.where, {})
    assert.equal(first.hasNextPage, true)
    assert.equal(calls[3]?.page, 2)
    assert.deepEqual(second.items, [
      {
        displayName: '第 51 位虚构作者',
        id: '22222222-3333-4444-8555-666666666666',
        statusHint: 'ready',
      },
    ])
  })

  it('searches display names server-side without returning account identifiers', async () => {
    const calls: Array<Record<string, unknown>> = []
    const payload = {
      find: async (options: Record<string, unknown>) => {
        calls.push(options)
        if (options.collection === 'permission-overrides') return { docs: [] }
        return {
          docs: [
            {
              displayName: '第 51 位搜索命中作者',
              id: '22222222-3333-4444-8555-666666666666',
              studentNumber: '202600000051',
              username: 'private-login-51',
            },
          ],
          hasNextPage: false,
        }
      },
    } as unknown as Payload
    const result = await listGalleryAuthorCandidates(
      payload,
      request('admin'),
      1,
      '搜索命中',
    )
    assert.deepEqual(calls[1]?.where, {
      displayName: { contains: '搜索命中' },
    })
    assert.deepEqual(Object.keys(result.items[0]!).sort(), [
      'displayName',
      'id',
      'statusHint',
    ])
    assert.equal(JSON.stringify(result).includes('private-login-51'), false)
    assert.equal(JSON.stringify(result).includes('202600000051'), false)
  })

  it('returns only a server-authoritative preview and rejects another author for ordinary editors', async () => {
    const payload = {
      find: async (options: Record<string, unknown>) => {
        if (options.collection === 'permission-overrides') return { docs: [] }
        return {
          docs: [
            {
              displayName: '虚构作者',
              id: '11111111-2222-4333-8444-555555555555',
              studentNumber: '202600000001',
              username: 'private-login',
            },
          ],
        }
      },
    } as unknown as Payload
    assert.deepEqual(
      await previewGalleryAuthorName(payload, request('staff'), {
        authorId: '11111111-2222-4333-8444-555555555555',
        penName: '安全虚构笔名',
      }),
      { authorName: '安全虚构笔名', status: 'ready' },
    )
    assert.deepEqual(
      await previewGalleryAuthorName(payload, request('staff'), {
        authorId: '11111111-2222-4333-8444-555555555555',
        penName: '虚构作者 private-login',
      }),
      { status: 'invalid' },
    )
    assert.deepEqual(
      await previewGalleryAuthorName(payload, request('staff'), {
        authorId: '11111111-2222-4333-8444-555555555555',
        penName: '虚构作者 202600000001',
      }),
      { status: 'invalid' },
    )
    await assert.rejects(
      previewGalleryAuthorName(payload, request('staff'), {
        authorId: '22222222-3333-4444-8555-666666666666',
        penName: '安全虚构笔名',
      }),
      (error: unknown) =>
        error instanceof Error && 'status' in error && error.status === 403,
    )
  })
})
