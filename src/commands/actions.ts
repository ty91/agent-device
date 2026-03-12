import type { Command } from 'commander'
import { readFileSync } from 'fs'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'

export function registerActionsCommand(program: Command): void {
  program
    .command('actions')
    .description('Execute multiple device actions in sequence (JSON input)')
    .option('--file <path>', 'JSON file with array of actions')
    .option('--udid <id>', 'Device identifier')
    .option('--describe-after', 'Describe screen after all actions')
    .action(async (cmdOpts: { file?: string; udid?: string; describeAfter?: boolean }) => {
      const opts = program.opts()

      // Read JSON input on the CLI side (stdin is only available here)
      let actionsJson: string
      if (cmdOpts.file) {
        actionsJson = readFileSync(cmdOpts.file, 'utf-8')
      } else {
        const chunks: Buffer[] = []
        for await (const chunk of process.stdin) {
          chunks.push(chunk)
        }
        actionsJson = Buffer.concat(chunks).toString('utf-8')
      }

      await ensureDaemon()
      const response = await sendCommand({
        command: 'actions',
        args: {
          actionsJson,
          udid: cmdOpts.udid,
          describeAfter: cmdOpts.describeAfter,
        },
      })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      output(response.result, opts)
    })
}
