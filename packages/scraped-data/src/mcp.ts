#!/usr/bin/env node

import type { ProviderId } from '@kitsuyui/browser-extensions-scraping-platform'
import { startStdioMcpServer } from '../../scraping-server/src/mcp'
import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

import { createScrapedDataTools } from './index'

const TOOLS = [
  {
    name: 'get_status',
    description: 'Read the scraping server status and risk warnings.',
    inputSchema: {
      type: 'object',
      properties: {
        serverUrl: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_providers',
    description: 'List registered scraping providers exposed by the server.',
    inputSchema: {
      type: 'object',
      properties: {
        serverUrl: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_snapshot',
    description:
      'Read the latest deterministic snapshot for one provider or all providers.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        serverUrl: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'describe_provider',
    description:
      'Read the provider-published description of snapshot raw versions and metric meanings.',
    inputSchema: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        serverUrl: { type: 'string' },
      },
      required: ['provider'],
      additionalProperties: false,
    },
  },
] as const

function resolveBaseUrl(args: Record<string, unknown> | undefined): string {
  return typeof args?.serverUrl === 'string'
    ? args.serverUrl
    : LOCAL_SERVER_HTTP_ORIGIN
}

export async function callScrapedDataTool(
  name: string,
  args: Record<string, unknown> | undefined
) {
  const tools = createScrapedDataTools(resolveBaseUrl(args))

  switch (name) {
    case 'get_status':
      return tools.getServerStatus()
    case 'list_providers':
      return tools.listProviders()
    case 'get_snapshot':
      return tools.getLatestSnapshot(args?.provider as ProviderId | undefined)
    case 'describe_provider':
      return tools.describeProvider(args?.provider as ProviderId)
    default:
      throw new Error(`Unknown scraped-data tool: ${name}`)
  }
}

export function startScrapedDataMcpServer(): void {
  startStdioMcpServer({
    name: 'scraped-data',
    version: '0.0.0',
    tools: TOOLS,
    callTool: callScrapedDataTool,
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startScrapedDataMcpServer()
}
