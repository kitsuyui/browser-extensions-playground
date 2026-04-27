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

function writeParseErrorResponse(): void {
  writeMessage(createErrorResponse(null, -32700, 'Parse error.'))
}

function resolveToolArguments(
  value: unknown
): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined
}

function writeInitializeResponse(
  request: JsonRpcRequest,
  options: { readonly name: string; readonly version: string }
): void {
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
}

function writeToolsListResponse(
  request: JsonRpcRequest,
  tools: readonly McpToolDefinition[]
): void {
  writeMessage(
    createSuccessResponse(request.id ?? null, {
      tools,
    })
  )
}

async function writeToolCallResponse(
  request: JsonRpcRequest,
  options: {
    readonly callTool: (
      name: string,
      arguments_: Record<string, unknown> | undefined
    ) => Promise<unknown>
  }
): Promise<void> {
  const name = request.params?.name
  if (typeof name !== 'string') {
    writeMessage(
      createErrorResponse(request.id ?? null, -32602, 'Tool name is required.')
    )
    return
  }

  try {
    const result = await options.callTool(
      name,
      resolveToolArguments(request.params?.arguments)
    )
    writeMessage(
      createSuccessResponse(request.id ?? null, createMcpTextResult(result))
    )
  } catch (error) {
    writeMessage(
      createErrorResponse(
        request.id ?? null,
        -32000,
        error instanceof Error ? error.message : 'Unknown tool execution error.'
      )
    )
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
    const method = request.method
    if (!method || method === 'notifications/initialized') {
      return
    }

    const handlers: Record<
      string,
      (request_: JsonRpcRequest) => Promise<void> | void
    > = {
      initialize: (request_) => {
        writeInitializeResponse(request_, options)
      },
      ping: (request_) => {
        writeMessage(createSuccessResponse(request_.id ?? null, {}))
      },
      'tools/list': (request_) => {
        writeToolsListResponse(request_, options.tools)
      },
      'tools/call': (request_) => writeToolCallResponse(request_, options),
    }

    const handler = handlers[method]
    if (!handler) {
      writeMessage(
        createErrorResponse(
          request.id ?? null,
          -32601,
          `Method not found: ${method}`
        )
      )
      return
    }

    await handler(request)
  }

  process.stdin.on('data', (chunk: Buffer | string) => {
    buffer = Buffer.concat([
      buffer,
      typeof chunk === 'string' ? Buffer.from(chunk) : chunk,
    ])

    while (true) {
      let extracted: { consumedBytes: number; payload: string } | null
      try {
        extracted = tryExtractMessage(buffer)
      } catch {
        buffer = Buffer.alloc(0)
        writeParseErrorResponse()
        break
      }

      if (!extracted) {
        break
      }

      buffer = buffer.subarray(extracted.consumedBytes)
      let request: JsonRpcRequest
      try {
        request = JSON.parse(extracted.payload) as JsonRpcRequest
      } catch {
        writeParseErrorResponse()
        continue
      }
      void handleRequest(request).catch(() => {
        writeMessage(
          createErrorResponse(
            request.id ?? null,
            -32603,
            'Internal JSON-RPC error.'
          )
        )
      })
    }
  })

  process.stdin.resume()
}
