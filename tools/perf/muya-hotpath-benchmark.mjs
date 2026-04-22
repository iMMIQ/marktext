/**
 * Muya Hot-Path Performance Benchmark
 *
 * Measures actual CPU cost of each bottleneck using REAL Muya algorithms.
 * Functions are inlined to avoid ESM import chain issues.
 *
 * Run:  node tools/perf/muya-hotpath-benchmark.mjs
 */

import { performance } from 'node:perf_hooks'

// ─── Inline deepCopy (from src/muya/lib/utils/index.js) ───────

function deepCopyArray (array) {
  const result = []
  const len = array.length
  let i
  for (i = 0; i < len; i++) {
    if (typeof array[i] === 'object' && array[i] !== null) {
      if (Array.isArray(array[i])) result.push(deepCopyArray(array[i]))
      else result.push(deepCopy(array[i]))
    } else {
      result.push(array[i])
    }
  }
  return result
}

function deepCopy (object) {
  const obj = {}
  Object.keys(object).forEach(key => {
    if (typeof object[key] === 'object' && object[key] !== null) {
      if (Array.isArray(object[key])) obj[key] = deepCopyArray(object[key])
      else obj[key] = deepCopy(object[key])
    } else {
      obj[key] = object[key]
    }
  })
  return obj
}

// ─── Inline parser rules (regex only, from rules.js) ──────────

const beginRules = {
  hr: /^(\*{3,}$|^-{3,}$|^_{3,}$)/,
  code_fense: /^(`{3,})([^`]*)$/,
  header: /(^ {0,3}#{1,6}(\s{1,}|$))/,
  reference_definition: /^( {0,3}\[)([^\]]+?)(\\*)(\]: *)(<?)([^\s>]+)(>?)(?:( +)(["'(]?)([^\n"'()]+)\9)?( *)$/,
  multiple_math: /^(\$\$)$/
}

const inlineRules = {
  strong: /^(\*\*|__)(?=\S)([\s\S]*?[^\s\\])(\\*)\1(?!(\*|_))/,
  em: /^(\*|_)(?=\S)([\s\S]*?[^\s*\\])(\\*)\1(?!\1)/,
  inline_code: /^(`{1,3})([^`]+?|.{2,})\1/,
  image: /^(!\[)(.*?)(\\*)\]\((.*)(\\*)\)/,
  link: /^(\[)((?:\[[^\]]*\]|[^[\]]|\](?=[^[]*\]))*?)(\\*)\]\((.*)(\\*)\)/,
  emoji: /^(:)([a-z_\d+-]+?)\1/,
  del: /^(~~)(?=\S)([\s\S]*?[^\s\\])(\\*)\1/,
  auto_link: /^<[a-zA-Z][^>]+>/,
  inline_math: /^(\$)([^$]+?)\$/,
  super_sub_script: /^(\^|~)([^\s^~]+?)\1/,
  soft_line_break: /^(\n)/,
  hard_line_break: /^(\s{2,})\n/,
  // simplified
  html_tag: /^<[a-zA-Z][a-zA-Z0-9-]*[^>]*>/
}

// Simplified inline tokenizer that exercises the same regex engine
// This is functionally equivalent to Muya's tokenizer for perf measurement
function simpleTokenizer (src, hasBeginRules = true) {
  const tokens = []
  let remaining = src
  let pos = 0

  // begin rules (tried once at start)
  if (hasBeginRules) {
    for (const [name, rule] of Object.entries(beginRules)) {
      const m = rule.exec(remaining)
      if (m) {
        tokens.push({ type: name, raw: m[0], range: { start: 0, end: m[0].length } })
        remaining = remaining.slice(m[0].length)
        pos += m[0].length
        break
      }
    }
  }

  // inline rules (tried at each position)
  while (remaining.length > 0) {
    let matched = false
    for (const [name, rule] of Object.entries(inlineRules)) {
      const m = rule.exec(remaining)
      if (m && m.index === 0) {
        tokens.push({ type: name, raw: m[0], range: { start: pos, end: pos + m[0].length } })
        remaining = remaining.slice(m[0].length)
        pos += m[0].length
        matched = true
        break
      }
    }
    if (!matched) {
      // advance one character as text
      if (tokens.length > 0 && tokens[tokens.length - 1].type === 'text') {
        tokens[tokens.length - 1].raw += remaining[0]
        tokens[tokens.length - 1].range.end++
      } else {
        tokens.push({ type: 'text', raw: remaining[0], range: { start: pos, end: pos + 1 } })
      }
      remaining = remaining.slice(1)
      pos++
    }
  }

  return tokens
}

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
  if (last) {
    last.nextSibling = block.key
    block.preSibling = last.key
  } else {
    block.preSibling = null
  }
  block.nextSibling = null
}

function buildBlockTree (count) {
  const blocks = []
  for (let i = 0; i < count; i++) blocks.push(createBlockP(`Line ${i} with some text content.`))
  return blocks
}

// ─── Timing ───────────────────────────────────────────────────

function bench (label, fn, targetMs = 200) {
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

// ═══════════════════════════════════════════════════════════════
// BENCHMARK 1: Tokenizer per-call cost
// ═══════════════════════════════════════════════════════════════

console.log('╔═══════════════════════════════════════════════════════════════╗')
console.log('║  1. TOKENIZER — per-call cost with various text inputs       ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

const textSamples = {
  'plain text (50ch)': 'Hello world, this is a plain paragraph with some text.',
  'inline markup (80ch)': 'This has **bold**, *italic*, `code`, and a [link](https://example.com) inside.',
  'heading + markers': '## This is a heading with **bold** and `code`',
  'complex inline (150ch)': 'Text with **bold** and *italic* and `code` and [link](url) and ![img](src) and $math$ all mixed together.',
  'table cell': '| Header 1 | Header 2 |',
  'reference def': '[label]: https://example.com "Title"'
}

console.log(row(['Input'.padEnd(28), 'Time/call'.padEnd(14), 'Calls/s'.padEnd(14)]))
console.log('─'.repeat(56))

for (const [name, text] of Object.entries(textSamples)) {
  const t = bench(`tok-${name}`, () => simpleTokenizer(text))
  const callsPerSec = t.ms > 0 ? Math.round(1000 / t.ms) : Infinity
  console.log(row([name.padEnd(28), fmt(t.ms).padEnd(14), callsPerSec.toLocaleString().padEnd(14)]))
}

// ═══════════════════════════════════════════════════════════════
// BENCHMARK 2: Tokenizer multi-call on keystroke
// ═══════════════════════════════════════════════════════════════

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  2. TOKENIZER MULTI-CALL — simulated keystroke hot path      ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

const keystrokeText = 'This has **bold**, *italic* and `code` in it.'
const oldText = 'This has **bold**, *italic* and `code` in i'
const newText = keystrokeText

function simCheckNotSameToken (oldT, newT) {
  const oldTokens = simpleTokenizer(oldT)
  const tokens = simpleTokenizer(newT)
  const oldCache = {}
  const cache = {}
  for (const { type } of oldTokens) { oldCache[type] = (oldCache[type] || 0) + 1 }
  for (const { type } of tokens) { cache[type] = (cache[type] || 0) + 1 }
  return Object.keys(oldCache).length !== Object.keys(cache).length
}

function simCheckCursorInTokenType (text, offset, type) {
  const tokens = simpleTokenizer(text, false)
  return tokens.filter(t => t.type === type).some(t => offset >= t.range.start && offset <= t.range.end)
}

function simCheckNeedRender (text, offset) {
  const NO_NEED_TOKEN_REG = /text|hard_line_break|soft_line_break/
  const tokens = simpleTokenizer(text)
  for (const token of tokens) {
    if (NO_NEED_TOKEN_REG.test(token.type)) continue
    const { start, end } = token.range
    if (offset >= Math.max(0, start - 1) && offset <= Math.min(text.length, end + 1)) return true
  }
  return false
}

const tCheckNotSame = bench('checkNotSameToken', () => simCheckNotSameToken(oldText, newText))
const tCheckCursor = bench('checkCursorInTokenType', () => simCheckCursorInTokenType(newText, 20, 'strong'))
const tCheckNeedRenderStart = bench('checkNeedRender(start)', () => simCheckNeedRender(newText, 20))
const tCheckNeedRenderEnd = bench('checkNeedRender(end)', () => simCheckNeedRender(newText, 20))

console.log('  Cost of each tokenizer call during a single keystroke:\n')
console.log(row(['Call'.padEnd(35), 'Time/call'.padEnd(14)]))
console.log('─'.repeat(49))
console.log(row(['checkNotSameToken x2 (old+new)'.padEnd(35), fmt(tCheckNotSame.ms).padEnd(14)]))
console.log(row(['checkCursorInTokenType x1'.padEnd(35), fmt(tCheckCursor.ms).padEnd(14)]))
console.log(row(['checkNeedRender(start block) x1'.padEnd(35), fmt(tCheckNeedRenderStart.ms).padEnd(14)]))
console.log(row(['checkNeedRender(end block) x1'.padEnd(35), fmt(tCheckNeedRenderEnd.ms).padEnd(14)]))
const totalTokMs = tCheckNotSame.ms + tCheckCursor.ms + tCheckNeedRenderStart.ms + tCheckNeedRenderEnd.ms
console.log(row(['TOTAL tokenizer cost per keystroke'.padEnd(35), fmt(totalTokMs).padEnd(14)]))
console.log('\n  Note: checkNotSameToken calls tokenizer 2x internally (old + new text).')
console.log('  Total tokenizer invocations per keystroke: 5 (2+1+1+1)')

// ═══════════════════════════════════════════════════════════════
// BENCHMARK 3: collectLabels tree walk
// ═══════════════════════════════════════════════════════════════

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  3. collectLabels() — tree walk on every render              ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

const refDefRegex = beginRules.reference_definition

function simCollectLabels (blocks) {
  const labels = new Map()
  const travel = block => {
    const { text, children } = block
    if (children && children.length) {
      children.forEach(c => travel(c))
    } else if (text) {
      const tokens = refDefRegex.exec(text)
      if (tokens) {
        const key = (tokens[2] + tokens[3]).toLowerCase()
        if (!labels.has(key)) {
          labels.set(key, { href: tokens[6], title: tokens[10] || '' })
        }
      }
    }
  }
  blocks.forEach(b => travel(b))
  return labels
}

console.log(row(['Nodes'.padEnd(10), 'Time/call'.padEnd(14), 'Calls/s'.padEnd(14), 'Notes'.padEnd(20)]))
console.log('─'.repeat(58))

for (const size of [100, 500, 1000, 5000, 10000]) {
  const blocks = buildBlockTree(size)
  blocks[size - 1].children[0].text = '[ref]: https://example.com "Title"'
  const totalNodes = size * 2
  const t = bench(`collectLabels-${size}`, () => simCollectLabels(blocks))
  const cps = t.ms > 0 ? Math.round(1000 / t.ms) : Infinity
  console.log(row([String(totalNodes).padEnd(10), fmt(t.ms).padEnd(14), cps.toLocaleString().padEnd(14), 'full tree walk'.padEnd(20)]))
}

// ═══════════════════════════════════════════════════════════════
// BENCHMARK 4: deepCopy vs alternatives
// ═══════════════════════════════════════════════════════════════

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  4. deepCopy — history snapshot cost                         ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

console.log(row(['Nodes'.padEnd(10), 'deepCopy'.padEnd(14), 'structuredClone'.padEnd(18), 'JSON parse/stringify'.padEnd(22)]))
console.log('─'.repeat(64))

for (const size of [100, 500, 1000, 5000, 10000]) {
  const blocks = buildBlockTree(size)
  const totalNodes = size * 2
  const state = { blocks, cursor: { start: { key: 'a', offset: 0 }, end: { key: 'a', offset: 0 } } }

  const tDeep = bench(`deepCopy-${size}`, () => deepCopy(state))
  const tClone = bench(`structuredClone-${size}`, () => structuredClone(state))
  const tJson = bench(`jsonClone-${size}`, () => JSON.parse(JSON.stringify(state)))

  console.log(row([
    String(totalNodes).padEnd(10),
    fmt(tDeep.ms).padEnd(14),
    fmt(tClone.ms).padEnd(18),
    fmt(tJson.ms).padEnd(22)
  ]))
}

// ═══════════════════════════════════════════════════════════════
// BENCHMARK 5: removeBlock scan vs Map
// ═══════════════════════════════════════════════════════════════

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  5. removeBlock — recursive tree scan vs Map lookup          ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

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

function removeBlockNew (blocks, blockMap, block) {
  const parentKey = block.parent
  const siblings = parentKey ? blockMap.get(parentKey).children : blocks
  const idx = siblings.findIndex(b => b.key === block.key)
  if (idx !== -1) {
    const pre = block.preSibling ? blockMap.get(block.preSibling) : null
    const next = block.nextSibling ? blockMap.get(block.nextSibling) : null
    if (pre) pre.nextSibling = next ? next.key : null
    if (next) next.preSibling = pre ? pre.key : null
    blockMap.delete(block.key)
    siblings.splice(idx, 1)
  }
}

console.log(row(['Nodes'.padEnd(10), 'Old O(n) scan'.padEnd(18), 'New Map lookup'.padEnd(18), 'Speedup'.padEnd(10)]))
console.log('─'.repeat(56))

for (const size of [200, 1000, 5000, 10000]) {
  const midIdx = Math.floor(size / 2)

  const tOld = bench(`removeOld-${size}`, () => {
    const bs = buildBlockTree(size)
    removeBlockOld(bs, bs[midIdx])
  })

  const tNew = bench(`removeNew-${size}`, () => {
    const bs = buildBlockTree(size)
    const map = new Map()
    const walk = blks => { for (const b of blks) { map.set(b.key, b); if (b.children.length) walk(b.children) } }
    walk(bs)
    removeBlockNew(bs, map, bs[midIdx])
  })

  const speedup = tNew.ms > 0 ? `${(tOld.ms / tNew.ms).toFixed(0)}x` : '∞'
  console.log(row([String(size * 2).padEnd(10), fmt(tOld.ms).padEnd(18), fmt(tNew.ms).padEnd(18), speedup.padEnd(10)]))
}

// ═══════════════════════════════════════════════════════════════
// BENCHMARK 6: partialRender findIndex
// ═══════════════════════════════════════════════════════════════

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  6. partialRender — blocks.findIndex() x2                    ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

console.log(row(['Top-level blocks'.padEnd(18), 'findIndex x2'.padEnd(16), 'Map lookup x2'.padEnd(16), 'Speedup'.padEnd(10)]))
console.log('─'.repeat(60))

for (const size of [100, 500, 1000, 5000, 10000]) {
  const blocks = buildBlockTree(size)
  const midKey = blocks[Math.floor(size / 2)].key
  const endKey = blocks[Math.floor(size * 0.75)].key
  const indexMap = new Map()
  blocks.forEach((b, i) => indexMap.set(b.key, i))

  const tOld = bench(`findIdx-${size}`, () => {
    blocks.findIndex(b => b.key === midKey)
    blocks.findIndex(b => b.key === endKey)
  })

  const tNew = bench(`mapIdx-${size}`, () => {
    indexMap.get(midKey)
    indexMap.get(endKey)
  })

  const speedup = tNew.ms > 0 ? `${(tOld.ms / tNew.ms).toFixed(0)}x` : '∞'
  console.log(row([String(size).padEnd(18), fmt(tOld.ms).padEnd(16), fmt(tNew.ms).padEnd(16), speedup.padEnd(10)]))
}

// ═══════════════════════════════════════════════════════════════
// BENCHMARK 7: Aggregated keystroke cost at N nodes
// ═══════════════════════════════════════════════════════════════

console.log('\n\n╔═══════════════════════════════════════════════════════════════╗')
console.log('║  7. AGGREGATED — simulated keystroke at N document nodes     ║')
console.log('╚═══════════════════════════════════════════════════════════════╝\n')

for (const size of [200, 1000, 5000, 10000]) {
  const blocks = buildBlockTree(size)
  const totalNodes = size * 2
  const midIdx = Math.floor(size / 2)
  const text = blocks[midIdx].children[0].text
  const oldText2 = text.slice(0, -1)
  console.log(`  ── ${totalNodes} nodes (${size} paragraphs) ──\n`)

  // Tokenizer x5
  const tTok = bench('tok5', () => {
    simpleTokenizer(oldText2)
    simpleTokenizer(text)
    simpleTokenizer(text, false)
    simpleTokenizer(text)
    simpleTokenizer(text)
  })

  // collectLabels
  const tLabels = bench('labels', () => simCollectLabels(blocks))

  // deepCopy (history push)
  const state = { blocks, cursor: { start: { key: 'a', offset: 0 }, end: { key: 'a', offset: 0 } } }
  const tDeep = bench('deep', () => deepCopy(state))

  // getBlock x9 (Map O(1))
  const blockMap = new Map()
  const walkMap = blks => { for (const b of blks) { blockMap.set(b.key, b); if (b.children.length) walkMap(b.children) } }
  walkMap(blocks)
  const cursorKey = blocks[midIdx].children[0].key
  const tGetBlock = bench('getblock', () => { for (let i = 0; i < 9; i++) blockMap.get(cursorKey) })

  // removeBlock old scan
  const tRemoveOld = bench('rmOld', () => {
    const bs = buildBlockTree(size)
    removeBlockOld(bs, bs[midIdx])
  })

  // findIndex x2
  const tFindIdx = bench('findIdx', () => {
    blocks.findIndex(b => b.key === cursorKey)
    blocks.findIndex(b => b.key === cursorKey)
  })

  console.log(row(['  Component'.padEnd(30), 'Time'.padEnd(14), 'Notes'.padEnd(30)]))
  console.log('  ' + '─'.repeat(72))
  console.log(row(['  tokenizer x5'.padEnd(30), fmt(tTok.ms).padEnd(14), 'checkNotSame+checkCursor+checkNeedRender'.padEnd(30)]))
  console.log(row(['  collectLabels x1'.padEnd(30), fmt(tLabels.ms).padEnd(14), 'full tree walk per render'.padEnd(30)]))
  console.log(row(['  deepCopy (history push)'.padEnd(30), fmt(tDeep.ms).padEnd(14), 'snapshot entire tree'.padEnd(30)]))
  console.log(row(['  getBlock x9 (Map O(1))'.padEnd(30), fmt(tGetBlock.ms).padEnd(14), 'already optimized'.padEnd(30)]))
  console.log(row(['  removeBlock (tree scan)'.padEnd(30), fmt(tRemoveOld.ms).padEnd(14), 'per structural edit'.padEnd(30)]))
  console.log(row(['  findIndex x2 (partialRender)'.padEnd(30), fmt(tFindIdx.ms).padEnd(14), 'top-level array scan'.padEnd(30)]))
  const total = tTok.ms + tLabels.ms + tDeep.ms + tGetBlock.ms + tRemoveOld.ms + tFindIdx.ms
  console.log('  ' + '─'.repeat(72))
  console.log(row(['  TOTAL'.padEnd(30), fmt(total).padEnd(14), ''.padEnd(30)]))
  console.log('')
}

// ─── Summary ──────────────────────────────────────────────────

console.log('╔═══════════════════════════════════════════════════════════════╗')
console.log('║  SUMMARY — Ranked by measured impact                        ║')
console.log('╚═══════════════════════════════════════════════════════════════╝')
console.log('')
