type JsonRpcId = string | number | null

type JsonRpcRequest = {
  readonly jsonrpc?: string
  readonly id?: JsonRpcId
  readonly method?: string
  readonly params?: Record<string, unknown>
}

type McpToolDefinition = {
  readonly name: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
}

function writeMessage(message: unknown): void {
  const body = JSON.stringify(message)
  process.stdout.write(
    `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
  )
}

function createSuccessResponse(id: JsonRpcId, result: unknown) {
  return {
    jsonrpc: '2.0' as const,
    id,
    result,
  }
}

function createErrorResponse(id: JsonRpcId, code: number, message: string) {
  return {
    jsonrpc: '2.0' as const,
    id,
    error: {
      code,
      message,
    },
  }
}

function tryExtractMessage(
  buffer: Buffer
): { consumedBytes: number; payload: string } | null {
  const headerEnd = buffer.indexOf('\r\n\r\n')

  if (headerEnd === -1) {
    return null
  }

  const headerText = buffer.subarray(0, headerEnd).toString('utf8')
  const contentLengthHeader = headerText
    .split('\r\n')
    .find((line) => line.toLowerCase().startsWith('content-length:'))

  if (!contentLengthHeader) {
    throw new Error('Missing Content-Length header.')
  }

  const contentLength = Number(contentLengthHeader.split(':')[1]?.trim())

  if (!Number.isFinite(contentLength) || contentLength < 0) {
    throw new Error('Invalid Content-Length header.')
  }

  const totalLength = headerEnd + 4 + contentLength

  if (buffer.length < totalLength) {
    return null
  }

  return {
    consumedBytes: totalLength,
    payload: buffer.subarray(headerEnd + 4, totalLength).toString('utf8'),
  }
}

export function createMcpTextResult(result: unknown) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
  }
}

export function startStdioMcpServer(options: {
  readonly name: string
  readonly version: string
  readonly tools: readonly McpToolDefinition[]
  readonly callTool: (
    name: string,
    arguments_: Record<string, unknown> | undefined
  ) => Promise<unknown>
}) {
  let buffer = Buffer.alloc(0)

  async function handleRequest(request: JsonRpcRequest): Promise<void> {
    if (!request.method) {
      return
    }

    if (request.method === 'notifications/initialized') {
      return
    }

    if (request.method === 'initialize') {
      writeMessage(
        createSuccessResponse(request.id ?? null, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: options.name,
            version: options.version,
          },
        })
      )
      return
    }

    if (request.method === 'ping') {
      writeMessage(createSuccessResponse(request.id ?? null, {}))
      return
    }

    if (request.method === 'tools/list') {
      writeMessage(
        createSuccessResponse(request.id ?? null, {
          tools: options.tools,
        })
      )
      return
    }

    if (request.method === 'tools/call') {
      const name = request.params?.name
      const arguments_ = request.params?.arguments

      if (typeof name !== 'string') {
        writeMessage(
          createErrorResponse(
            request.id ?? null,
            -32602,
            'Tool name is required.'
          )
        )
        return
      }

      try {
        const result = await options.callTool(
          name,
          typeof arguments_ === 'object' && arguments_ !== null
            ? (arguments_ as Record<string, unknown>)
            : undefined
        )
        writeMessage(
          createSuccessResponse(request.id ?? null, createMcpTextResult(result))
        )
      } catch (error) {
        writeMessage(
          createErrorResponse(
            request.id ?? null,
            -32000,
            error instanceof Error
              ? error.message
              : 'Unknown tool execution error.'
          )
        )
      }
      return
    }

    writeMessage(
      createErrorResponse(
        request.id ?? null,
        -32601,
        `Method not found: ${request.method}`
      )
    )
  }

  process.stdin.on('data', (chunk: Buffer | string) => {
    buffer = Buffer.concat([
      buffer,
      typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
    ])

    while (true) {
      const extracted = tryExtractMessage(buffer)

      if (!extracted) {
        break
      }

      buffer = buffer.subarray(extracted.consumedBytes)
      const request = JSON.parse(extracted.payload) as JsonRpcRequest
      void handleRequest(request)
    }
  })

  process.stdin.resume()
}
