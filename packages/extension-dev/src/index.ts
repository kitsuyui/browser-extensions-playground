import { listProviderHostPermissions } from '../../scraping-platform/src/index'
import { LOCAL_SERVER_HTTP_MATCH_PATTERN } from '../../scraping-server/src/protocol'

export function createExtensionManifest() {
  return {
    manifest_version: 3 as const,
    name: 'Scraping Devtools',
    version: '0.0.0',
    description:
      'Dangerous developer extension for remote browser inspection and scripted control.',
    permissions: ['storage', 'tabs'],
    host_permissions: [
      ...listProviderHostPermissions(),
      LOCAL_SERVER_HTTP_MATCH_PATTERN,
    ],
    background: {
      service_worker: 'background.js',
      type: 'module' as const,
    },
    content_scripts: [
      {
        matches: listProviderHostPermissions(),
        js: ['content-script.js'],
        run_at: 'document_idle' as const,
      },
    ],
    action: {
      default_title: 'Scraping Devtools',
      default_popup: 'popup.html',
    },
  }
}

export { createPopupHtml } from './runtime'
