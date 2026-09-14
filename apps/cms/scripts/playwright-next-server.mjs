import { spawn } from 'node:child_process'
import { accessSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index]
  const value = process.argv[index + 1]
  if (!name?.startsWith('--') || value === undefined) {
    throw new Error('Playwright Next server arguments must be name/value pairs')
  }
  args.set(name, value)
}

const appDirectory = resolve(args.get('--dir') ?? '.')
const hostname = args.get('--hostname') ?? '127.0.0.1'
const port = Number(args.get('--port'))
const controlPort = Number(args.get('--control-port'))
if (
  !['127.0.0.1', 'localhost'].includes(hostname) ||
  !Number.isSafeInteger(port) ||
  port < 1 ||
  port > 65_535 ||
  !Number.isSafeInteger(controlPort) ||
  controlPort < 1 ||
  controlPort > 65_535 ||
  controlPort === port
) {
  throw new Error(
    'Playwright Next server requires a local host and valid distinct ports',
  )
}

const nextCli = resolve(appDirectory, 'node_modules/next/dist/bin/next')
accessSync(nextCli)

const shellParentPid = process.ppid
const server = spawn(
  process.execPath,
  [nextCli, 'start', '-H', hostname, '-p', String(port)],
  {
    cwd: appDirectory,
    env: process.env,
    stdio: 'inherit',
  },
)

let shuttingDown = false
function stopServer(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true
  clearInterval(parentMonitor)
  controlServer.close()
  server.kill()
  const forcedExit = setTimeout(() => {
    server.kill('SIGKILL')
    process.exit(exitCode)
  }, 2_000)
  forcedExit.unref()
  server.once('close', () => {
    clearTimeout(forcedExit)
    process.exit(exitCode)
  })
}

const parentMonitor = setInterval(() => {
  try {
    process.kill(shellParentPid, 0)
  } catch {
    stopServer(0)
  }
}, 250)

const controlServer = createServer((socket) => {
  socket.once('data', (data) => {
    if (data.toString('utf8').trim() === 'shutdown') stopServer(0)
  })
})
controlServer.on('error', (error) => {
  console.error(`Playwright Next control server failed: ${error.message}`)
  stopServer(1)
})
controlServer.listen(controlPort, '127.0.0.1')

server.once('error', (error) => {
  console.error(`Playwright Next server failed to start: ${error.message}`)
  stopServer(1)
})
server.once('exit', (code, signal) => {
  if (shuttingDown) return
  console.error(
    `Playwright Next server exited unexpectedly (${code ?? signal ?? 'unknown'})`,
  )
  process.exit(code ?? 1)
})

process.once('SIGINT', () => stopServer(0))
process.once('SIGTERM', () => stopServer(0))
