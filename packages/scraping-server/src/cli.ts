import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pkg from '../package.json'

import {
  createScrapingServer,
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
} from './index'

const USAGE = `Usage: node dist/cli.mjs [options]

Options:
  --host <host>        Server host (default: ${DEFAULT_SERVER_HOST})
  --port <port>        Server port (default: ${DEFAULT_SERVER_PORT})
  --store-file <path>  SQLite store file path
  --version            Print version and exit
  --help, -h           Show this help message
`

class CliUsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

function parseArgs(argv: readonly string[]) {
  const result = {
    host: DEFAULT_SERVER_HOST,
    port: DEFAULT_SERVER_PORT,
    storeFile: '.tmp/scraping-server/deterministic.sqlite',
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const value = argv[index + 1]

    if (token === '--host' && value) {
      result.host = value
    }

    if (token === '--port') {
      if (value === undefined) {
        throw new CliUsageError(
          'Missing value for --port. Expected an integer between 0 and 65535.'
        )
      }

      const port = Number(value)

      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new CliUsageError(
          `Invalid --port value "${value}". Expected an integer between 0 and 65535.`
        )
      }

      result.port = port
      index += 1
    }

    if (token === '--store-file' && value) {
      result.storeFile = value
    }
  }

  return result
}

function resolveStoreFile(storeFile: string): string {
  if (path.isAbsolute(storeFile)) {
    return storeFile
  }

  const baseDir = process.env.PWD ?? process.env.INIT_CWD ?? process.cwd()
  return path.resolve(baseDir, storeFile)
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2)

  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE)
    return
  }

  if (argv.includes('--version')) {
    process.stdout.write(`${pkg.version}\n`)
    return
  }

  const args = parseArgs(argv)
  const server = createScrapingServer({
    host: args.host,
    port: args.port,
    storeFile: resolveStoreFile(args.storeFile),
  })
  const listening = await server.listen()

  process.stdout.write(`scraping server listening on ${listening.url}\n`)
}

export async function runCli(): Promise<void> {
  try {
    await main()
  } catch (error) {
    if (error instanceof CliUsageError) {
      process.stderr.write(`${error.message}\n`)
      process.exit(1)
    }

    throw error
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void runCli()
}
