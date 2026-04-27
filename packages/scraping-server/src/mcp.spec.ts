import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { startStdioMcpServer } from './mcp'

type JsonRpcResponse = {
  readonly jsonrpc: '2.0'
  readonly id: string | number | null
  readonly result?: unknown
  readonly error?: {
    readonly code: number
    readonly message: string
  }
}

function encodeMessage(message: unknown): Buffer {
  const body = JSON.stringify(message)
  return Buffer.from(
    `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`,
    'utf8'
  )
}

function decodeResponses(buffer: string): JsonRpcResponse[] {
  const responses: JsonRpcResponse[] = []
  let offset = 0

  while (offset < buffer.length) {
    const headerEnd = buffer.indexOf('\r\n\r\n', offset)
    if (headerEnd === -1) {
      break
    }

    const header = buffer.slice(offset, headerEnd)
    const contentLengthHeader = header
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith('content-length:'))

    if (!contentLengthHeader) {
      break
    }

    const contentLength = Number(contentLengthHeader.split(':')[1]?.trim() ?? 0)
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + contentLength
    responses.push(
      JSON.parse(buffer.slice(bodyStart, bodyEnd)) as JsonRpcResponse
    )
    offset = bodyEnd
  }

  return responses
}

describe('startStdioMcpServer', () => {
  let written = ''
  let addedListeners: Array<(chunk: Buffer | string) => void> = []
  let resumeSpy: ReturnType<typeof vi.spyOn>
  let writeSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    written = ''
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(((
      chunk: string | Uint8Array
    ) => {
      written +=
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      return true
    }) as never)
    resumeSpy = vi
      .spyOn(process.stdin, 'resume')
      .mockImplementation(() => process.stdin)
  })

  afterEach(() => {
    for (const listener of addedListeners) {
      process.stdin.off('data', listener)
    }
    addedListeners = []
    writeSpy.mockRestore()
    resumeSpy.mockRestore()
  })

  function startServer(
    callTool: (
      name: string,
      arguments_: Record<string, unknown> | undefined
    ) => Promise<unknown> = async () => ({ ok: true })
  ) {
    const previousListeners = new Set(process.stdin.listeners('data'))
    startStdioMcpServer({
      name: 'scraping-server',
      version: '1.2.3',
      tools: [
        {
          name: 'echo',
          description: 'Echo the input',
          inputSchema: {
            type: 'object',
          },
        },
      ],
      callTool,
    })
    addedListeners = process.stdin.listeners('data').filter((listener) => {
      return !previousListeners.has(listener)
    }) as Array<(chunk: Buffer | string) => void>
  }

  async function sendRequest(message: unknown): Promise<JsonRpcResponse> {
    process.stdin.emit('data', encodeMessage(message))
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))
    const responses = decodeResponses(written)
    const latestResponse = responses.at(-1)
    if (!latestResponse) {
      throw new Error('No JSON-RPC response was written.')
    }
    return latestResponse
  }

  it('responds to initialize requests with server metadata', async () => {
    startServer()

    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    })

    expect(response.result).toEqual(
      expect.objectContaining({
        protocolVersion: '2024-11-05',
        serverInfo: {
          name: 'scraping-server',
          version: '1.2.3',
        },
      })
    )
  })

  it('returns an invalid params error when tools/call omits the tool name', async () => {
    startServer()

    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {},
    })

    expect(response.error).toEqual({
      code: -32602,
      message: 'Tool name is required.',
    })
  })

  it('wraps tool results as MCP text content', async () => {
    startServer(async (name, arguments_) => ({
      name,
      arguments_,
    }))

    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'echo',
        arguments: {
          hello: 'world',
        },
      },
    })

    expect(response.result).toEqual({
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              name: 'echo',
              arguments_: {
                hello: 'world',
              },
            },
            null,
            2
          ),
        },
      ],
      structuredContent: {
        name: 'echo',
        arguments_: {
          hello: 'world',
        },
      },
    })
  })

  it('returns method not found for unsupported requests', async () => {
    startServer()

    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'unknown/method',
    })

    expect(response.error).toEqual({
      code: -32601,
      message: 'Method not found: unknown/method',
    })
  })

  it('returns a parse error and continues after malformed JSON', async () => {
    startServer()

    process.stdin.emit(
      'data',
      Buffer.from('Content-Length: 1\r\n\r\n{', 'utf8')
    )
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0))

    const parseError = decodeResponses(written).at(-1)
    expect(parseError?.error).toEqual({
      code: -32700,
      message: 'Parse error.',
    })

    const response = await sendRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'ping',
    })

    expect(response.result).toEqual({})
  })
})
