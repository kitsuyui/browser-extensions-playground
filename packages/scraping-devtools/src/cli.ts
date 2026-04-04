import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

import { createScrapingDevtoolsTools } from './index'

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const [command = 'status', ...args] = rawArgs
  const baseUrl = args.at(-1)?.startsWith('http')
    ? (args.at(-1) as string)
    : LOCAL_SERVER_HTTP_ORIGIN
  const tools = createScrapingDevtoolsTools(baseUrl)

  if (command === 'list-providers') {
    process.stdout.write(
      `${JSON.stringify(await tools.listProviders(), null, 2)}\n`
    )
    return
  }

  if (command === 'status') {
    process.stdout.write(
      `${JSON.stringify(await tools.getServerStatus(), null, 2)}\n`
    )
    return
  }

  if (command === 'list-clients') {
    process.stdout.write(
      `${JSON.stringify(await tools.listDevClients(), null, 2)}\n`
    )
    return
  }

  if (command === 'capture-page') {
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
      throw new Error('execute-script requires a source string')
    }

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
      throw new Error('fetch-json requires a url string')
    }

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

  process.stdout.write(
    'Usage:\n  node dist/cli.js list-providers\n  node dist/cli.js status [server-url]\n  node dist/cli.js list-clients [server-url]\n  node dist/cli.js capture-page [server-url]\n  node dist/cli.js execute-script <source> [server-url]\n  node dist/cli.js fetch-json <url> [server-url]\n'
  )
}

void main()
