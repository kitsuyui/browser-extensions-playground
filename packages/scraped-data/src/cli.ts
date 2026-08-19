import { fileURLToPath } from 'node:url'
import { LOCAL_SERVER_HTTP_ORIGIN } from '@kitsuyui/browser-extensions-scraping-server'
import pkg from '../package.json'

import { createScrapedDataTools } from './index'

const USAGE = `Usage:
  node dist/cli.js status [server-url]
  node dist/cli.js providers [server-url]
  node dist/cli.js snapshot <provider> [server-url]
  node dist/cli.js history [provider] [server-url]
  node dist/cli.js describe <provider> [server-url]

Options:
  --help, -h   Show this help message
  --version    Print version and exit
`

function requireProvider(args: readonly string[]): string {
  const provider = args[0] && !args[0].startsWith('http') ? args[0] : undefined
  if (!provider) {
    process.stderr.write(USAGE)
    process.exit(1)
  }
  return provider
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

type Tools = ReturnType<typeof createScrapedDataTools>

async function runCommand(
  command: string,
  args: readonly string[],
  tools: Tools
): Promise<void> {
  if (command === 'status') {
    return writeJson(await tools.getServerStatus())
  }

  if (command === 'providers') {
    return writeJson(await tools.listProviders())
  }

  if (command === 'snapshot') {
    return writeJson(await tools.getLatestSnapshot(requireProvider(args)))
  }

  if (command === 'describe') {
    return writeJson(await tools.describeProvider(requireProvider(args)))
  }

  if (command === 'history') {
    const provider =
      args[0] && !args[0].startsWith('http') ? args[0] : undefined
    return writeJson(await tools.getSnapshotHistory({ provider }))
  }

  process.stderr.write(USAGE)
  process.exit(1)
}

export async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const [command = 'status', ...args] = rawArgs

  if (command === '--help' || command === '-h') {
    process.stdout.write(USAGE)
    return
  }

  if (command === '--version') {
    process.stdout.write(`${pkg.version}\n`)
    return
  }

  const baseUrl = args.at(-1)?.startsWith('http')
    ? (args.at(-1) as string)
    : LOCAL_SERVER_HTTP_ORIGIN
  const tools = createScrapedDataTools(baseUrl)

  await runCommand(command, args, tools)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main()
}
