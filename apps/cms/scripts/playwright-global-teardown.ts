import { connect } from 'node:net'

function stopManagedServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port })
    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error(`Managed Playwright server ${port} did not stop`))
    }, 5_000)
    socket.once('connect', () => socket.end('shutdown\n'))
    socket.once('close', () => {
      clearTimeout(timeout)
      resolve()
    })
    socket.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (error.code === 'ECONNREFUSED') resolve()
      else reject(error)
    })
  })
}

export default async function globalTeardown(): Promise<void> {
  const ports = (process.env.ASCNUCC_PLAYWRIGHT_CONTROL_PORTS ?? '')
    .split(',')
    .map(Number)
  if (
    ports.length !== 2 ||
    ports.some(
      (port) => !Number.isSafeInteger(port) || port < 1 || port > 65_535,
    )
  ) {
    throw new Error('Managed Playwright control ports are missing or invalid')
  }
  await Promise.all(ports.map(stopManagedServer))
}
