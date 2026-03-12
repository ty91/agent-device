import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'

export function registerViewerCommand(program: Command): void {
  program
    .command('viewer')
    .description('Start a live screen viewer server')
    .action(async () => {
      await ensureDaemon()
      const response = await sendCommand({ command: 'viewer', args: {} })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      const result = response.result as { viewerPort: number }
      console.log(`Viewer running at http://localhost:${result.viewerPort}`)
      console.log('Open in browser with ?udid=DEVICE_UDID to view a device screen.')
    })
}
