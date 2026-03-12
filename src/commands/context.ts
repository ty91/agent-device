import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'

export function registerContextCommand(program: Command): void {
  program
    .command('context')
    .description('Discover available devices and determine execution context')
    .action(async () => {
      const opts = program.opts()
      await ensureDaemon()
      const response = await sendCommand({ command: 'context', args: {} })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      const result = response.result as { target: string }
      if (result.target === 'none') {
        output(result, opts)
        process.exit(1)
      }

      output(result, opts)
    })
}
