#!/usr/bin/env node
import { Command } from 'commander'
import { register } from './platform/registry.js'
import { IosPlatformProvider } from './platform/ios/index.js'
import { registerContextCommand } from './commands/context.js'
import { registerListDevicesCommand } from './commands/list-devices.js'
import { registerScanUiCommand } from './commands/scan-ui.js'
import { registerDescribeScreenCommand } from './commands/describe-screen.js'
import { registerActionCommand } from './commands/action.js'
import { registerActionsCommand } from './commands/actions.js'
import { registerScreenshotCommand } from './commands/screenshot.js'
import { registerLaunchAppCommand } from './commands/launch-app.js'
import { registerListAppsCommand } from './commands/list-apps.js'
import { registerSetupDeviceCommand } from './commands/setup-device.js'
import { registerViewerCommand } from './commands/viewer.js'

// Register platform providers
register(new IosPlatformProvider())

const program = new Command()
  .name('agent-device')
  .description('CLI for controlling iOS simulators, physical iPhones, and more')
  .version('0.1.0')
  .option('--json', 'Output in JSON format')

// Register all commands
registerContextCommand(program)
registerListDevicesCommand(program)
registerScanUiCommand(program)
registerDescribeScreenCommand(program)
registerActionCommand(program)
registerActionsCommand(program)
registerScreenshotCommand(program)
registerLaunchAppCommand(program)
registerListAppsCommand(program)
registerSetupDeviceCommand(program)
registerViewerCommand(program)

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
