import express from 'express'
import { createServer } from 'node:http'
import { writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { getSocketPath, getPidPath } from './paths.js'
import { register } from '../platform/registry.js'
import { IosPlatformProvider } from '../platform/ios/index.js'
import { createViewerServer } from '../viewer/server.js'
import { dispatch, dispatchStreaming } from './handler.js'
import { STREAMING_COMMANDS } from './protocol.js'
import type { RpcRequest, RpcStreamChunk } from './protocol.js'
import { shutdownAllIDBClients } from '../platform/ios/idb-client.js'
import { AXScanClient } from '../platform/ios/ax-scan-client.js'
import { wdaManager } from '../platform/ios/wda-manager.js'
import { log } from '../util/logger.js'

let viewerPort = 0

function cleanup(): void {
  const pidPath = getPidPath()
  const sockPath = getSocketPath()
  try { unlinkSync(pidPath) } catch { /* ignore */ }
  try { unlinkSync(sockPath) } catch { /* ignore */ }
}

async function gracefulShutdown(): Promise<void> {
  log('Daemon', 'log', 'Shutting down...')
  await Promise.allSettled([
    shutdownAllIDBClients(),
    AXScanClient.shutdownAll(),
    wdaManager.shutdownAll(),
  ])
  cleanup()
  log('Daemon', 'log', 'Shutdown complete')
  process.exit(0)
}

export async function startDaemon(): Promise<void> {
  // Register platform
  register(new IosPlatformProvider())

  // Write PID file
  const pidPath = getPidPath()
  writeFileSync(pidPath, String(process.pid))

  // Clean stale socket
  const sockPath = getSocketPath()
  if (existsSync(sockPath)) {
    try { unlinkSync(sockPath) } catch { /* ignore */ }
  }

  // Start viewer server
  const viewer = createViewerServer()
  viewerPort = await viewer.start(5150)
  log('Daemon', 'log', `Viewer server on port ${viewerPort}`)

  // Create RPC server on Unix socket
  const app = express()
  app.use(express.json({ limit: '10mb' }))

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      pid: process.pid,
      uptime: Math.round(process.uptime()),
      viewerPort,
    })
  })

  app.post('/rpc', async (req, res) => {
    const { command, args } = req.body as RpcRequest
    if (STREAMING_COMMANDS.has(command)) {
      res.status(400).json({ ok: false, error: `Use /rpc/stream for command "${command}"` })
      return
    }
    const response = await dispatch(command, args ?? {}, { viewerPort })
    res.json(response)
  })

  app.post('/rpc/stream', async (req, res) => {
    const { command, args } = req.body as RpcRequest
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Transfer-Encoding', 'chunked')

    const onProgress = (chunk: RpcStreamChunk): void => {
      res.write(JSON.stringify(chunk) + '\n')
    }

    const response = await dispatchStreaming(command, args ?? {}, onProgress)
    if (response.ok) {
      res.write(JSON.stringify({ type: 'result', data: response.result }) + '\n')
    } else {
      res.write(JSON.stringify({ type: 'error', data: response.error }) + '\n')
    }
    res.end()
  })

  app.post('/daemon/stop', (_req, res) => {
    res.json({ ok: true })
    setTimeout(() => gracefulShutdown(), 100)
  })

  const httpServer = createServer(app)
  httpServer.listen(sockPath, () => {
    log('Daemon', 'log', `RPC server listening on ${sockPath} (pid ${process.pid})`)
    // Signal readiness to parent via IPC if available
    if (process.send) process.send('ready')
  })

  // Graceful shutdown on signals
  process.on('SIGTERM', () => gracefulShutdown())
  process.on('SIGINT', () => gracefulShutdown())
}
