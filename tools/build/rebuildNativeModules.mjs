import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { rebuild } from '@electron/rebuild'

const require = createRequire(import.meta.url)
const { version: electronVersion } = require('electron/package.json')
const electronBinary = require('electron')

const onlyModules = ['keytar', 'native-keymap', 'fontmanager-redux', 'ced']
const forceABI = Number(execFileSync(
  electronBinary,
  ['-p', 'process.versions.modules'],
  {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1'
    }
  }
).toString().trim())

rebuild({
  buildPath: path.resolve(process.cwd()),
  electronVersion,
  forceABI,
  force: true,
  onlyModules
}).catch(error => {
  console.error(error)
  process.exit(1)
})
