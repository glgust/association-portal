import { describe, expect, it } from 'vitest'

import { canCreateMediaAsset, canReadMediaAsset } from '@/modules/media/access'
import { MediaAssets } from '@/modules/media/collections/MediaAssets'

function accessArgs(permission?: 'content.create' | 'content.edit') {
  return {
    req: {
      context: {},
      payload: {
        find: async () => ({
          docs: permission
            ? [
                {
                  effect: 'allow',
                  id: 'fictional-override',
                  permission,
                  scopeType: 'global',
                },
              ]
            : [],
        }),
      },
      user: {
        collection: 'auth-users',
        id: '10000000-0000-4000-8000-000000000001',
        role: 'member',
        status: 'active',
      },
    },
  } as never
}

describe('MediaAsset access', () => {
  it.each(['content.create', 'content.edit'] as const)(
    'allows %s actors to read processed assets for Gallery relationships',
    async (permission) => {
      await expect(canReadMediaAsset(accessArgs(permission))).resolves.toBe(
        true,
      )
    },
  )

  it('denies anonymous and zero-permission reads', async () => {
    await expect(canReadMediaAsset(accessArgs())).resolves.toBe(false)
    await expect(
      canReadMediaAsset({ req: { context: {}, payload: {} } } as never),
    ).resolves.toBe(false)
  })

  it('keeps raw create locked to the controlled use-case context', async () => {
    const args = accessArgs('content.create') as { req: { context: object } }
    await expect(
      Promise.resolve(canCreateMediaAsset(args as never)),
    ).resolves.toBe(false)
    args.req.context = { mediaAssetCreate: true }
    await expect(
      Promise.resolve(canCreateMediaAsset(args as never)),
    ).resolves.toBe(true)
  })

  it('hides every internal object key from Payload Admin', () => {
    expect(JSON.stringify(MediaAssets.fields)).toContain(
      '"objectKey","type":"text","required":true,"admin":{"hidden":true}',
    )
    expect(JSON.stringify(MediaAssets.fields)).toContain(
      '"objectPrefix","type":"text","unique":true,"required":true,"admin":{"hidden":true}',
    )
  })
})
