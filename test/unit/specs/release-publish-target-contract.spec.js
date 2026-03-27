// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '../../..')
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')

describe('release publish target contract', () => {
  it('publishes release artifacts to the current GitHub Actions repository', () => {
    expect(releaseWorkflow).toContain('MARKTEXT_RELEASE_REPO_OWNER: $' + '{{ github.repository_owner }}')
    expect(releaseWorkflow).toContain('MARKTEXT_RELEASE_REPO_NAME: $' + '{{ github.event.repository.name }}')
    expect(releaseWorkflow).toContain('-c.publish.provider=github')
    expect(releaseWorkflow).toContain('-c.publish.owner=$MARKTEXT_RELEASE_REPO_OWNER')
    expect(releaseWorkflow).toContain('-c.publish.repo=$MARKTEXT_RELEASE_REPO_NAME')
    expect(releaseWorkflow).toContain('-c.publish.owner=$env:MARKTEXT_RELEASE_REPO_OWNER')
    expect(releaseWorkflow).toContain('-c.publish.repo=$env:MARKTEXT_RELEASE_REPO_NAME')
  })
})
