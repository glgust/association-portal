import { readMediaStorageConfig } from './media-storage'

function requiredEnvironment(name: 'DATABASE_URL' | 'PAYLOAD_SECRET'): string {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

export const environment = {
  databaseUrl: requiredEnvironment('DATABASE_URL'),
  mediaStorage: readMediaStorageConfig(),
  payloadSecret: requiredEnvironment('PAYLOAD_SECRET'),
} as const

export {
  readMediaStorageConfig,
  type MediaStorageConfig,
} from './media-storage'
