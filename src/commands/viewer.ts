import type { Command } from 'commander'
import { createViewerServer } from '../viewer/server.js'

export function registerViewerCommand(program: Command): void {
  program
    .command('viewer')
    .description('Start a live screen viewer server')
    .option('--port <n>', 'Port to listen on', '5150')
    .action(async (cmdOpts: { port: string }) => {
      const port = parseInt(cmdOpts.port, 10)
      const { start } = createViewerServer()
      const boundPort = await start(port)
      console.log(`Viewer server running at http://localhost:${boundPort}`)
      console.log('Open in browser with ?udid=DEVICE_UDID to view a device screen.')
      console.log('Press Ctrl+C to stop.')
    })
}
