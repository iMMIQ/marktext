import { describe, expect, it } from 'vitest'

describe('muya html tag config', () => {
  it('exports full and void html tag lists', async () => {
    const config = await import('muya/lib/config')

    expect(config.HTML_TAGS).toContain('div')
    expect(config.VOID_HTML_TAGS).toContain('img')
    expect(config.VOID_HTML_TAGS).not.toContain('div')
  })
})
