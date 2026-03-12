import type { Command } from 'commander'
import * as registry from '../platform/registry.js'
import { applyScanUiFilters } from '../platform/ui-filters.js'
import type { ScanRegion, UIElement } from '../platform/types.js'
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
      if (!VALID_REGIONS.includes(region)) {
        console.error(`Invalid region "${region}". Must be one of: ${VALID_REGIONS.join(', ')}`)
        process.exit(1)
      }

      const udid = cmdOpts.udid ?? (await resolveDefaultUdid())
      const { provider } = await registry.resolveDevice(udid)

      let rawElements: unknown[]
      let screenWidth = 393, screenHeight = 852

      if (provider.scanUi) {
        rawElements = await provider.scanUi(udid, region as ScanRegion)
      } else {
        const client = await provider.getClient(udid)
        const raw = await client.describeAll(false)
        rawElements = Array.isArray(raw) ? raw : [raw]
      }

      try {
        const size = await provider.getScreenSize(udid)
        screenWidth = size.width
        screenHeight = size.height
      } catch { /* use defaults */ }

      const { elements, warning } = applyScanUiFilters(rawElements as UIElement[], screenWidth, screenHeight, cmdOpts.query)

      if (warning) {
        console.error(`Warning: ${warning}`)
      }

      output(elements, opts)
    })
}

async function resolveDefaultUdid(): Promise<string> {
  const ctx = await registry.detectContext()
  if (ctx.target === 'single') return ctx.devices[0].udid
  if (ctx.target === 'none') {
    console.error('No devices found. Boot a simulator or connect a device.')
    process.exit(1)
  }
  console.error('Multiple devices found. Use --udid to specify one.')
  process.exit(1)
}
