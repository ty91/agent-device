import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'

export function registerScreenshotCommand(program: Command): void {
  program
    .command('screenshot')
    .description('Capture a screenshot of the current device screen')
    .option('--udid <id>', 'Device identifier')
    .option('--output <path>', 'Output file path (default: temp file)')
    .action(async (cmdOpts: { udid?: string; output?: string }) => {
      const opts = program.opts()
      await ensureDaemon()
      const response = await sendCommand({
        command: 'screenshot',
        args: { udid: cmdOpts.udid, output: cmdOpts.output },
      })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      const result = response.result as { path: string }
      output(opts.json ? result : result.path, opts)
    })
}
