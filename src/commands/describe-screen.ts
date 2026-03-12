import type { Command } from 'commander'
import * as registry from '../platform/registry.js'
import { applyDescribeScreenFilters } from '../platform/ui-filters.js'
import type { UIElement } from '../platform/types.js'
import { output } from '../util/output.js'

export function registerDescribeScreenCommand(program: Command): void {
  program
    .command('describe-screen')
    .description('Get the full UI element hierarchy of the current screen')
    .option('--udid <id>', 'Device identifier')
    .option('--nested', 'Include nested element hierarchy')
    .action(async (cmdOpts: { udid?: string; nested?: boolean }) => {
      const opts = program.opts()
      const udid = cmdOpts.udid ?? (await resolveDefaultUdid())
      const { provider } = await registry.resolveDevice(udid)
      const client = await provider.getClient(udid)

      const raw = await client.describeAll(cmdOpts.nested ?? false)
      const rawArray = Array.isArray(raw) ? raw : [raw]

      let screenWidth = 393, screenHeight = 852
      try {
        const size = await provider.getScreenSize(udid)
        screenWidth = size.width
        screenHeight = size.height
      } catch { /* use defaults */ }

      const filtered = applyDescribeScreenFilters(rawArray as UIElement[], screenWidth, screenHeight)
      output(filtered, opts)
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
