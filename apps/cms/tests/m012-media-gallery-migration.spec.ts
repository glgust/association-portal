import { describe, expect, it } from 'vitest'

import { down } from '@/migrations/20260827_142158_m012_media_gallery_publication'
import { migrations } from '@/migrations'

describe('M012 media/gallery migration', () => {
  it('is registered last and rejects destructive down', async () => {
    expect(migrations.at(-1)?.name).toBe(
      '20260827_142158_m012_media_gallery_publication',
    )
    await expect(down({} as never)).rejects.toThrow('M012_DOWN_UNSUPPORTED')
  })
})
