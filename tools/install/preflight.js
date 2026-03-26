'use strict'

const nodeMajor = Number(process.versions.node.match(/^(\d+)\./)[1])
if (nodeMajor !== 24) {
  console.error('[ERROR] Node.js 24.x is required. See .nvmrc.\n')
  process.exit(1)
}

if (!/yarn\.js$/.test(process.env.npm_execpath || '')) {
  console.error('[ERROR] Please use yarn classic to install dependencies.\n')
  process.exit(1)
}
