import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The npm release job (.github/workflows/publish.yml) uses npm trusted publishing (OIDC).
// These checks keep its security and its guard rails from drifting.
const root = new URL('../', import.meta.url)
const read = (f: string) => readFileSync(new URL(f, root), 'utf8')
const workflow = read('.github/workflows/publish.yml')
const pkg = JSON.parse(read('package.json'))

describe('npm publish workflow', () => {
  it('runs when a release is published, or by hand with a tag', () => {
    expect(workflow).toMatch(/release:\n\s+types: \[published\]/)
    expect(workflow).toContain('workflow_dispatch:')
  })

  it('has the smallest permissions trusted publishing needs', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n {2}id-token: write\n/m)
    expect(workflow).not.toMatch(/write-all|contents: write/)
  })

  it('never uses a stored npm token and never caches dependencies', () => {
    expect(workflow).not.toMatch(/secrets\.|NPM_TOKEN|NODE_AUTH_TOKEN/)
    expect(workflow).not.toMatch(/cache:/)
    expect(workflow).toContain('persist-credentials: false')
  })

  it('uses the same Node as the CI and npm 11.5.1 or later', () => {
    expect(workflow).toContain('node-version: 24')
    expect(read('.github/workflows/ci.yml')).toContain('node-version: 24')
    expect(workflow).toContain('npm install -g npm@11')
  })

  it('fails when the release tag is not v + the package.json version', () => {
    expect(workflow).toContain('if [ "$TAG" != "v$VERSION" ]; then')
    expect(workflow).toContain('pnpm install --frozen-lockfile')
  })

  it('relies on prepublishOnly for the tests and the library build', () => {
    expect(pkg.scripts.prepublishOnly).toBe('npm run test && npm run build:lib')
    expect(workflow).not.toMatch(/--ignore-scripts|pnpm (run )?build:lib|pnpm test/)
  })

  it('the repository url matches GitHub exactly (required by trusted publishing)', () => {
    expect(pkg.repository.url).toBe('git+https://github.com/robinnat/mochiz.git')
    expect(pkg.publishConfig.access).toBe('public')
  })
})
