#!/usr/bin/env node
import { startDaemon } from './server.js'

startDaemon().catch((err) => {
  process.stderr.write(`Daemon failed to start: ${err}\n`)
  process.exit(1)
})
