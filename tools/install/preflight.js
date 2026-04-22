'use strict'

const nodeMajor = Number(process.versions.node.match(/^(\d+)\./)[1])
const userAgent = process.env.npm_config_user_agent || ''
const execPath = process.env.npm_execpath || ''

if (nodeMajor !== 24) {
  console.error('[ERROR] Node.js 24.x is required. See .nvmrc.\n')
  process.exit(1)
}

if (!/^bun\//.test(userAgent) && !/(^|[/\\])bun(?:\.exe)?$/.test(execPath)) {
  console.error('[ERROR] Please use Bun to install dependencies.\n')
  process.exit(1)
}
