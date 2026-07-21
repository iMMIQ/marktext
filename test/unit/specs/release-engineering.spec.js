// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createChecksumManifest, findReleaseArtifacts } from '../../../tools/release/checksums.mjs'
import {
  detectNativeBinaryFormat,
  findRuntimeNativeBinaries,
  verifyNativeModules
} from '../../../tools/release/nativeBinary.mjs'
import { validateReleaseState } from '../../../tools/release/releaseState.mjs'

describe('release engineering checks', () => {
  it('creates a deterministic manifest for release files only', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-checksums-'))
    fs.writeFileSync(path.join(root, 'marktext.zip'), 'zip')
    fs.writeFileSync(path.join(root, 'marktext.AppImage'), 'appimage')
    fs.writeFileSync(path.join(root, 'latest-linux.yml'), 'update')
    fs.writeFileSync(path.join(root, 'builder-debug.yml'), 'debug')
    fs.writeFileSync(path.join(root, 'ignored.txt'), 'ignored')

    try {
      expect(findReleaseArtifacts(root)).toEqual([
        'latest-linux.yml',
        'marktext.AppImage',
        'marktext.zip'
      ])
      expect(createChecksumManifest(root).split('\n').filter(Boolean)).toEqual([
        expect.stringMatching(/^[0-9a-f]{64} {2}latest-linux\.yml$/),
        expect.stringMatching(/^[0-9a-f]{64} {2}marktext\.AppImage$/),
        expect.stringMatching(/^[0-9a-f]{64} {2}marktext\.zip$/)
      ])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('recognizes native binary formats by executable magic', () => {
    expect(detectNativeBinaryFormat(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBe('ELF')
    expect(detectNativeBinaryFormat(Buffer.from([0x4d, 0x5a, 0x00, 0x00]))).toBe('PE')
    expect(detectNativeBinaryFormat(Buffer.from([0xfe, 0xed, 0xfa, 0xcf]))).toBe('Mach-O')
  })

  it('rejects native modules from a different target platform', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-native-check-'))
    fs.writeFileSync(path.join(root, 'addon.node'), Buffer.from([0x7f, 0x45, 0x4c, 0x46]))

    try {
      expect(verifyNativeModules(root, 'linux')[0].valid).toBe(true)
      expect(verifyNativeModules(root, 'win32')[0]).toMatchObject({ format: 'ELF', expected: 'PE', valid: false })
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('limits package verification to runtime native dependencies', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'marktext-runtime-native-'))
    const runtime = path.join(root, 'keytar', 'build', 'Release')
    const tooling = path.join(root, '@rolldown', 'binding')
    fs.mkdirSync(runtime, { recursive: true })
    fs.mkdirSync(tooling, { recursive: true })
    fs.writeFileSync(path.join(runtime, 'keytar.node'), Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
    fs.writeFileSync(path.join(tooling, 'rolldown.node'), Buffer.from([0x7f, 0x45, 0x4c, 0x46]))

    try {
      expect(findRuntimeNativeBinaries(root).map(file => path.relative(root, file))).toEqual([
        path.join('keytar', 'build', 'Release', 'keytar.node')
      ])
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('requires package, tag, changelog, and AppStream release versions to agree', () => {
    expect(validateReleaseState({
      version: '0.18.3',
      changelog: '## 0.18.3\n',
      appData: '<release date="2026-07-21" version="0.18.3"/>',
      refName: 'v0.18.3',
      stable: true
    })).toEqual([])

    expect(validateReleaseState({
      version: '0.18.3-beta.2',
      changelog: '## 0.18.2\n',
      appData: '<release version="0.18.2"/>',
      refName: 'v0.18.3',
      stable: true
    })).toHaveLength(4)
  })
})
