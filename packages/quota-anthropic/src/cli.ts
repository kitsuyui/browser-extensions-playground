import { fileURLToPath } from 'node:url'
import { LOCAL_SERVER_HTTP_ORIGIN } from '@kitsuyui/browser-extensions-scraping-platform'
import pkg from '../package.json'

import { createQuotaAnthropicTools } from './data'

const USAGE = `Usage:
  node dist/cli.js snapshot [server-url]

Options:
  --help, -h   Show this help message
  --version    Print version and exit
`

export async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--')
  const [command = 'snapshot', ...args] = rawArgs

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
  const tools = createQuotaAnthropicTools(baseUrl)

  if (command === 'snapshot') {
    process.stdout.write(
      `${JSON.stringify(await tools.getLatestSnapshot(), null, 2)}\n`
    )
    return
  }

  process.stderr.write(USAGE)
  process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main()
}
