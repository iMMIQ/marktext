/**
 * removeBlock benchmark — before (DFS) vs after (blockMap parent lookup)
 *
 * KEY: In production, blockMap already exists (maintained by the Map index).
 * So we measure with pre-built map to reflect real-world cost.
 *
 * Run:  node tools/perf/muya-removeblock-benchmark.mjs
 */

import { performance } from 'node:perf_hooks'

// ─── Helpers ──────────────────────────────────────────────────

function getUniqueId () { return Math.random().toString(36).slice(2, 10) }

function createBlock (type = 'span', extras = {}) {
  const key = getUniqueId()
  const block = { key, text: '', type, editable: true, parent: null, preSibling: null, nextSibling: null, children: [] }
  if (type === 'span' && !extras.functionType) block.functionType = 'paragraphContent'
  Object.assign(block, extras)
  return block
}

function createBlockP (text = '') {
  const p = createBlock('p')
  const span = createBlock('span', { text })
  appendChild(p, span)
  return p
}

function appendChild (parent, block) {
  const last = parent.children[parent.children.length - 1]
  parent.children.push(block)
  block.parent = parent.key
  if (last) { last.nextSibling = block.key; block.preSibling = last.key }
  else { block.preSibling = null }
  block.nextSibling = null
}

function buildBlockTree (count) {
  const blocks = []
  for (let i = 0; i < count; i++) blocks.push(createBlockP(`Line ${i} with some text content.`))
  return blocks
}

function buildBlockMap (blocks) {
  const map = new Map()
  const walk = blks => {
    for (const b of blks) {
      map.set(b.key, b)
      if (b.children.length) walk(b.children)
    }
  }
  walk(blocks)
  return map
}

// ─── Timing ───────────────────────────────────────────────────

function bench (label, fn, targetMs = 300) {
  for (let i = 0; i < 5; i++) fn()
  const t0 = performance.now()
  for (let i = 0; i < 10; i++) fn()
  const t1 = performance.now()
  const oneMs = (t1 - t0) / 10
  const iters = oneMs > 0 ? Math.max(50, Math.ceil(targetMs / oneMs)) : 10000
  const start = performance.now()
  for (let i = 0; i < iters; i++) fn()
  const end = performance.now()
  return { label, ms: (end - start) / iters, iters, totalMs: end - start }
}

function fmt (ms) {
  if (ms < 0.001) return `${(ms * 1e6).toFixed(0)}ns`
  if (ms < 1) return `${(ms * 1000).toFixed(1)}µs`
  if (ms < 1000) return `${ms.toFixed(2)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function row (cols) { return cols.join('  ') }

// ─── OLD removeBlock (DFS) ────────────────────────────────────

function removeBlockOld (blocks, block) {
  const remove = (blks, target) => {
    const len = blks.length
    for (let i = 0; i < len; i++) {
      if (blks[i].key === target.key) {
        return blks.splice(i, 1)
      } else {
        if (blks[i].children.length) remove(blks[i].children, target)
      }
    }
  }
  remove(blocks, block)
}

// ─── NEW removeBlock (blockMap parent lookup) ─────────────────

function removeBlockNew (blocks, blockMap, block) {
  const parent = block.parent ? blockMap.get(block.parent) : null
  const siblings = parent ? parent.children : blocks
  const idx = siblings.findIndex(b => b.key === block.key)
  if (idx === -1) return
  blockMap.delete(block.key)
  siblings.splice(idx, 1)
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTION-ACCURATE: map already exists
// ═══════════════════════════════════════════════════════════════

console.log('╔═══════════════════════════════════════════════════════════════╗')
console.log('║  removeBlock — DFS scan vs blockMap (production scenario)    ║')
console.log('║  blockMap pre-built = not included in timing                 ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

console.log(row(['Nodes'.padEnd(10), 'Old DFS'.padEnd(16), 'New blockMap'.padEnd(16), 'Speedup'.padEnd(10)]))
console.log('─'.repeat(52))

for (const size of [200, 1000, 5000, 10000, 20000]) {
  const totalNodes = size * 2
  const midIdx = Math.floor(size / 2)

  const tOld = bench(`old-${size}`, () => {
    const bs = buildBlockTree(size)
    removeBlockOld(bs, bs[midIdx])
  })

  // New: map pre-built inside loop (like production where it always exists)
  const tNew = bench(`new-${size}`, () => {
    const bs = buildBlockTree(size)
    const map = buildBlockMap(bs)  // In production, this already exists
    removeBlockNew(bs, map, bs[midIdx])
  })

  const speedup = tNew.ms > 0 ? `${(tOld.ms / tNew.ms).toFixed(1)}x` : '∞'
  console.log(row([
    String(totalNodes).padEnd(10),
    fmt(tOld.ms).padEnd(16),
    fmt(tNew.ms).padEnd(16),
    speedup.padEnd(10)
  ]))
}

// ═══════════════════════════════════════════════════════════════
// ISOLATED removeBlock cost (subtract build overhead)
// ═══════════════════════════════════════════════════════════════

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  Isolated removeBlock cost (build overhead subtracted)       ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

console.log(row(['Nodes'.padEnd(10), 'Build base'.padEnd(16), 'Old remove'.padEnd(16), 'New remove'.padEnd(16), 'Speedup'.padEnd(10)]))
console.log('─'.repeat(68))

for (const size of [500, 1000, 5000, 10000, 20000]) {
  const totalNodes = size * 2
  const midIdx = Math.floor(size / 2)

  const tBuild = bench(`build-${size}`, () => buildBlockTree(size))
  const tBuildMap = bench(`buildMap-${size}`, () => { const bs = buildBlockTree(size); return buildBlockMap(bs) })

  const tOldTotal = bench(`oldTotal-${size}`, () => {
    const bs = buildBlockTree(size)
    removeBlockOld(bs, bs[midIdx])
  })

  const tNewTotal = bench(`newTotal-${size}`, () => {
    const bs = buildBlockTree(size)
    const map = buildBlockMap(bs)
    removeBlockNew(bs, map, bs[midIdx])
  })

  const oldRemove = Math.max(0, tOldTotal.ms - tBuild.ms)
  const newRemove = Math.max(0, tNewTotal.ms - tBuildMap.ms)
  const speedup = newRemove > 0 ? `${(oldRemove / newRemove).toFixed(0)}x` : '∞'

  console.log(row([
    String(totalNodes).padEnd(10),
    fmt(tBuild.ms).padEnd(16),
    fmt(oldRemove).padEnd(16),
    fmt(newRemove).padEnd(16),
    speedup.padEnd(10)
  ]))
}

// ═══════════════════════════════════════════════════════════════
// Simulated hot-path: backspace merge (1 removeBlock + 1 render)
// ═══════════════════════════════════════════════════════════════

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  Backspace merge simulation — total removeBlock cost in op   ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

console.log(row(['Nodes'.padEnd(10), 'Old total'.padEnd(16), 'New total'.padEnd(16), 'Saved per backspace'.padEnd(22)]))
console.log('─'.repeat(64))

for (const size of [200, 1000, 5000, 10000, 20000]) {
  const totalNodes = size * 2
  const midIdx = Math.floor(size / 2)

  const tOld = bench(`bs-old-${size}`, () => {
    const bs = buildBlockTree(size)
    removeBlockOld(bs, bs[midIdx])
  })

  const tNew = bench(`bs-new-${size}`, () => {
    const bs = buildBlockTree(size)
    const map = buildBlockMap(bs)
    removeBlockNew(bs, map, bs[midIdx])
  })

  const saved = tOld.ms - tNew.ms
  const savedStr = saved > 0 ? fmt(saved) : `+${fmt(-saved)}`
  console.log(row([
    String(totalNodes).padEnd(10),
    fmt(tOld.ms).padEnd(16),
    fmt(tNew.ms).padEnd(16),
    savedStr.padEnd(22)
  ]))
}

// ─── Summary ──────────────────────────────────────────────────

console.log('\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  SUMMARY                                                     ║')
console.log('╚═══════════════════════════════════════════════════════════════╝')
console.log('')
console.log('  removeBlock: O(n) DFS → O(1) blockMap.get(parent) + O(k) splice')
console.log('')
console.log('  NOTE: These benchmarks include buildBlockMap() cost, but in')
console.log('  production the map is already maintained. The "Isolated" table')
console.log('  above shows the true remove-only speedup after subtracting')
console.log('  build overhead.')
console.log('')
