import type { Command } from 'commander'
import { z } from 'zod'
import * as registry from '../platform/registry.js'
import { output } from '../util/output.js'

const tapParamsSchema = z.object({
  x: z.number(),
  y: z.number(),
  duration: z.number().optional(),
})

const swipeParamsSchema = z.object({
  fromX: z.number(),
  fromY: z.number(),
  toX: z.number(),
  toY: z.number(),
  duration: z.number().optional(),
  delta: z.number().optional(),
})

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
      if (!VALID_ACTIONS.includes(actionType)) {
        console.error(`Invalid action "${actionType}". Must be one of: ${VALID_ACTIONS.join(', ')}`)
        process.exit(1)
      }

      const udid = (cmdOpts.udid as string) ?? (await resolveDefaultUdid())
      const { client } = await registry.resolveClient(udid)
      let actionResult = 'Action completed successfully'

      switch (actionType) {
        case 'tap': {
          const p = tapParamsSchema.parse({ x: cmdOpts.x, y: cmdOpts.y, duration: cmdOpts.duration })
          await client.tap(p.x, p.y, p.duration)
          actionResult = `Tapped at (${p.x}, ${p.y})`
          break
        }
        case 'swipe': {
          const p = swipeParamsSchema.parse({
            fromX: cmdOpts.fromX, fromY: cmdOpts.fromY,
            toX: cmdOpts.toX, toY: cmdOpts.toY,
            duration: cmdOpts.duration, delta: cmdOpts.delta,
          })
          await client.swipe(p.fromX, p.fromY, p.toX, p.toY, p.duration, p.delta)
          actionResult = `Swiped from (${p.fromX}, ${p.fromY}) to (${p.toX}, ${p.toY})`
          break
        }
        case 'button': {
          const button = cmdOpts.button as string
          if (!button) { console.error('--button is required'); process.exit(1) }
          await client.pressButton(button, cmdOpts.duration as number | undefined)
          actionResult = `Pressed ${button} button`
          break
        }
        case 'input-text': {
          const text = cmdOpts.text as string
          if (!text) { console.error('--text is required'); process.exit(1) }
          await client.inputText(text)
          actionResult = `Typed text: "${text}"`
          break
        }
        case 'key': {
          const key = cmdOpts.key as string
          if (key === undefined) { console.error('--key is required'); process.exit(1) }
          const keyValue = /^\d+$/.test(key) ? Number(key) : key
          await client.pressKey(keyValue, cmdOpts.duration as number | undefined)
          actionResult = `Pressed key: ${keyValue}`
          break
        }
        case 'key-sequence': {
          const keys = cmdOpts.keys as string[]
          if (!keys || keys.length === 0) { console.error('--keys is required'); process.exit(1) }
          const keyValues = keys.map(k => /^\d+$/.test(k) ? Number(k) : k)
          await client.pressKeySequence(keyValues)
          actionResult = `Pressed key sequence: ${keyValues.join(', ')}`
          break
        }
      }

      let descriptionResult: unknown = null
      if (cmdOpts.describeAfter) {
        await new Promise(resolve => setTimeout(resolve, 500))
        descriptionResult = await client.describeAll(false)
      }

      const result: { action_result: string; screen_description?: unknown } = { action_result: actionResult }
      if (descriptionResult) result.screen_description = descriptionResult

      output(result, opts)
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
