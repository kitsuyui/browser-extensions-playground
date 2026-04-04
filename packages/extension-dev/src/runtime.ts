import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

export function createPopupHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Scraping Devtools</title>
    <style>
      :root {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color-scheme: light;
      }

      body {
        margin: 0;
        min-width: 360px;
        background: #fff7ed;
        color: #431407;
      }

      main {
        display: grid;
        gap: 12px;
        padding: 16px;
      }

      section {
        background: #ffffff;
        border: 1px solid #fdba74;
        border-radius: 12px;
        padding: 12px;
      }

      .status {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        font-weight: 700;
      }

      .status-dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #94a3b8;
      }

      .status-dot[data-state='connecting'] {
        background: #f59e0b;
      }

      .status-dot[data-state='connected'] {
        background: #16a34a;
      }

      .status-dot[data-state='disconnected'] {
        background: #dc2626;
      }

      .warning {
        font-size: 12px;
        font-weight: 700;
        color: #9a3412;
      }

      pre {
        margin: 0;
        max-height: 240px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }

      details {
        border-top: 1px solid #fed7aa;
        margin-top: 12px;
        padding-top: 12px;
      }

      summary {
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
      }

      .switch-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-top: 12px;
      }

      .switch-label {
        font-size: 13px;
        font-weight: 700;
      }

      .switch {
        position: relative;
        display: inline-block;
        width: 52px;
        height: 30px;
      }

      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .slider {
        position: absolute;
        inset: 0;
        cursor: pointer;
        background: #fdba74;
        transition: 0.2s ease;
        border-radius: 999px;
      }

      .slider::before {
        content: '';
        position: absolute;
        height: 22px;
        width: 22px;
        left: 4px;
        top: 4px;
        background: #ffffff;
        transition: 0.2s ease;
        border-radius: 999px;
        box-shadow: 0 1px 3px rgba(124, 45, 18, 0.25);
      }

      .switch input:checked + .slider {
        background: #c2410c;
      }

      .switch input:focus-visible + .slider {
        outline: 2px solid #9a3412;
        outline-offset: 2px;
      }

      .switch input:checked + .slider::before {
        transform: translateX(22px);
      }

      .debug-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin: 8px 0;
      }

      .copy-button {
        border: 0;
        border-radius: 8px;
        padding: 6px 10px;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        cursor: pointer;
        background: #431407;
        color: #fff7ed;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="status">
          <span id="connection-dot" class="status-dot" data-state="connecting"></span>
          <span id="connection-label">Devtools: checking</span>
        </div>
        <p><strong>Server:</strong> ${LOCAL_SERVER_HTTP_ORIGIN}</p>
        <p class="warning">
          Enable this when you want to inspect or control an open provider tab.
        </p>
        <div class="switch-row">
          <span class="switch-label">Remote control enabled</span>
          <label class="switch" aria-label="Toggle remote control">
            <input id="toggle-enabled" type="checkbox" checked />
            <span class="slider"></span>
          </label>
        </div>
      </section>
      <section>
        <details>
          <summary>Debug</summary>
          <div class="debug-header">
            <strong>Last command result</strong>
            <button id="copy-command-result" class="copy-button" type="button">Copy JSON</button>
          </div>
          <pre id="last-command-result">null</pre>
        </details>
      </section>
    </main>
    <script type="module" src="./popup.js"></script>
  </body>
</html>`
}
