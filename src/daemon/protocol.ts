export type RpcRequest = {
  command: string
  args: Record<string, unknown>
}

export type RpcResponse = {
  ok: boolean
  result?: unknown
  error?: string
  exitCode?: number
}

export type RpcStreamChunk = {
  type: 'progress' | 'result' | 'error'
  data: unknown
}

export const STREAMING_COMMANDS = new Set(['setup-device'])
