import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'

const DAEMON_DIR = join(homedir(), '.agent-device')

export function getDaemonDir(): string {
  mkdirSync(DAEMON_DIR, { recursive: true })
  return DAEMON_DIR
}

export function getSocketPath(): string {
  return join(getDaemonDir(), 'daemon.sock')
}

export function getPidPath(): string {
  return join(getDaemonDir(), 'daemon.pid')
}

export function getLogPath(): string {
  return join(getDaemonDir(), 'daemon.log')
}
