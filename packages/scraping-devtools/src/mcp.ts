#!/usr/bin/env node

import {
  LOCAL_SERVER_HTTP_ORIGIN,
  startStdioMcpServer,
} from '@kitsuyui/browser-extensions-scraping-server'

import { createScrapingDevtoolsTools } from './index'

const TOOLS = [
  {
    name: 'get_status',
    description:
      'Read scraping server status, warnings, and connected dev clients.',
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
    description: 'List registered provider manifests from the scraping server.',
    inputSchema: {
      type: 'object',
      properties: {
        serverUrl: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_clients',
    description:
      'List devtools websocket clients currently connected to the server.',
    inputSchema: {
      type: 'object',
      properties: {
        serverUrl: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'capture_page',
    description:
      'Run capture-page through a connected devtools browser client. ' +
      'When targetClientId is omitted, the command is dispatched to the first connected client (insertion order). ' +
      'Use list_clients to discover available client IDs when multiple browsers are connected.',
    inputSchema: {
      type: 'object',
      properties: {
        serverUrl: { type: 'string' },
        targetClientId: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
] as const

function resolveBaseUrl(args: Record<string, unknown> | undefined): string {
  return typeof args?.serverUrl === 'string'
    ? args.serverUrl
    : LOCAL_SERVER_HTTP_ORIGIN
}

export async function callScrapingDevtoolsTool(
  name: string,
  args: Record<string, unknown> | undefined
) {
  const tools = createScrapingDevtoolsTools(resolveBaseUrl(args))
  const targetClientId =
    typeof args?.targetClientId === 'string' ? args.targetClientId : undefined

  switch (name) {
    case 'get_status':
      return tools.getServerStatus()
    case 'list_providers':
      return tools.listProviders()
    case 'list_clients':
      return tools.listDevClients()
    case 'capture_page':
      return tools.runDevCommand({
        targetClientId,
        command: {
          type: 'capture-page',
        },
      })
    default:
      throw new Error(`Unknown scraping-devtools tool: ${name}`)
  }
}

export function startScrapingDevtoolsMcpServer(): void {
  startStdioMcpServer({
    name: 'scraping-devtools',
    version: '0.0.0',
    tools: TOOLS,
    callTool: callScrapingDevtoolsTool,
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startScrapingDevtoolsMcpServer()
}
