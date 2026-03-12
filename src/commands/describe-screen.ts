import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'

export function registerDescribeScreenCommand(program: Command): void {
  program
    .command('describe-screen')
    .description('Get the full UI element hierarchy of the current screen')
    .option('--udid <id>', 'Device identifier')
    .option('--nested', 'Include nested element hierarchy')
    .action(async (cmdOpts: { udid?: string; nested?: boolean }) => {
      const opts = program.opts()
      await ensureDaemon()
      const response = await sendCommand({
        command: 'describe-screen',
        args: { udid: cmdOpts.udid, nested: cmdOpts.nested },
      })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      output(response.result, opts)
    })
}
