import type { Command } from 'commander'
import { ensureDaemon, sendCommand } from '../daemon/client.js'
import { output } from '../util/output.js'

const VALID_ACTIONS = ['tap', 'swipe', 'button', 'input-text', 'key', 'key-sequence']

export function registerActionCommand(program: Command): void {
  program
    .command('action')
    .description('Execute a single device action (tap, swipe, button, input-text, key, key-sequence)')
    .argument('<type>', `Action type (${VALID_ACTIONS.join(', ')})`)
    .option('--x <n>', 'X coordinate', parseFloat)
    .option('--y <n>', 'Y coordinate', parseFloat)
    .option('--from-x <n>', 'Starting X coordinate (swipe)', parseFloat)
    .option('--from-y <n>', 'Starting Y coordinate (swipe)', parseFloat)
    .option('--to-x <n>', 'Ending X coordinate (swipe)', parseFloat)
    .option('--to-y <n>', 'Ending Y coordinate (swipe)', parseFloat)
    .option('--text <text>', 'Text to type')
    .option('--button <name>', 'Button name (HOME, LOCK, SIDE_BUTTON, APPLE_PAY, SIRI)')
    .option('--key <value>', 'HID keycode or character')
    .option('--keys <values...>', 'Key sequence (space-separated)')
    .option('--duration <n>', 'Duration in seconds', parseFloat)
    .option('--delta <n>', 'Pixels between swipe touch points', parseFloat)
    .option('--udid <id>', 'Device identifier')
    .option('--describe-after', 'Describe screen after action')
    .action(async (actionType: string, cmdOpts: Record<string, unknown>) => {
      const opts = program.opts()
      await ensureDaemon()
      const response = await sendCommand({
        command: 'action',
        args: {
          type: actionType,
          x: cmdOpts.x,
          y: cmdOpts.y,
          fromX: cmdOpts.fromX,
          fromY: cmdOpts.fromY,
          toX: cmdOpts.toX,
          toY: cmdOpts.toY,
          text: cmdOpts.text,
          button: cmdOpts.button,
          key: cmdOpts.key,
          keys: cmdOpts.keys,
          duration: cmdOpts.duration,
          delta: cmdOpts.delta,
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
