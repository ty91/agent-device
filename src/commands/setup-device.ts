import type { Command } from 'commander'
import * as registry from '../platform/registry.js'
import { output } from '../util/output.js'

export function registerSetupDeviceCommand(program: Command): void {
  program
    .command('setup-device')
    .description('Initialize a physical device (build/install WebDriverAgent for iOS)')
    .argument('<udid>', 'Device UDID')
    .option('--team-id <id>', 'Apple Development Team ID (auto-detected if omitted)')
    .action(async (udid: string, cmdOpts: { teamId?: string }) => {
      const opts = program.opts()

      // Find which provider owns this device
      const devices = await registry.listAllDevices()
      const device = devices.find(d => d.udid === udid)
      if (!device) {
        console.error(`Device "${udid}" not found. Run 'agent-device list-devices' to see available devices.`)
        process.exit(1)
      }

      const provider = registry.getProvider(device.platform)
      if (!provider.setupDevice) {
        console.error(`setup-device is not supported for platform "${provider.name}"`)
        process.exit(1)
      }

      await provider.setupDevice(udid, (msg) => {
        process.stderr.write(`  ${msg}\n`)
      }, cmdOpts.teamId)

      let screenSize: { width: number; height: number } | null = null
      try {
        screenSize = await provider.getScreenSize(udid)
      } catch { /* unavailable */ }

      output(opts.json
        ? { status: 'ready', udid, screen_size: screenSize }
        : `Device ${udid} is ready.${screenSize ? ` Screen: ${screenSize.width}x${screenSize.height}` : ''}`,
      opts)
    })
}
