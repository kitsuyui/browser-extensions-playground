import path from 'node:path'

import {
  createScrapingServer,
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
} from './index'

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

    if (token === '--port' && value) {
      result.port = Number(value)
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const server = createScrapingServer({
    host: args.host,
    port: args.port,
    storeFile: resolveStoreFile(args.storeFile),
  })
  const listening = await server.listen()

  process.stdout.write(`scraping server listening on ${listening.url}\n`)
}

void main()
