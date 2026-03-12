import { exec } from 'child_process'
import { promisify } from 'util'
import type { PlatformProvider, DeviceInfo, DeviceClient, AppInfo, ScanRegion } from '../types.js'
import { IDBClient, getIDBClient, resolveBootedUdid } from './idb-client.js'
import { AXScanClient } from './ax-scan-client.js'
import { WDAClient } from './wda-client.js'
import { wdaManager } from './wda-manager.js'
import { wdaScanGrid } from './wda-scan.js'
import { listPhysicalDevices } from './device-discovery.js'

const execAsync = promisify(exec)

const SIMULATOR_UUID_RE = /^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/

function isPhysicalDeviceUdid(udid: string): boolean {
  if (udid === 'booted') return false
  return !SIMULATOR_UUID_RE.test(udid)
}

async function listBootedSimulators(): Promise<{ udid: string; name: string; state: string }[]> {
  try {
    const { stdout } = await execAsync('xcrun simctl list devices booted -j', { timeout: 10000 })
    const data = JSON.parse(stdout)
    const simulators: { udid: string; name: string; state: string }[] = []
    for (const runtime of Object.values(data.devices) as { udid: string; name: string; state: string }[][]) {
      for (const device of runtime) {
        if (device.state === 'Booted') {
          simulators.push({ udid: device.udid, name: device.name, state: device.state })
        }
      }
    }
    return simulators
  } catch {
    return []
  }
}

export class IosPlatformProvider implements PlatformProvider {
  name = 'ios'

  async listDevices(): Promise<DeviceInfo[]> {
    const [simulators, physicalDevices] = await Promise.all([
      listBootedSimulators(),
      listPhysicalDevices(),
    ])

    const devices: DeviceInfo[] = []

    for (const sim of simulators) {
      devices.push({
        udid: sim.udid,
        name: sim.name,
        platform: 'ios',
        model: sim.name,
        state: 'Booted',
        connectionType: 'simulator',
      })
    }

    for (const phy of physicalDevices) {
      devices.push({
        udid: phy.udid,
        name: phy.name,
        platform: 'ios',
        model: phy.model,
        state: phy.wdaRunning ? 'Ready' : 'Connected',
        connectionType: phy.connectionType,
      })
    }

    return devices
  }

  async getClient(udid: string): Promise<DeviceClient> {
    const resolvedUdid = udid === 'booted' ? await resolveBootedUdid() : udid
    if (isPhysicalDeviceUdid(resolvedUdid)) {
      const existing = WDAClient.getExistingInstance(resolvedUdid)
      if (existing) return existing

      const tunnelIP = await wdaManager.getTunnelAddress(resolvedUdid)
      return WDAClient.getInstance(resolvedUdid, 8100, tunnelIP)
    }
    return getIDBClient(resolvedUdid)
  }

  async getScreenSize(udid: string): Promise<{ width: number; height: number }> {
    const resolvedUdid = udid === 'booted' ? await resolveBootedUdid() : udid
    if (isPhysicalDeviceUdid(resolvedUdid)) {
      const client = await this.getClient(resolvedUdid) as WDAClient
      return client.getWindowSize()
    }
    const axClient = AXScanClient.getInstance(resolvedUdid)
    return axClient.getScreenSize()
  }

  async scanUi(udid: string, region: ScanRegion): Promise<unknown[]> {
    const resolvedUdid = udid === 'booted' ? await resolveBootedUdid() : udid
    if (isPhysicalDeviceUdid(resolvedUdid)) {
      const client = await this.getClient(resolvedUdid) as WDAClient
      return wdaScanGrid(client, region)
    }
    const axClient = AXScanClient.getInstance(resolvedUdid)
    return axClient.scan(region)
  }

  async setupDevice(udid: string, onProgress?: (msg: string) => void, teamId?: string): Promise<void> {
    await wdaManager.setupDevice(udid, onProgress ? (p) => onProgress(p.message) : undefined, 8100, teamId)
  }

  async listApps(udid: string): Promise<AppInfo[]> {
    const resolvedUdid = udid === 'booted' ? await resolveBootedUdid() : udid
    if (isPhysicalDeviceUdid(resolvedUdid)) {
      throw new Error('list_apps is not yet supported for physical devices via WDA.')
    }
    const client = IDBClient.getInstance(resolvedUdid)
    return client.listApps()
  }

  async launchApp(udid: string, bundleId: string): Promise<void> {
    const resolvedUdid = udid === 'booted' ? await resolveBootedUdid() : udid
    if (isPhysicalDeviceUdid(resolvedUdid)) {
      const client = await this.getClient(resolvedUdid) as WDAClient
      await client.activateApp(bundleId)
    } else {
      const client = getIDBClient(resolvedUdid)
      await client.launch(bundleId)
    }
  }

  isPhysicalDevice(udid: string): boolean {
    return isPhysicalDeviceUdid(udid)
  }
}
