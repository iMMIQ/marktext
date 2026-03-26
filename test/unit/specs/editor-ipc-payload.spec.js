import { describe, expect, it } from 'vitest'
import { isProxy, reactive } from 'vue'
import { getOptionsFromState } from '../../../src/renderer/stores/helpers/editorDocuments'

describe('editor IPC payload contract', () => {
  it('returns cloneable save options from reactive file state', () => {
    const file = reactive({
      encoding: {
        encoding: 'utf8',
        isBom: false
      },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 3
    })

    const options = getOptionsFromState(file)

    expect(isProxy(options.encoding)).toBe(false)
    expect(() => structuredClone(options)).not.toThrow()
    expect(options).toEqual({
      encoding: {
        encoding: 'utf8',
        isBom: false
      },
      lineEnding: 'lf',
      adjustLineEndingOnSave: false,
      trimTrailingNewline: 3
    })
  })
})
