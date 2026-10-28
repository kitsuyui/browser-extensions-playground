const rootManifest = await Bun.file('package.json').json()
const overrides = rootManifest.overrides ?? {}
const manifests = ['package.json']
const workspaceManifests = new Bun.Glob('packages/*/package.json')
for await (const path of workspaceManifests.scan('.')) {
  manifests.push(path)
}

let mismatches = 0
for (const path of manifests) {
  const manifest = await Bun.file(path).json()
  for (const section of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    const dependencies = manifest[section] ?? {}
    for (const [name, range] of Object.entries(dependencies)) {
      const override = overrides[name]
      if (override !== undefined && !Bun.semver.satisfies(override, range)) {
        console.error(
          `${path}: ${name} override ${override} does not satisfy ${range}`
        )
        mismatches++
      }
    }
  }
}
if (mismatches > 0) {
  process.exit(1)
}
console.log('Direct dependency overrides satisfy declared ranges.')
