#!/usr/bin/env bun
/* global Bun */

import { buildPack, buildRenderer, buildRendererWorker, createMainBuildOptions, createPreloadBuildOptions, createRendererBuildOptions, createRendererWorkerBuildOptions } from './marktextBun.mjs'

const printBuildResult = (label, result) => {
  if (result.success) {
    return
  }

  console.error(`\n${label} build failed`)
  for (const log of result.logs || []) {
    console.error(log.message || log.text || String(log))
  }
  throw new Error(`${label} build failed`)
}

export const runPack = async ({ production = true } = {}) => {
  const results = await buildPack({ production })
  printBuildResult('main', results[0])
  printBuildResult('preload', results[1])
  printBuildResult('renderer', results[2])
  printBuildResult('renderer worker', results[3])
  return results
}

export const buildConfigs = {
  main: createMainBuildOptions,
  preload: createPreloadBuildOptions,
  renderer: createRendererBuildOptions,
  worker: createRendererWorkerBuildOptions
}

const parseTargets = argv => {
  const targetArg = argv.find(arg => arg.startsWith('--target='))
  const target = targetArg ? targetArg.slice('--target='.length) : 'all'
  return target === 'all' ? ['main', 'preload', 'renderer'] : [target]
}

if (import.meta.main) {
  const targets = parseTargets(process.argv.slice(2))

  if (targets.length === 3) {
    await runPack()
  } else {
    for (const target of targets) {
      if (target === 'renderer') {
        const result = await buildRenderer()
        printBuildResult(target, result)
        continue
      }
      if (target === 'worker') {
        const result = await buildRendererWorker()
        printBuildResult(target, result)
        continue
      }

      const configFactory = buildConfigs[target]
      if (!configFactory) {
        throw new Error(`Unknown build target: ${target}`)
      }

      const result = await Bun.build(configFactory())
      printBuildResult(target, result)
    }
  }
}
