import type { Command } from 'commander'
import * as registry from '../platform/registry.js'
import { output } from '../util/output.js'

export function registerContextCommand(program: Command): void {
  program
    .command('context')
    .description('Discover available devices and determine execution context')
    .action(async () => {
      const opts = program.opts()
      const ctx = await registry.detectContext()

      if (ctx.target === 'none') {
        output({ target: 'none', message: 'No device or simulator found. Boot a simulator or connect a device.' }, opts)
        process.exit(1)
      }

      if (ctx.target === 'single') {
        const device = ctx.devices[0]
        let screenSize: { width: number; height: number } | null = null
        try {
          const provider = registry.getProvider(device.platform)
          screenSize = await provider.getScreenSize(device.udid)
        } catch { /* unavailable */ }

        output({
          target: device.connectionType === 'simulator' ? 'simulator' : 'device',
          udid: device.udid,
          name: device.name,
          platform: device.platform,
          model: device.model,
          connection_type: device.connectionType,
          screen_size: screenSize,
        }, opts)
        return
      }

      output({
        target: 'ambiguous',
        message: 'Multiple devices found. Specify --udid to target a specific device.',
        devices: ctx.devices,
      }, opts)
    })
}
