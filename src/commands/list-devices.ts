import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'
import type { DeviceInfo } from '../platform/types.js'

export function registerListDevicesCommand(program: Command): void {
  program
    .command('list-devices')
    .description('List all available devices and simulators')
    .action(async () => {
      const opts = program.opts()
      await ensureDaemon()
      const response = await sendCommand({ command: 'list-devices', args: {} })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      const devices = response.result as DeviceInfo[]

      if (opts.json) {
        output(devices, opts)
        return
      }

      if (devices.length === 0) {
        console.log('No devices found.')
        return
      }

      for (const d of devices) {
        console.log(`[${d.platform}] ${d.name} (${d.model}) — ${d.udid} [${d.state}] ${d.connectionType ?? ''}`)
      }
    })
}
