import type { Command } from 'commander'
import { z } from 'zod'
import { readFileSync } from 'fs'
import * as registry from '../platform/registry.js'
import { output } from '../util/output.js'

const singleActionSchema = z.object({
  action: z.enum(['tap', 'swipe', 'button', 'input-text', 'key', 'key-sequence']),
  params: z.record(z.string(), z.unknown()),
})

const tapSchema = z.object({ x: z.number(), y: z.number(), duration: z.number().optional() })
const swipeSchema = z.object({ fromX: z.number(), fromY: z.number(), toX: z.number(), toY: z.number(), duration: z.number().optional(), delta: z.number().optional() })
const buttonSchema = z.object({ button: z.string(), duration: z.number().optional() })
const inputTextSchema = z.object({ text: z.string() })
const keySchema = z.object({ key: z.union([z.number(), z.string()]), duration: z.number().optional() })
const keySequenceSchema = z.object({ keySequence: z.array(z.union([z.number(), z.string()])) })

export function registerActionsCommand(program: Command): void {
  program
    .command('actions')
    .description('Execute multiple device actions in sequence (JSON input)')
    .option('--file <path>', 'JSON file with array of actions')
    .option('--udid <id>', 'Device identifier')
    .option('--describe-after', 'Describe screen after all actions')
    .action(async (cmdOpts: { file?: string; udid?: string; describeAfter?: boolean }) => {
      const opts = program.opts()

      let jsonInput: string
      if (cmdOpts.file) {
        jsonInput = readFileSync(cmdOpts.file, 'utf-8')
      } else {
        const chunks: Buffer[] = []
        for await (const chunk of process.stdin) {
          chunks.push(chunk)
        }
        jsonInput = Buffer.concat(chunks).toString('utf-8')
      }

      const rawActions = JSON.parse(jsonInput)
      const actions = z.array(singleActionSchema).parse(rawActions)

      const udid = cmdOpts.udid ?? (await resolveDefaultUdid())
      const { client } = await registry.resolveClient(udid)
      const results: string[] = []

      for (const { action, params } of actions) {
        switch (action) {
          case 'tap': {
            const p = tapSchema.parse(params)
            await client.tap(p.x, p.y, p.duration)
            results.push(`Tapped at (${p.x}, ${p.y})`)
            break
          }
          case 'swipe': {
            const p = swipeSchema.parse(params)
            await client.swipe(p.fromX, p.fromY, p.toX, p.toY, p.duration, p.delta)
            results.push(`Swiped from (${p.fromX}, ${p.fromY}) to (${p.toX}, ${p.toY})`)
            break
          }
          case 'button': {
            const p = buttonSchema.parse(params)
            await client.pressButton(p.button, p.duration)
            results.push(`Pressed ${p.button} button`)
            break
          }
          case 'input-text': {
            const p = inputTextSchema.parse(params)
            await client.inputText(p.text)
            results.push(`Typed text: "${p.text}"`)
            break
          }
          case 'key': {
            const p = keySchema.parse(params)
            await client.pressKey(p.key, p.duration)
            results.push(`Pressed key: ${p.key}`)
            break
          }
          case 'key-sequence': {
            const p = keySequenceSchema.parse(params)
            await client.pressKeySequence(p.keySequence)
            results.push(`Pressed key sequence: ${p.keySequence.join(', ')}`)
            break
          }
        }
      }

      let descriptionResult: unknown = null
      if (cmdOpts.describeAfter) {
        await new Promise(resolve => setTimeout(resolve, 500))
        descriptionResult = await client.describeAll(false)
      }

      const result: { action_results: string[]; screen_description?: unknown } = { action_results: results }
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
