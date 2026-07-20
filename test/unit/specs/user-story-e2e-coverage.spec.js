import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const acceptanceIdPattern = /US-\d{2}\.AC-\d{2}/g

describe('User Story E2E traceability', () => {
  it('maps every documented acceptance criterion to exactly one story test title', () => {
    const document = fs.readFileSync('docs/quality/USER_STORY_E2E.md', 'utf8')
    const documentedIds = [...document.matchAll(acceptanceIdPattern)].map(match => match[0])
    const storyDir = 'test/e2e/stories'
    const storySource = fs.readdirSync(storyDir)
      .filter(file => file.endsWith('.spec.js'))
      .map(file => fs.readFileSync(path.join(storyDir, file), 'utf8'))
      .join('\n')
    const automatedIds = [...storySource.matchAll(acceptanceIdPattern)].map(match => match[0])

    expect(new Set(automatedIds)).toEqual(new Set(documentedIds))
    for (const id of new Set(documentedIds)) {
      expect(automatedIds.filter(candidate => candidate === id), id).toHaveLength(1)
    }
  })
})
