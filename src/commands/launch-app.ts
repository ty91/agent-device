import type { Command } from 'commander'
import * as registry from '../platform/registry.js'
import { output } from '../util/output.js'

export function registerLaunchAppCommand(program: Command): void {
  program
    .command('launch-app')
    .description('Launch an app by bundle ID')
    .argument('<bundleId>', 'Bundle identifier (e.g. com.apple.mobilesafari)')
    .option('--udid <id>', 'Device identifier')
    .action(async (bundleId: string, cmdOpts: { udid?: string }) => {
      const opts = program.opts()
      const udid = cmdOpts.udid ?? (await resolveDefaultUdid())
      const { provider } = await registry.resolveDevice(udid)

      if (!provider.launchApp) {
        console.error(`launch-app is not supported for platform "${provider.name}"`)
        process.exit(1)
      }

      await provider.launchApp(udid, bundleId)
      output(opts.json ? { launched: bundleId } : `Launched ${bundleId}`, opts)
    })
}

async function resolveDefaultUdid(): Promise<string> {
  const ctx = await registry.detectContext()
  if (ctx.target === 'single') return ctx.devices[0].udid
  if (ctx.target === 'none') {
    console.error('No devices found.')
    process.exit(1)
  }
  console.error('Multiple devices found. Use --udid to specify one.')
  process.exit(1)
}
