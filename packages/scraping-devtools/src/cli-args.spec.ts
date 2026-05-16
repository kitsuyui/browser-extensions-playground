import { LOCAL_SERVER_HTTP_ORIGIN } from '@kitsuyui/browser-extensions-scraping-server'
import { describe, expect, it } from 'vitest'

import { getScrapingDevtoolsServerUrl } from './cli-args'

describe('getScrapingDevtoolsServerUrl', () => {
  it('uses the command-specific server-url argument position', () => {
    expect(
      getScrapingDevtoolsServerUrl(['https://example.test/data.json'], 1)
    ).toBe(LOCAL_SERVER_HTTP_ORIGIN)

    expect(
      getScrapingDevtoolsServerUrl(
        ['https://example.test/data.json', 'http://127.0.0.1:3929'],
        1
      )
    ).toBe('http://127.0.0.1:3929')

    expect(getScrapingDevtoolsServerUrl(['http://127.0.0.1:3929'], 0)).toBe(
      'http://127.0.0.1:3929'
    )
  })
})
