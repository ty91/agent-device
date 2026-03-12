import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'
import type { AppInfo } from '../platform/types.js'

export function registerListAppsCommand(program: Command): void {
  program
    .command('list-apps')
    .description('List installed apps on the device')
    .option('--udid <id>', 'Device identifier')
    .action(async (cmdOpts: { udid?: string }) => {
      const opts = program.opts()
      await ensureDaemon()
      const response = await sendCommand({
        command: 'list-apps',
        args: { udid: cmdOpts.udid },
      })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      const apps = response.result as AppInfo[]

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
