import { getScrapingDevtoolsServerUrl } from './cli-args'
import { createScrapingDevtoolsTools } from './index'

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const [command = 'status', ...args] = rawArgs
  const createTools = (serverUrlArgIndex: number) =>
    createScrapingDevtoolsTools(
      getScrapingDevtoolsServerUrl(args, serverUrlArgIndex)
    )

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

  process.stderr.write(
    'Usage:\n  node dist/cli.js list-providers\n  node dist/cli.js status [server-url]\n  node dist/cli.js list-clients [server-url]\n  node dist/cli.js capture-page [server-url]\n  node dist/cli.js execute-script <source> [server-url]\n  node dist/cli.js fetch-json <url> [server-url]\n'
  )
  process.exit(1)
}

void main()
