import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

import { createScrapedDataTools } from './index'

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const [command = 'status', ...args] = rawArgs
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
    const provider = args[0]
    process.stdout.write(
      `${JSON.stringify(await tools.getLatestSnapshot(provider), null, 2)}\n`
    )
    return
  }

  process.stdout.write(
    'Usage:\n  node dist/cli.js status [server-url]\n  node dist/cli.js providers [server-url]\n  node dist/cli.js snapshot <provider> [server-url]\n'
  )
}

void main()
