/**
 * Metadata for a small demo browser extension.
 */
export type BrowserExtensionInfo = {
  readonly name: string
  readonly version: string
}

export type BrowserExtensionManifest = {
  readonly manifest_version: 3
  readonly name: string
  readonly version: string
  readonly description: string
  readonly action: {
    readonly default_title: 'Hello, World!'
    readonly default_popup: 'popup.html'
  }
  readonly browser_specific_settings: {
    readonly gecko: {
      readonly id: 'browser-extensions-hello@kitsuyui.com'
    }
  }
}

/**
 * Returns the default metadata used by the starter package.
 */
export function createBrowserExtensionInfo(): BrowserExtensionInfo {
  return {
    name: 'Browser Extension Hello',
    version: '0.0.0',
  }
}

/**
 * Returns the message shown by the extension popup.
 */
export function createHelloWorldMessage(): string {
  return 'Hello, World!'
}

/**
 * Creates a Manifest V3 definition for the demo extension.
 */
export function createExtensionManifest(): BrowserExtensionManifest {
  const info = createBrowserExtensionInfo()

  return {
    manifest_version: 3,
    name: info.name,
    version: info.version,
    description: 'A minimal browser extension that shows Hello, World!.',
    action: {
      default_title: 'Hello, World!',
      default_popup: 'popup.html',
    },
    browser_specific_settings: {
      gecko: {
        id: 'browser-extensions-hello@kitsuyui.com',
      },
    },
  }
}

/**
 * Creates the popup HTML used by the built extension.
 */
export function createPopupHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1"
    />
    <title>Hello, World!</title>
    <style>
      :root {
        font-family: sans-serif;
        color-scheme: light;
      }

      body {
        margin: 0;
        min-width: 240px;
        min-height: 120px;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
      }

      p {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
      }
    </style>
  </head>
  <body>
    <p id="message"></p>
    <script type="module" src="./popup.js"></script>
  </body>
</html>`
}
