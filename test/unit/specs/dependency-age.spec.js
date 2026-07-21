// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  extractLockedPackages,
  findChangedPackages,
  isOldEnough,
  parsePackageIdentifier
} from '../../../tools/release/dependencyAge.mjs'

describe('dependency age policy', () => {
  it('parses scoped, unscoped, and npm-aliased package identifiers', () => {
    expect(parsePackageIdentifier('axios@1.2.3')).toEqual({ name: 'axios', version: '1.2.3' })
    expect(parsePackageIdentifier('@scope/pkg@2.0.0-beta.1')).toEqual({ name: '@scope/pkg', version: '2.0.0-beta.1' })
    expect(parsePackageIdentifier('alias@npm:@actual/pkg@3.1.4')).toEqual({ name: '@actual/pkg', version: '3.1.4' })
  })

  it('extracts unique exact versions from Bun lock tuples', () => {
    const lock = [
      '    "axios": ["axios@1.2.3", "", {}],',
      '    "nested/axios": ["axios@1.2.3", "", {}],',
      '    "@scope/pkg": ["@scope/pkg@2.0.0", "", {}],'
    ].join('\n')

    expect([...extractLockedPackages(lock).keys()]).toEqual(['axios@1.2.3', '@scope/pkg@2.0.0'])
  })

  it('reports versions introduced since the selected base lock', () => {
    const base = '    "axios": ["axios@1.2.3", "", {}],'
    const current = [
      '    "axios": ["axios@1.2.4", "", {}],',
      '    "dayjs": ["dayjs@1.0.0", "", {}],'
    ].join('\n')

    expect(findChangedPackages(current, base)).toEqual([
      { name: 'axios', version: '1.2.4' },
      { name: 'dayjs', version: '1.0.0' }
    ])
  })

  it('enforces the full waiting period', () => {
    const now = new Date('2026-07-21T12:00:00Z')
    expect(isOldEnough('2026-07-14T12:00:00Z', now, 7)).toBe(true)
    expect(isOldEnough('2026-07-14T12:00:01Z', now, 7)).toBe(false)
  })
})
