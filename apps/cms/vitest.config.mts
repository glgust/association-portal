import react from '@vitejs/plugin-react'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.json', '../web/tsconfig.json'] }),
    react(),
  ],
  test: {
    env: {
      MEDIA_LOCAL_ROOT: resolve(tmpdir(), 'ascnucc-media-vitest'),
      MEDIA_S3_ACCESS_KEY_ID: '',
      MEDIA_S3_BUCKET: '',
      MEDIA_S3_ENDPOINT: '',
      MEDIA_S3_FORCE_PATH_STYLE: '',
      MEDIA_S3_REGION: '',
      MEDIA_S3_SECRET_ACCESS_KEY: '',
      MEDIA_STORAGE_MODE: 'local',
    },
    environment: 'node',
    include: [
      'tests/**/*.spec.ts',
      '../web/src/server/home-composition.spec.ts',
      '../web/src/app/about/about-promotion-link.spec.tsx',
      '../web/src/app/activities/activity-list-consumers.spec.tsx',
      '../web/src/app/activities/activity-detail-consumers.spec.tsx',
      '../web/src/app/news/news-list-consumers.spec.tsx',
      '../web/src/app/news/news-detail-consumers.spec.tsx',
      '../web/src/app/contact/contact-page-consumers.spec.tsx',
      '../web/src/app/gallery/gallery-list-consumers.spec.tsx',
      '../web/src/app/gallery/gallery-detail-consumers.spec.tsx',
      '../web/src/app/media/gallery/gallery-image-proxy.spec.ts',
      'src/modules/content/gallery/*.spec.ts',
    ],
  },
})
