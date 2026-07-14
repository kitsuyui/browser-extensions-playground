import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { main } from './cli'

describe('quota-openai CLI', () => {
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
    expect(out).toContain('stable-snapshot')
    expect(stderrOutput).toHaveLength(0)
  })

  it('--version prints version string to stdout', async () => {
    process.argv = ['node', 'cli.mjs', '--version']
    await main()
    expect(stdoutOutput.join('')).toMatch(/^\d+\.\d+\.\d+/)
    expect(stderrOutput).toHaveLength(0)
  })

  it('prints usage to stderr and exits with code 1 on invalid commands', async () => {
    process.argv = ['node', 'cli.mjs', 'nope']
    const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`)
    })

    await expect(main()).rejects.toThrow('process.exit(1)')
    expect(stdoutOutput).toHaveLength(0)
    expect(stderrOutput.join('')).toContain('Usage:')
    expect(exit).toHaveBeenCalledWith(1)
  })
})
