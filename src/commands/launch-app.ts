import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'

export function registerLaunchAppCommand(program: Command): void {
  program
    .command('launch-app')
    .description('Launch an app by bundle ID')
    .argument('<bundleId>', 'Bundle identifier (e.g. com.apple.mobilesafari)')
    .option('--udid <id>', 'Device identifier')
    .action(async (bundleId: string, cmdOpts: { udid?: string }) => {
      const opts = program.opts()
      await ensureDaemon()
      const response = await sendCommand({
        command: 'launch-app',
        args: { bundleId, udid: cmdOpts.udid },
      })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      const result = response.result as { launched: string }
      output(opts.json ? result : `Launched ${result.launched}`, opts)
    })
}
