export type DeviceClient = {
  tap(x: number, y: number, duration?: number): Promise<void>
  swipe(fromX: number, fromY: number, toX: number, toY: number, duration?: number, delta?: number): Promise<void>
  pressButton(button: string, duration?: number): Promise<void>
  inputText(text: string): Promise<void>
  pressKey(key: number | string, duration?: number): Promise<void>
  pressKeySequence(keys: (number | string)[]): Promise<void>
  describeAll(nested?: boolean): Promise<unknown>
  describePoint(x: number, y: number, nested?: boolean): Promise<unknown>
  screenshot(): Promise<Buffer>
  getScreenSize?(): Promise<{ width: number; height: number }>
}

export type DeviceInfo = {
  udid: string
  name: string
  platform: string
  model: string
  state: string
  connectionType?: string
}

export type AppInfo = {
  bundleId: string
  name: string
  type: 'User' | 'System'
}

export type ScanRegion =
  | 'full'
  | 'top-half'
  | 'bottom-half'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export type ScanCommand = {
  grid_step: number
  x_start: number
  y_start: number
  x_end: number
  y_end: number
}

export type UIElement = {
  type?: string
  AXLabel?: string | null
  label?: string | null
  title?: string | null
  name?: string | null
  AXValue?: string | null
  value?: string | null
  frame?: { x: number; y: number; width: number; height: number }
  [key: string]: unknown
}

export type PlatformProvider = {
  name: string
  listDevices(): Promise<DeviceInfo[]>
  getClient(udid: string): Promise<DeviceClient>
  getScreenSize(udid: string): Promise<{ width: number; height: number }>
  scanUi?(udid: string, region: ScanRegion): Promise<unknown[]>
  setupDevice?(udid: string, onProgress?: (msg: string) => void, teamId?: string, forceBuild?: boolean): Promise<void>
  listApps?(udid: string): Promise<AppInfo[]>
  launchApp?(udid: string, bundleId: string): Promise<void>
}
