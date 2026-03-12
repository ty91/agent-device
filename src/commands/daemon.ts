import type { Command } from 'commander'
import { getDaemonStatus, stopDaemon, ensureDaemon } from '../daemon/client.js'

export function registerDaemonCommand(program: Command): void {
  const daemon = program
    .command('daemon')
    .description('Manage the background daemon process')

  daemon
    .command('status')
    .description('Show daemon status')
    .action(async () => {
      const status = await getDaemonStatus()
      if (!status.running) {
        console.log('Daemon is not running.')
        return
      }
      console.log(`Daemon is running (pid ${status.pid})`)
      console.log(`  Uptime: ${status.uptime}s`)
      console.log(`  Viewer: http://localhost:${status.viewerPort}`)
    })

  daemon
    .command('stop')
    .description('Stop the daemon')
    .action(async () => {
      const stopped = await stopDaemon()
      if (stopped) {
        console.log('Daemon stopped.')
      } else {
        console.log('Daemon is not running.')
      }
    })

  daemon
    .command('restart')
    .description('Restart the daemon')
    .action(async () => {
      await stopDaemon()
      await ensureDaemon()
      const status = await getDaemonStatus()
      console.log(`Daemon restarted (pid ${status.pid}).`)
    })
}
