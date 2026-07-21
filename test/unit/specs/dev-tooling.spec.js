// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ALL_DEV_BUILD_TARGETS, planDevChange } from '../../../tools/dev/devBuildPlan.mjs'

describe('development build planning', () => {
  it.each([
    ['src/main/index.js', ['main'], true, false],
    ['src/main/preload/index.js', ['preload'], true, false],
    ['src/renderer/main.js', ['renderer'], false, true],
    ['src/muya/lib/index.js', ['renderer', 'worker'], false, true],
    ['static/themes/dark.css', [], false, true],
    ['tools/build/marktextBun.mjs', ALL_DEV_BUILD_TARGETS, true, false]
  ])('maps %s to the required build boundary', (pathname, targets, restart, reload) => {
    expect(planDevChange(pathname)).toMatchObject({ targets, restart, reload })
  })

  it('normalizes Windows watcher paths', () => {
    expect(planDevChange('src\\renderer\\main.js').targets).toEqual(['renderer'])
  })
})
