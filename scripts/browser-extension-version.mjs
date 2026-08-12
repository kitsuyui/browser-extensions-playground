import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

export function normalizeBrowserExtensionVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:[-+][0-9A-Za-z.-]+)?$/.exec(
    version
  )

  if (!match) {
    throw new Error(
      `Expected package.json version to be a browser-extension-compatible semver base, received "${version}".`
    )
  }

  const normalizedVersion = match
    .slice(1, 5)
    .filter((part) => part !== undefined)
    .join('.')

  return normalizedVersion === version
    ? { version: normalizedVersion }
    : {
        version: normalizedVersion,
        version_name: version,
      }
}

export async function readBrowserExtensionVersion(packageDir) {
  const packageJsonPath = resolve(packageDir, 'package.json')
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))

  if (
    typeof packageJson.version !== 'string' ||
    packageJson.version.length === 0
  ) {
    throw new Error(
      `Expected ${packageJsonPath} to contain a non-empty string version field.`
    )
  }

  return normalizeBrowserExtensionVersion(packageJson.version)
}
