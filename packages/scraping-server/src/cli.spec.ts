import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { main } from './cli'

describe('scraping-server CLI', () => {
  let stdoutOutput: string[]
  let stderrOutput: string[]
  const origArgv = process.argv

  beforeEach(() => {
    stdoutOutput = []
    stderrOutput = []
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      stdoutOutput.push(String(chunk))
      return true
    })
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrOutput.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    process.argv = origArgv
    vi.restoreAllMocks()
  })

  it('--help prints usage to stdout and does not write to stderr', async () => {
    process.argv = ['node', 'cli.mjs', '--help']
    await main()
    const out = stdoutOutput.join('')
    expect(out).toContain('Usage:')
    expect(out).toContain('--help')
    expect(out).toContain('--version')
    expect(out).toContain('--host')
    expect(out).toContain('--port')
    expect(stderrOutput).toHaveLength(0)
  })

  it('-h prints usage to stdout', async () => {
    process.argv = ['node', 'cli.mjs', '-h']
    await main()
    expect(stdoutOutput.join('')).toContain('Usage:')
    expect(stderrOutput).toHaveLength(0)
  })

  it('--version prints version string to stdout', async () => {
    process.argv = ['node', 'cli.mjs', '--version']
    await main()
    expect(stdoutOutput.join('')).toMatch(/^\d+\.\d+\.\d+/)
    expect(stderrOutput).toHaveLength(0)
  })

  it('rejects a non-numeric --port value before starting the server', async () => {
    process.argv = ['node', 'cli.mjs', '--port', 'foo']

    await expect(main()).rejects.toThrow(
      'Invalid --port value "foo". Expected an integer between 0 and 65535.'
    )
    expect(stdoutOutput).toHaveLength(0)
    expect(stderrOutput).toHaveLength(0)
  })

  it('rejects another flag passed as the --port value', async () => {
    process.argv = [
      'node',
      'cli.mjs',
      '--port',
      '--store-file',
      '.tmp/scraping-server/deterministic.sqlite',
    ]

    await expect(main()).rejects.toThrow(
      'Invalid --port value "--store-file". Expected an integer between 0 and 65535.'
    )
    expect(stdoutOutput).toHaveLength(0)
    expect(stderrOutput).toHaveLength(0)
  })

  it('rejects --port without a value', async () => {
    process.argv = ['node', 'cli.mjs', '--port']

    await expect(main()).rejects.toThrow(
      'Missing value for --port. Expected an integer between 0 and 65535.'
    )
    expect(stdoutOutput).toHaveLength(0)
    expect(stderrOutput).toHaveLength(0)
  })
})
