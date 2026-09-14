import type { NextConfig } from 'next'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.resolve(dirname, '../..'),
  poweredByHeader: false,
}

export default nextConfig
