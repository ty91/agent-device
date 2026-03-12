import type { PlatformProvider, DeviceInfo, DeviceClient } from './types.js'

const providers: PlatformProvider[] = []

export function register(provider: PlatformProvider): void {
  providers.push(provider)
}

export function getProvider(name: string): PlatformProvider {
  const p = providers.find(p => p.name === name)
  if (!p) throw new Error(`Platform "${name}" not registered`)
  return p
}

export function getAllProviders(): PlatformProvider[] {
  return [...providers]
}

export async function listAllDevices(): Promise<DeviceInfo[]> {
  const results = await Promise.all(providers.map(p => p.listDevices()))
  return results.flat()
}

export async function resolveDevice(udid: string): Promise<{ provider: PlatformProvider; device: DeviceInfo }> {
  const allDevices = await listAllDevices()
  const device = allDevices.find(d => d.udid === udid)
  if (!device) throw new Error(`Device "${udid}" not found`)
  const provider = providers.find(p => p.name === device.platform)
  if (!provider) throw new Error(`No provider for platform "${device.platform}"`)
  return { provider, device }
}

export async function resolveClient(udid: string): Promise<{ client: DeviceClient; provider: PlatformProvider; device: DeviceInfo }> {
  const { provider, device } = await resolveDevice(udid)
  const client = await provider.getClient(udid)
  return { client, provider, device }
}

export async function detectContext(): Promise<{
  target: 'single' | 'ambiguous' | 'none'
  devices: DeviceInfo[]
}> {
  const devices = await listAllDevices()
  if (devices.length === 0) return { target: 'none', devices }
  if (devices.length === 1) return { target: 'single', devices }
  return { target: 'ambiguous', devices }
}
