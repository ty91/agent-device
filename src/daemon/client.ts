import http from 'node:http'
import { readFileSync, unlinkSync, existsSync, openSync } from 'node:fs'
import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getSocketPath, getPidPath, getLogPath } from './paths.js'
import type { RpcRequest, RpcResponse, RpcStreamChunk } from './protocol.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function cleanupStaleFiles(): void {
  try { unlinkSync(getPidPath()) } catch { /* ignore */ }
  try { unlinkSync(getSocketPath()) } catch { /* ignore */ }
}

function httpRequest(method: string, reqPath: string, body?: unknown): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath: getSocketPath(),
      path: reqPath,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 0, data: Buffer.concat(chunks).toString() })
      })
    })

    req.on('error', reject)

    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

export async function isDaemonRunning(): Promise<boolean> {
  const pidPath = getPidPath()
  if (!existsSync(pidPath)) return false

  let pid: number
  try {
    pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10)
    if (isNaN(pid)) { cleanupStaleFiles(); return false }
  } catch {
    return false
  }

  if (!isProcessAlive(pid)) {
    cleanupStaleFiles()
    return false
  }

  try {
    const { statusCode } = await httpRequest('GET', '/health')
    return statusCode === 200
  } catch {
    cleanupStaleFiles()
    return false
  }
}

export async function ensureDaemon(): Promise<void> {
  if (await isDaemonRunning()) return

  // Resolve compiled entry point relative to this file
  const entryPath = path.resolve(__dirname, 'entry.js')

  const logFd = openSync(getLogPath(), 'a')
  const child = fork(entryPath, [], {
    detached: true,
    stdio: ['ignore', logFd, logFd, 'ipc'],
  })

  // Wait for 'ready' IPC message or socket availability
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.removeAllListeners()
      reject(new Error(`Daemon failed to start within 10s. Check ${getLogPath()}`))
    }, 10_000)

    child.on('message', (msg) => {
      if (msg === 'ready') {
        clearTimeout(timeout)
        resolve()
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      reject(new Error(`Failed to spawn daemon: ${err.message}`))
    })

    child.on('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Daemon exited immediately with code ${code}. Check ${getLogPath()}`))
    })
  })

  child.unref()
  child.disconnect()
}

export async function sendCommand(req: RpcRequest): Promise<RpcResponse> {
  try {
    const { data } = await httpRequest('POST', '/rpc', req)
    return JSON.parse(data)
  } catch (e) {
    // If connection fails, daemon may have crashed — try once to restart
    if (await isDaemonRunning()) {
      throw e
    }
    await ensureDaemon()
    const { data } = await httpRequest('POST', '/rpc', req)
    return JSON.parse(data)
  }
}

export async function sendStreamingCommand(
  req: RpcRequest,
  onChunk: (chunk: RpcStreamChunk) => void,
): Promise<RpcResponse> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      socketPath: getSocketPath(),
      path: '/rpc/stream',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }

    const httpReq = http.request(options, (res) => {
      let buffer = ''
      let finalResponse: RpcResponse | null = null

      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split('\n')
        buffer = lines.pop()! // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line) as RpcStreamChunk
            if (parsed.type === 'result') {
              finalResponse = { ok: true, result: parsed.data }
            } else if (parsed.type === 'error') {
              finalResponse = { ok: false, error: parsed.data as string }
            } else {
              onChunk(parsed)
            }
          } catch { /* skip malformed lines */ }
        }
      })

      res.on('end', () => {
        // Process any remaining data in buffer
        if (buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer) as RpcStreamChunk
            if (parsed.type === 'result') {
              finalResponse = { ok: true, result: parsed.data }
            } else if (parsed.type === 'error') {
              finalResponse = { ok: false, error: parsed.data as string }
            } else {
              onChunk(parsed)
            }
          } catch { /* skip */ }
        }
        resolve(finalResponse ?? { ok: false, error: 'No response from daemon' })
      })
    })

    httpReq.on('error', reject)
    httpReq.write(JSON.stringify(req))
    httpReq.end()
  })
}

export async function stopDaemon(): Promise<boolean> {
  if (!(await isDaemonRunning())) return false

  try {
    await httpRequest('POST', '/daemon/stop')
    // Wait for process to exit
    const pidPath = getPidPath()
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (!existsSync(pidPath)) return true
    }
    return true
  } catch {
    return false
  }
}

export async function getDaemonStatus(): Promise<{ running: boolean; pid?: number; uptime?: number; viewerPort?: number }> {
  try {
    const { data, statusCode } = await httpRequest('GET', '/health')
    if (statusCode === 200) {
      const health = JSON.parse(data)
      return { running: true, pid: health.pid, uptime: health.uptime, viewerPort: health.viewerPort }
    }
  } catch { /* not running */ }
  return { running: false }
}
