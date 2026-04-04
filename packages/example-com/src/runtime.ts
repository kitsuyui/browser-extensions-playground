import { LOCAL_SERVER_HTTP_ORIGIN } from '../../scraping-server/src/protocol'

export function createPopupHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Example.com Data</title>
    <style>
      :root {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        color-scheme: light;
      }

      body {
        margin: 0;
        min-width: 320px;
        background: #f8fafc;
        color: #0f172a;
      }

      main {
        display: grid;
        gap: 12px;
        padding: 16px;
      }

      section {
        background: #fff;
        border: 1px solid #d6deeb;
        border-radius: 12px;
        padding: 12px;
      }

      .warning {
        font-size: 12px;
        font-weight: 700;
        color: #9a3412;
      }

      pre {
        margin: 0;
        max-height: 320px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <strong>Example.com Data</strong>
        <p><strong>Server:</strong> ${LOCAL_SERVER_HTTP_ORIGIN}</p>
        <p id="risk-warning" class="warning"></p>
      </section>
      <section>
        <strong>Last sync</strong>
        <pre id="sync-status">unknown</pre>
      </section>
      <section>
        <strong>Latest snapshot</strong>
        <pre id="snapshot">null</pre>
      </section>
    </main>
    <script type="module" src="./popup.js"></script>
  </body>
</html>`
}
