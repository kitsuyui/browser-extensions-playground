import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

import { createQuotaAnthropicTools } from './data'

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const [command = 'snapshot', ...args] = rawArgs
  const baseUrl = args.at(-1)?.startsWith('http')
    ? (args.at(-1) as string)
    : LOCAL_SERVER_HTTP_ORIGIN
  const tools = createQuotaAnthropicTools(baseUrl)

  if (command === 'snapshot') {
    process.stdout.write(
      `${JSON.stringify(await tools.getLatestSnapshot(), null, 2)}\n`
    )
    return
  }

  process.stdout.write('Usage:\n  node dist/cli.js snapshot [server-url]\n')
}

void main()
