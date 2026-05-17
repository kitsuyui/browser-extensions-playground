import { fileURLToPath } from 'node:url'

import pkg from '../package.json'

import { getScrapingDevtoolsServerUrl } from './cli-args'
import { createScrapingDevtoolsTools } from './index'

const USAGE = `Usage:
  node dist/cli.mjs list-providers
  node dist/cli.mjs status [server-url]
  node dist/cli.mjs list-clients [server-url]
  node dist/cli.mjs capture-page [server-url]
  node dist/cli.mjs execute-script <source> [server-url]
  node dist/cli.mjs fetch-json <url> [server-url]

Options:
  --help, -h   Show this help message
  --version    Print version and exit
`

export async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const [command = 'status', ...args] = rawArgs
  const createTools = (serverUrlArgIndex: number) =>
    createScrapingDevtoolsTools(
      getScrapingDevtoolsServerUrl(args, serverUrlArgIndex)
    )

  if (command === '--help' || command === '-h') {
    process.stdout.write(USAGE)
    return
  }

  if (command === '--version') {
    process.stdout.write(`${pkg.version}\n`)
    return
  }

  if (command === 'list-providers') {
    const tools = createTools(0)

    process.stdout.write(
      `${JSON.stringify(await tools.listProviders(), null, 2)}\n`
    )
    return
  }

  if (command === 'status') {
    const tools = createTools(0)

    process.stdout.write(
      `${JSON.stringify(await tools.getServerStatus(), null, 2)}\n`
    )
    return
  }

  if (command === 'list-clients') {
    const tools = createTools(0)

    process.stdout.write(
      `${JSON.stringify(await tools.listDevClients(), null, 2)}\n`
    )
    return
  }

  if (command === 'capture-page') {
    const tools = createTools(0)

    process.stdout.write(
      `${JSON.stringify(
        await tools.runDevCommand({
          command: {
            type: 'capture-page',
          },
        }),
        null,
        2
      )}\n`
    )
    return
  }

  if (command === 'execute-script') {
    const source = args[0]

    if (!source) {
      process.stderr.write('execute-script requires a source string\n')
      process.exit(1)
    }

    const tools = createTools(1)

    process.stdout.write(
      `${JSON.stringify(
        await tools.runDevCommand({
          command: {
            type: 'execute-script',
            source,
          },
        }),
        null,
        2
      )}\n`
    )
    return
  }

  if (command === 'fetch-json') {
    const url = args[0]

    if (!url) {
      process.stderr.write('fetch-json requires a url string\n')
      process.exit(1)
    }

    const tools = createTools(1)

    process.stdout.write(
      `${JSON.stringify(
        await tools.runDevCommand({
          command: {
            type: 'fetch-json',
            url,
          },
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
