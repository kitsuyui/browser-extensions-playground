export function createPopupHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Quota GitHub Copilot</title>
    <style>
      :root {
        font-family: "SF Pro Text", "Segoe UI", sans-serif;
        color-scheme: light;
      }

      body {
        margin: 0;
        min-width: 320px;
        background: #f6f8fa;
        color: #24292f;
      }

      main {
        display: grid;
        gap: 12px;
        padding: 16px;
      }

      section {
        background: #ffffff;
        border: 1px solid #d0d7de;
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
        background: #dafbe1;
        color: #116329;
      }

      .badge[data-enabled='false'] {
        background: #ffd8d3;
        color: #cf222e;
      }

      .metrics {
        display: grid;
        gap: 10px;
      }

      .metric-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 14px;
      }

      .label {
        color: #57606a;
      }

      .value {
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
        color: #57606a;
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
        background: #d0d7de;
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
        box-shadow: 0 1px 3px rgba(31, 35, 40, 0.25);
      }

      .switch input:checked + .slider {
        background: #2f81f7;
      }

      .switch input:focus-visible + .slider {
        outline: 2px solid #0969da;
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
          <strong>Quota GitHub Copilot</strong>
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
          <span class="label">Premium used</span>
          <span id="premium-used-value" class="value">Unavailable</span>
        </div>
        <div class="metric-row">
          <span class="label">Sync</span>
          <span id="sync-summary" class="value">Waiting</span>
        </div>
      </section>
    </main>
    <script type="module" src="./popup.js"></script>
  </body>
</html>`
}
