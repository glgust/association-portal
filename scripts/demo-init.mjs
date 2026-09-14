import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const cmsEnv = path.join(root, 'apps/cms/.env')
const webEnv = path.join(root, 'apps/web/.env')
if (existsSync(cmsEnv) || existsSync(webEnv)) {
  console.error(
    '初始化已停止：已有 .env。请保留现有配置，按运维手册检查缺项；本命令不会覆盖账号或密钥。',
  )
  process.exit(1)
}

const mediaRoot = path.join(root, '.data/media')
mkdirSync(mediaRoot, { recursive: true, mode: 0o700 })
const secret = () => randomBytes(32).toString('hex')
const quote = (value) => JSON.stringify(value.replaceAll('\\', '/'))
writeFileSync(
  cmsEnv,
  [
    '# 仅用于本机虚构数据测试。不要提交或分享此文件。',
    'DATABASE_URL=postgres://ascnucc_demo:ascnucc_demo@127.0.0.1:5432/ascnucc_demo_dev',
    `PAYLOAD_SECRET=${secret()}`,
    'MEDIA_STORAGE_MODE=local',
    `MEDIA_LOCAL_ROOT=${quote(mediaRoot)}`,
    'DEMO_ADMIN_USERNAME=demo-owner',
    `DEMO_ADMIN_PASSWORD=${secret()}`,
    'DEMO_STAFF_USERNAME=demo-staff',
    `DEMO_STAFF_PASSWORD=${secret()}`,
    'DEMO_CADRE_USERNAME=demo-cadre',
    `DEMO_CADRE_PASSWORD=${secret()}`,
    '',
  ].join('\n'),
  { flag: 'wx', mode: 0o600 },
)
writeFileSync(webEnv, 'CMS_API_URL=http://127.0.0.1:3001\n', {
  flag: 'wx',
  mode: 0o600,
})
console.log(
  '测试配置已生成。首次登录请在 apps/cms/.env 本地查看 DEMO_ADMIN_USERNAME / DEMO_ADMIN_PASSWORD。',
)
console.log(
  '下一步：docker compose up -d --wait postgres，然后执行迁移、seed 和 pnpm dev（见 README）。',
)
