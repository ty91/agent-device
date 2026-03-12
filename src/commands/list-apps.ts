import type { Command } from 'commander'
import * as registry from '../platform/registry.js'
import { output } from '../util/output.js'

export function registerListAppsCommand(program: Command): void {
  program
    .command('list-apps')
    .description('List installed apps on the device')
    .option('--udid <id>', 'Device identifier')
    .action(async (cmdOpts: { udid?: string }) => {
      const opts = program.opts()
      const udid = cmdOpts.udid ?? (await resolveDefaultUdid())
      const { provider } = await registry.resolveDevice(udid)

      if (!provider.listApps) {
        console.error(`list-apps is not supported for platform "${provider.name}"`)
        process.exit(1)
      }

      const apps = await provider.listApps(udid)

      if (opts.json) {
        output(apps, opts)
        return
      }

      const userApps = apps.filter(a => a.type === 'User')
      const systemApps = apps.filter(a => a.type === 'System')

      console.log(`User apps (${userApps.length}):`)
      for (const app of userApps) {
        console.log(`  ${app.name} — ${app.bundleId}`)
      }
      console.log(`\nSystem apps (${systemApps.length}):`)
      for (const app of systemApps) {
        console.log(`  ${app.name} — ${app.bundleId}`)
      }
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
