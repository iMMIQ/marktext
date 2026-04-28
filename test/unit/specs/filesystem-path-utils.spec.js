import { describe, expect, it } from 'vitest'
import {
  IMAGE_EXTENSIONS,
  MARKDOWN_EXTENSIONS,
  MARKDOWN_INCLUSIONS,
  hasMarkdownExtension,
  isChildOfDirectory,
  isSamePathSync
} from '../../../src/common/filesystem/pathUtils'

describe('filesystem path utilities', () => {
  it('keeps markdown extension constants and glob inclusions in sync', () => {
    expect(MARKDOWN_EXTENSIONS).toContain('md')
    expect(MARKDOWN_INCLUSIONS).toEqual(MARKDOWN_EXTENSIONS.map(ext => `*.${ext}`))
  })

  it('detects markdown filenames without touching the filesystem', () => {
    expect(hasMarkdownExtension('/notes/README.MD')).toBe(true)
    expect(hasMarkdownExtension('/notes/archive.md.backup')).toBe(false)
    expect(hasMarkdownExtension('')).toBe(false)
    expect(hasMarkdownExtension(null)).toBe(false)
  })

  it('compares path strings consistently in renderer-safe code', () => {
    expect(isSamePathSync('/workspace/a.md', '/workspace/a.md')).toBe(true)
    expect(isSamePathSync('/workspace/a.md', '/workspace/A.md')).toBe(true)
    expect(isSamePathSync('/workspace/a.md', '/workspace/b.md')).toBe(false)
  })

  it('checks directory ancestry with normalized path semantics', () => {
    expect(isChildOfDirectory('/workspace', '/workspace/docs/readme.md')).toBe(true)
    expect(isChildOfDirectory('/workspace', '/workspace')).toBe(false)
    expect(isChildOfDirectory('/workspace', '/other/readme.md')).toBe(false)
  })

  it('exposes image extensions for main-process file checks', () => {
    expect(IMAGE_EXTENSIONS).toContain('png')
    expect(IMAGE_EXTENSIONS).toContain('webp')
  })
})
