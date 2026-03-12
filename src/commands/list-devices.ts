import type { Command } from 'commander'
import * as registry from '../platform/registry.js'
import { output } from '../util/output.js'

export function registerListDevicesCommand(program: Command): void {
  program
    .command('list-devices')
    .description('List all available devices and simulators')
    .action(async () => {
      const opts = program.opts()
      const devices = await registry.listAllDevices()

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
