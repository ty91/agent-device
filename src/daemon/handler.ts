import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as registry from '../platform/registry.js'
import { applyScanUiFilters, applyDescribeScreenFilters } from '../platform/ui-filters.js'
import type { ScanRegion, UIElement } from '../platform/types.js'
import type { RpcResponse, RpcStreamChunk } from './protocol.js'

const execFileAsync = promisify(execFile)

// ── shared helper ────────────────────────────────────────────────

async function resolveDefaultUdid(): Promise<string> {
  const ctx = await registry.detectContext()
  if (ctx.target === 'single') return ctx.devices[0].udid
  if (ctx.target === 'none') throw new Error('No devices found.')
  throw new Error('Multiple devices found. Use --udid to specify one.')
}

function errorResponse(msg: string, exitCode = 1): RpcResponse {
  return { ok: false, error: msg, exitCode }
}

// ── handler types ────────────────────────────────────────────────

type Handler = (args: Record<string, unknown>) => Promise<RpcResponse>
type StreamingHandler = (
  args: Record<string, unknown>,
  onProgress: (chunk: RpcStreamChunk) => void,
) => Promise<RpcResponse>

// ── context ──────────────────────────────────────────────────────

async function handleContext(): Promise<RpcResponse> {
  const ctx = await registry.detectContext()

  if (ctx.target === 'none') {
    return { ok: true, result: { target: 'none', message: 'No device or simulator found. Boot a simulator or connect a device.' } }
  }

  if (ctx.target === 'single') {
    const device = ctx.devices[0]
    let screenSize: { width: number; height: number } | null = null
    try {
      const provider = registry.getProvider(device.platform)
      screenSize = await provider.getScreenSize(device.udid)
    } catch { /* unavailable */ }

    return {
      ok: true,
      result: {
        target: device.connectionType === 'simulator' ? 'simulator' : 'device',
        udid: device.udid,
        name: device.name,
        platform: device.platform,
        model: device.model,
        connection_type: device.connectionType,
        screen_size: screenSize,
      },
    }
  }

  return {
    ok: true,
    result: {
      target: 'ambiguous',
      message: 'Multiple devices found. Specify --udid to target a specific device.',
      devices: ctx.devices,
    },
  }
}

// ── list-devices ─────────────────────────────────────────────────

async function handleListDevices(): Promise<RpcResponse> {
  const devices = await registry.listAllDevices()
  return { ok: true, result: devices }
}

// ── scan-ui ──────────────────────────────────────────────────────

const VALID_REGIONS = ['full', 'top-half', 'bottom-half', 'top-left', 'top-right', 'bottom-left', 'bottom-right']

async function handleScanUi(args: Record<string, unknown>): Promise<RpcResponse> {
  const region = args.region as string
  if (!VALID_REGIONS.includes(region)) {
    return errorResponse(`Invalid region "${region}". Must be one of: ${VALID_REGIONS.join(', ')}`)
  }

  const udid = (args.udid as string) ?? (await resolveDefaultUdid())
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

  const { elements, warning } = applyScanUiFilters(rawElements as UIElement[], screenWidth, screenHeight, args.query as string | undefined)
  return { ok: true, result: { elements, warning } }
}

// ── describe-screen ──────────────────────────────────────────────

async function handleDescribeScreen(args: Record<string, unknown>): Promise<RpcResponse> {
  const udid = (args.udid as string) ?? (await resolveDefaultUdid())
  const { provider } = await registry.resolveDevice(udid)
  const client = await provider.getClient(udid)

  const raw = await client.describeAll((args.nested as boolean) ?? false)
  const rawArray = Array.isArray(raw) ? raw : [raw]

  let screenWidth = 393, screenHeight = 852
  try {
    const size = await provider.getScreenSize(udid)
    screenWidth = size.width
    screenHeight = size.height
  } catch { /* use defaults */ }

  const filtered = applyDescribeScreenFilters(rawArray as UIElement[], screenWidth, screenHeight)
  return { ok: true, result: filtered }
}

// ── action ───────────────────────────────────────────────────────

const VALID_ACTIONS = ['tap', 'swipe', 'button', 'input-text', 'key', 'key-sequence']
const tapParamsSchema = z.object({ x: z.number(), y: z.number(), duration: z.number().optional() })
const swipeParamsSchema = z.object({
  fromX: z.number(), fromY: z.number(),
  toX: z.number(), toY: z.number(),
  duration: z.number().optional(), delta: z.number().optional(),
})

async function handleAction(args: Record<string, unknown>): Promise<RpcResponse> {
  const actionType = args.type as string
  if (!VALID_ACTIONS.includes(actionType)) {
    return errorResponse(`Invalid action "${actionType}". Must be one of: ${VALID_ACTIONS.join(', ')}`)
  }

  const udid = (args.udid as string) ?? (await resolveDefaultUdid())
  const { client } = await registry.resolveClient(udid)
  let actionResult = 'Action completed successfully'

  switch (actionType) {
    case 'tap': {
      const p = tapParamsSchema.parse({ x: args.x, y: args.y, duration: args.duration })
      await client.tap(p.x, p.y, p.duration)
      actionResult = `Tapped at (${p.x}, ${p.y})`
      break
    }
    case 'swipe': {
      const p = swipeParamsSchema.parse({
        fromX: args.fromX, fromY: args.fromY,
        toX: args.toX, toY: args.toY,
        duration: args.duration, delta: args.delta,
      })
      await client.swipe(p.fromX, p.fromY, p.toX, p.toY, p.duration, p.delta)
      actionResult = `Swiped from (${p.fromX}, ${p.fromY}) to (${p.toX}, ${p.toY})`
      break
    }
    case 'button': {
      const button = args.button as string
      if (!button) return errorResponse('--button is required')
      await client.pressButton(button, args.duration as number | undefined)
      actionResult = `Pressed ${button} button`
      break
    }
    case 'input-text': {
      const text = args.text as string
      if (!text) return errorResponse('--text is required')
      await client.inputText(text)
      actionResult = `Typed text: "${text}"`
      break
    }
    case 'key': {
      const key = args.key as string
      if (key === undefined) return errorResponse('--key is required')
      const keyValue = /^\d+$/.test(key) ? Number(key) : key
      await client.pressKey(keyValue, args.duration as number | undefined)
      actionResult = `Pressed key: ${keyValue}`
      break
    }
    case 'key-sequence': {
      const keys = args.keys as string[]
      if (!keys || keys.length === 0) return errorResponse('--keys is required')
      const keyValues = keys.map((k: string) => /^\d+$/.test(k) ? Number(k) : k)
      await client.pressKeySequence(keyValues)
      actionResult = `Pressed key sequence: ${keyValues.join(', ')}`
      break
    }
  }

  let descriptionResult: unknown = null
  if (args.describeAfter) {
    await new Promise(resolve => setTimeout(resolve, 500))
    descriptionResult = await client.describeAll(false)
  }

  const result: { action_result: string; screen_description?: unknown } = { action_result: actionResult }
  if (descriptionResult) result.screen_description = descriptionResult
  return { ok: true, result }
}

// ── actions ──────────────────────────────────────────────────────

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

async function handleActions(args: Record<string, unknown>): Promise<RpcResponse> {
  let jsonInput: string
  if (args.file) {
    jsonInput = readFileSync(args.file as string, 'utf-8')
  } else if (args.actionsJson) {
    jsonInput = args.actionsJson as string
  } else {
    return errorResponse('--file or stdin JSON required')
  }

  const rawActions = JSON.parse(jsonInput)
  const actions = z.array(singleActionSchema).parse(rawActions)

  const udid = (args.udid as string) ?? (await resolveDefaultUdid())
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
  if (args.describeAfter) {
    await new Promise(resolve => setTimeout(resolve, 500))
    descriptionResult = await client.describeAll(false)
  }

  const result: { action_results: string[]; screen_description?: unknown } = { action_results: results }
  if (descriptionResult) result.screen_description = descriptionResult
  return { ok: true, result }
}

// ── screenshot ───────────────────────────────────────────────────

async function handleScreenshot(args: Record<string, unknown>): Promise<RpcResponse> {
  const udid = (args.udid as string) ?? (await resolveDefaultUdid())
  const { client } = await registry.resolveClient(udid)

  const timestamp = Date.now()
  const rawFile = path.join(os.tmpdir(), `agent-device-screenshot-${timestamp}.png`)
  const outFile = (args.output as string) ?? path.join(os.tmpdir(), `agent-device-screenshot-${timestamp}-sm.png`)

  const pngBuffer = await client.screenshot()
  await fs.writeFile(rawFile, pngBuffer)

  if (!args.output) {
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
          { timeout: 5000 },
        )
        await fs.unlink(rawFile).catch(() => {})
      }
    } catch {
      await fs.rename(rawFile, outFile).catch(() => {})
    }
  } else {
    await fs.rename(rawFile, outFile).catch(() => {})
  }

  return { ok: true, result: { path: outFile } }
}

// ── launch-app ───────────────────────────────────────────────────

async function handleLaunchApp(args: Record<string, unknown>): Promise<RpcResponse> {
  const bundleId = args.bundleId as string
  if (!bundleId) return errorResponse('bundleId is required')

  const udid = (args.udid as string) ?? (await resolveDefaultUdid())
  const { provider } = await registry.resolveDevice(udid)

  if (!provider.launchApp) {
    return errorResponse(`launch-app is not supported for platform "${provider.name}"`)
  }

  await provider.launchApp(udid, bundleId)
  return { ok: true, result: { launched: bundleId } }
}

// ── list-apps ────────────────────────────────────────────────────

async function handleListApps(args: Record<string, unknown>): Promise<RpcResponse> {
  const udid = (args.udid as string) ?? (await resolveDefaultUdid())
  const { provider } = await registry.resolveDevice(udid)

  if (!provider.listApps) {
    return errorResponse(`list-apps is not supported for platform "${provider.name}"`)
  }

  const apps = await provider.listApps(udid)
  return { ok: true, result: apps }
}

// ── setup-device (streaming) ─────────────────────────────────────

async function handleSetupDevice(
  args: Record<string, unknown>,
  onProgress: (chunk: RpcStreamChunk) => void,
): Promise<RpcResponse> {
  const udid = args.udid as string
  if (!udid) return errorResponse('udid is required')

  const devices = await registry.listAllDevices()
  const device = devices.find(d => d.udid === udid)
  if (!device) return errorResponse(`Device "${udid}" not found. Run 'agent-device list-devices' to see available devices.`)

  const provider = registry.getProvider(device.platform)
  if (!provider.setupDevice) {
    return errorResponse(`setup-device is not supported for platform "${provider.name}"`)
  }

  await provider.setupDevice(udid, (msg) => {
    onProgress({ type: 'progress', data: msg })
  }, args.teamId as string | undefined, args.forceBuild as boolean | undefined)

  let screenSize: { width: number; height: number } | null = null
  try {
    screenSize = await provider.getScreenSize(udid)
  } catch { /* unavailable */ }

  return { ok: true, result: { status: 'ready', udid, screen_size: screenSize } }
}

// ── viewer ───────────────────────────────────────────────────────

function handleViewer(args: Record<string, unknown>, viewerPort: number): RpcResponse {
  return { ok: true, result: { viewerPort } }
}

// ── dispatch ─────────────────────────────────────────────────────

export async function dispatch(
  command: string,
  args: Record<string, unknown>,
  extra: { viewerPort: number },
): Promise<RpcResponse> {
  try {
    switch (command) {
      case 'context': return await handleContext()
      case 'list-devices': return await handleListDevices()
      case 'scan-ui': return await handleScanUi(args)
      case 'describe-screen': return await handleDescribeScreen(args)
      case 'action': return await handleAction(args)
      case 'actions': return await handleActions(args)
      case 'screenshot': return await handleScreenshot(args)
      case 'launch-app': return await handleLaunchApp(args)
      case 'list-apps': return await handleListApps(args)
      case 'viewer': return handleViewer(args, extra.viewerPort)
      default: return errorResponse(`Unknown command: ${command}`)
    }
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e))
  }
}

export async function dispatchStreaming(
  command: string,
  args: Record<string, unknown>,
  onProgress: (chunk: RpcStreamChunk) => void,
): Promise<RpcResponse> {
  try {
    switch (command) {
      case 'setup-device': return await handleSetupDevice(args, onProgress)
      default: return errorResponse(`Unknown streaming command: ${command}`)
    }
  } catch (e) {
    return errorResponse(e instanceof Error ? e.message : String(e))
  }
}
