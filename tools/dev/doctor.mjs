import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const releaseMode = process.argv.includes('--release')
const results = []

const record = (ok, label, detail, required = true) => {
  results.push({ ok, label, detail, required })
}

const commandResult = (command, args = ['--version']) => {
  return spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

const hasCommand = command => {
  const locator = process.platform === 'win32' ? 'where' : 'which'
  return commandResult(locator, [command]).status === 0
}
const expectedBun = pkg.packageManager.match(/^bun@(.+)$/)?.[1]

record(process.versions.node.split('.')[0] === '24', 'Node.js', `${process.version}; expected 24.x`)
record(process.versions.bun === expectedBun, 'Bun', `${process.versions.bun || 'not running under Bun'}; expected ${expectedBun}`)
record(hasCommand('git'), 'Git', 'required for build revision metadata')
record(hasCommand('python3'), 'Python 3', 'required by node-gyp')
record(hasCommand(process.platform === 'win32' ? 'cl' : 'c++'), 'C++ compiler', 'required by native Electron modules')

if (process.platform === 'linux') {
  record(hasCommand('pkg-config'), 'pkg-config', 'required to locate native libraries')
  for (const moduleName of ['x11', 'xkbfile', 'libsecret-1', 'fontconfig']) {
    const found = commandResult('pkg-config', ['--exists', moduleName]).status === 0
    record(found, `native library ${moduleName}`, 'install the corresponding development package')
  }

  for (const command of ['bwrap', 'Xvfb', 'dbus-run-session']) {
    record(hasCommand(command), command, 'required for desktop-isolated E2E')
  }

  if (releaseMode) {
    record(hasCommand('rpmbuild'), 'rpmbuild', 'required for Linux RPM packaging')
    record(hasCommand('wine'), 'Wine', 'optional for future Windows cross-package verification', false)
  }
}

for (const result of results) {
  const status = result.ok ? 'ok' : (result.required ? 'error' : 'warn')
  console.log(`[${status}] ${result.label}: ${result.detail}`)
}

const failures = results.filter(result => result.required && !result.ok)
if (failures.length) {
  console.error(`\nEnvironment check failed with ${failures.length} required item(s) missing or mismatched.`)
  process.exitCode = 1
} else {
  console.log('\nEnvironment check passed.')
}
