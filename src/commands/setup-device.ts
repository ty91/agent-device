import type { Command } from 'commander'
import { ensureDaemon, sendStreamingCommand } from '../daemon/client.js'
import { output } from '../util/output.js'
import type { RpcStreamChunk } from '../daemon/protocol.js'

export function registerSetupDeviceCommand(program: Command): void {
  program
    .command('setup-device')
    .description('Initialize a physical device (build/install WebDriverAgent for iOS)')
    .argument('<udid>', 'Device UDID')
    .option('--team-id <id>', 'Apple Development Team ID (auto-detected if omitted)')
    .action(async (udid: string, cmdOpts: { teamId?: string }) => {
      const opts = program.opts()
      await ensureDaemon()

      const response = await sendStreamingCommand(
        { command: 'setup-device', args: { udid, teamId: cmdOpts.teamId } },
        (chunk: RpcStreamChunk) => {
          if (chunk.type === 'progress') {
            process.stderr.write(`  ${chunk.data}\n`)
          }
        },
      )

      if (!response.ok) {
        process.stderr.write((response.error ?? 'Unknown error') + '\n')
        process.exit(response.exitCode ?? 1)
      }

      const result = response.result as { status: string; udid: string; screen_size: { width: number; height: number } | null }
      output(opts.json
        ? result
        : `Device ${result.udid} is ready.${result.screen_size ? ` Screen: ${result.screen_size.width}x${result.screen_size.height}` : ''}`,
      opts)
    })
}
