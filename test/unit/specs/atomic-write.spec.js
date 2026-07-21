// @vitest-environment node
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFileAtomic } from '../../../src/main/filesystem'
import { writeMarkdownFile } from '../../../src/main/filesystem/markdown'

describe('atomic document writes', () => {
  let directory

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marktext-atomic-write-'))
  })

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  it('replaces a markdown file only after the complete content is durable', async () => {
    const pathname = path.join(directory, 'document.md')
    await fs.writeFile(pathname, 'old content', { mode: 0o640 })

    await writeMarkdownFile(pathname, 'first\nsecond\n', {
      adjustLineEndingOnSave: true,
      lineEnding: 'crlf',
      encoding: { encoding: 'utf8', isBom: false }
    })

    expect(await fs.readFile(pathname, 'utf8')).toBe('first\r\nsecond\r\n')
    if (process.platform !== 'win32') {
      expect((await fs.stat(pathname)).mode & 0o777).toBe(0o640)
    }
    expect(await fs.readdir(directory)).toEqual(['document.md'])
  })

  it('keeps the original file and removes the temporary file when writing fails', async () => {
    const pathname = path.join(directory, 'document.md')
    await fs.writeFile(pathname, 'original content')

    await expect(writeFileAtomic(pathname, {}, '.md')).rejects.toThrow()

    expect(await fs.readFile(pathname, 'utf8')).toBe('original content')
    expect(await fs.readdir(directory)).toEqual(['document.md'])
  })

  it.skipIf(process.platform === 'win32')('updates a symbolic link target without replacing the link', async () => {
    const target = path.join(directory, 'target.md')
    const link = path.join(directory, 'linked.md')
    await fs.writeFile(target, 'old target')
    await fs.symlink(target, link)

    await writeFileAtomic(link, 'new target', '.md')

    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true)
    expect(await fs.readFile(target, 'utf8')).toBe('new target')
  })
})
