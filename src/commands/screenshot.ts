import type { Command } from 'commander'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import * as registry from '../platform/registry.js'
import { output } from '../util/output.js'

const execFileAsync = promisify(execFile)

export function registerScreenshotCommand(program: Command): void {
  program
    .command('screenshot')
    .description('Capture a screenshot of the current device screen')
    .option('--udid <id>', 'Device identifier')
    .option('--output <path>', 'Output file path (default: temp file)')
    .action(async (cmdOpts: { udid?: string; output?: string }) => {
      const opts = program.opts()
      const udid = cmdOpts.udid ?? (await resolveDefaultUdid())
      const { client } = await registry.resolveClient(udid)

      const timestamp = Date.now()
      const rawFile = path.join(os.tmpdir(), `agent-device-screenshot-${timestamp}.png`)
      const outFile = cmdOpts.output ?? path.join(os.tmpdir(), `agent-device-screenshot-${timestamp}-sm.png`)

      const pngBuffer = await client.screenshot()
      await fs.writeFile(rawFile, pngBuffer)

      if (!cmdOpts.output) {
        // Resize to 1/3 for smaller file
        try {
          const sizeOutput = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', rawFile], { timeout: 5000 })
          const widthMatch = sizeOutput.stdout.match(/pixelWidth:\s*(\d+)/)
          const heightMatch = sizeOutput.stdout.match(/pixelHeight:\s*(\d+)/)
          if (widthMatch && heightMatch) {
            const targetWidth = Math.round(Number(widthMatch[1]) / 3)
            const targetHeight = Math.round(Number(heightMatch[1]) / 3)
            await execFileAsync(
              'sips',
              ['--resampleWidth', String(targetWidth), '--resampleHeight', String(targetHeight), rawFile, '--out', outFile],
              { timeout: 5000 }
            )
            await fs.unlink(rawFile).catch(() => {})
          }
        } catch {
          // sips failed — use raw file
          await fs.rename(rawFile, outFile).catch(() => {})
        }
      } else {
        await fs.rename(rawFile, outFile).catch(() => {})
      }

      output(opts.json ? { path: outFile } : outFile, opts)
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
