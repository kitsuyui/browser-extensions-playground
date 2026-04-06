export function createPopupHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quota Anthropic</title>
    <style>
      :root {
        font-family: "SF Pro Text", "Segoe UI", sans-serif;
        color-scheme: light;
      }

      body {
        margin: 0;
        min-width: 320px;
        background: #f4efe7;
        color: #1f2937;
      }

      main {
        display: grid;
        gap: 12px;
        padding: 16px;
      }

      section {
        background: #fffdf8;
        border: 1px solid #e7dcc9;
        border-radius: 14px;
        padding: 14px;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }

      .badge {
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 700;
        background: #d1fae5;
        color: #065f46;
      }

      .badge[data-enabled='false'] {
        background: #fee2e2;
        color: #991b1b;
      }

      .metrics {
        display: grid;
        gap: 10px;
      }

      .metric-row {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        font-size: 14px;
      }

      .label {
        color: #6b7280;
      }

      .value {
        font-weight: 700;
        text-align: right;
        overflow-wrap: anywhere;
      }

      details {
        border-top: 1px solid #e7dcc9;
        margin-top: 12px;
        padding-top: 12px;
      }

      summary {
        cursor: pointer;
        font-size: 13px;
        font-weight: 700;
        color: #4b5563;
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
        color: #4b5563;
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
        background: #d6d3d1;
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
        box-shadow: 0 1px 3px rgba(17, 24, 39, 0.25);
      }

      .switch input:checked + .slider {
        background: #1f2937;
      }

      .switch input:focus-visible + .slider {
        outline: 2px solid #111827;
        outline-offset: 2px;
      }

      .switch input:checked + .slider::before {
        transform: translateX(22px);
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="header">
          <strong>Quota Anthropic</strong>
          <span id="capture-status" class="badge" data-enabled="true">Enabled</span>
        </div>
        <div class="switch-row">
          <span class="switch-label">Capture enabled</span>
          <label class="switch" aria-label="Toggle capture">
            <input id="toggle-enabled" type="checkbox" checked />
            <span class="slider"></span>
          </label>
        </div>
      </section>
      <section class="metrics">
        <div class="metric-row">
          <span class="label">Current session</span>
          <span id="current-session-value" class="value">Unavailable</span>
        </div>
        <div class="metric-row">
          <span class="label">Weekly limits</span>
          <span id="weekly-limits-value" class="value">Unavailable</span>
        </div>
        <div class="metric-row">
          <span class="label">Extra usage</span>
          <span id="extra-usage-value" class="value">Unavailable</span>
        </div>
        <details>
          <summary>Debug</summary>
          <div class="metrics">
            <div class="metric-row">
              <span class="label">Sync</span>
              <span id="sync-summary" class="value">Waiting</span>
            </div>
            <div class="metric-row">
              <span class="label">Usage API</span>
              <span id="usage-api-summary" class="value">Not observed</span>
            </div>
            <div class="metric-row">
              <span class="label">Usage URLs</span>
              <span id="usage-api-detail" class="value"></span>
            </div>
          </div>
        </details>
      </section>
    </main>
    <script type="module" src="./popup.js"></script>
  </body>
</html>`
}
