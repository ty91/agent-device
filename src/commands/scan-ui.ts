import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'

const VALID_REGIONS = ['full', 'top-half', 'bottom-half', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

export function registerScanUiCommand(program: Command): void {
  program
    .command('scan-ui')
    .description('Find interactive UI elements on the current screen')
    .argument('<region>', `Screen region to scan (${VALID_REGIONS.join(', ')})`)
    .option('--query <text>', 'Search for elements matching this text')
    .option('--udid <id>', 'Device identifier')
    .action(async (region: string, cmdOpts: { query?: string; udid?: string }) => {
      const opts = program.opts()
      await ensureDaemon()
      const response = await sendCommand({
        command: 'scan-ui',
        args: { region, query: cmdOpts.query, udid: cmdOpts.udid },
      })

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      const result = response.result as { elements: unknown[]; warning?: string }
      if (result.warning) {
        console.error(`Warning: ${result.warning}`)
      }

      output(result.elements, opts)
    })
}
