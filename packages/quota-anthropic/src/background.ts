import { registerDeterministicExtensionBackground } from '../../scraping-platform/src/deterministic-extension'

import { providerManifest } from './index'

registerDeterministicExtensionBackground({
  providerManifest,
})
