export function output(data: unknown, opts: { json?: boolean }): void {
  if (opts.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n')
    return
  }

  if (typeof data === 'string') {
    process.stdout.write(data + '\n')
    return
  }

  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}
