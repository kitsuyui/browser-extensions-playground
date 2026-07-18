import { fileURLToPath } from 'node:url'
import { LOCAL_SERVER_HTTP_ORIGIN } from '@kitsuyui/browser-extensions-scraping-server'
import pkg from '../package.json'

import { createScrapedDataTools } from './index'

const USAGE = `Usage:
  node dist/cli.js status [server-url]
  node dist/cli.js providers [server-url]
  node dist/cli.js snapshot <provider> [server-url]
  node dist/cli.js history [provider] [server-url]

Options:
  --help, -h   Show this help message
  --version    Print version and exit
`

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

  if (command === 'status') {
    process.stdout.write(
      `${JSON.stringify(await tools.getServerStatus(), null, 2)}\n`
    )
    return
  }

  if (command === 'providers') {
    process.stdout.write(
      `${JSON.stringify(await tools.listProviders(), null, 2)}\n`
    )
    return
  }

  if (command === 'snapshot') {
    const provider =
      args[0] && !args[0].startsWith('http') ? args[0] : undefined
    if (!provider) {
      process.stderr.write(USAGE)
      process.exit(1)
    }
    process.stdout.write(
      `${JSON.stringify(await tools.getLatestSnapshot(provider), null, 2)}\n`
    )
    return
  }

  if (command === 'history') {
    const provider =
      args[0] && !args[0].startsWith('http') ? args[0] : undefined
    process.stdout.write(
      `${JSON.stringify(
        await tools.getSnapshotHistory({
          provider,
        }),
        null,
        2
      )}\n`
    )
    return
  }

  process.stderr.write(USAGE)
  process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main()
}
