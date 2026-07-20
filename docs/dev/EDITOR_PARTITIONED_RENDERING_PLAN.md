# Editor Data Architecture and Incremental Rendering Plan

## Document Status

Status: proposed target architecture and migration contract

Last revised: 2026-07-20

Scope: Muya document storage, editing, parsing, indexing, layout, rendering,
history, search, save, and large-document verification

This document supersedes the previous phase-based partitioned-rendering plan.
The earlier work proved that mounting fewer DOM nodes helps, but it did not
complete the data-model migration. In particular, a virtual DOM over an
unbounded, partially hydrated block tree is not a complete virtual editor.

Nothing in this document is marked complete merely because a test once passed.
A migration stage is complete only when its exit gates, correctness properties,
performance budgets, and production call-site audit all pass on the same commit.

### Implementation Ledger

The 2026-07-20 implementation slice establishes the M0/M1 foundation but does
not complete either migration stage:

- `DocumentStore` is a persistent chunked treap with immutable snapshots,
  revision-checked replace transactions, inverse transactions, and stable
  left/right-affinity anchors.
- Partition offsets and placeholder ranges are remapped through every committed
  compatibility transaction, and in-flight hydration is invalidated. The known
  prefix-edit stale-slice failure has a regression test.
- Hydration and placeholder creation read bounded ranges from `DocumentStore`
  instead of flattening `canonicalMarkdown` internally.
- For a partitioned document, normal input exports only the materialized island
  containing the cursor. Ambiguous or cross-placeholder selections retain the
  full-export correctness fallback.
- Word count and TOC work is coalesced after partitioned-document input instead
  of running before the input change event returns.
- Deferred first-editable anchors now have a single model/DOM lifetime: idle
  hydration removes both, while a focused or edited anchor is retained as a
  real paragraph. Stale browser selections are ignored rather than dereferenced.

Still pending are transaction-first command mutation, transaction history,
anchor-based DOM selection, incremental semantic indexes, parser checkpoints,
Block cache eviction, application-state handles, and streamed open/save. Until
those items pass their stage gates, Blocks and the renderer Markdown string
remain compatibility mirrors and the migration status remains in progress.

Verification for this slice:

| Gate | Result |
| --- | --- |
| Unit suite | 38 files / 888 tests passed |
| Production pack | passed |
| Isolated Linux desktop preflight | passed on a private Xvfb display |
| `US-07` E2E | 2 tests passed; hostile, top, middle, bottom, edited, and undo screenshots reviewed |
| 128 MiB `DocumentStore` microbenchmark | build about 275 ms; tail edit about 2 ms; bounded tail slice about 0.03 ms; renderer-process RSS about 202 MiB in the standalone run |
| 128 MiB isolated application run | first editable 4.415 s; input ready 5.043 s; measured change dispatch 1.6 ms; no renderer crash |

## Executive Decision

MarkText will use an incrementally editable text store as the sole source of
document truth. Every edit will enter the system as a versioned text
transaction. Parsing, partitions, rich block models, semantic indexes, layout,
DOM, and application state are derived views with explicit ownership and bounded
lifetime.

The target pipeline is:

```text
File stream
   |
   v
DocumentStore (chunked text tree, authoritative)
   |
   +--> EditTransaction --> new document revision
   |          |
   |          +--> AnchorMap / inverse transaction / dirty ranges
   |
   +--> PartitionIndex + parser checkpoints
   |          |
   |          +--> bounded BlockParseCache
   |
   +--> HeadingIndex / ReferenceIndex / SearchIndex / WordCountIndex
   |
   +--> LayoutIndex --> bounded ViewportRenderCache --> DOM
   |
   +--> immutable save snapshot --> streamed atomic write
```

The current `blocks` array must stop being the effective source of truth.
`canonicalMarkdown` must stop being a flat string that is repeatedly rebuilt
from those blocks. A second `DocumentModel` mirror is not an architecture: it
must either disappear or be replaced by the authoritative `DocumentStore`
described here.

## Product Outcomes

This design must make the following user outcomes true for the same editor,
without a separate large-file mode:

1. Opening a document shows editable viewport content before the rest of the
   document is parsed or rendered.
2. Typing, paste, undo, redo, search, navigation, and save always operate on the
   complete document, including content that has never been rendered.
3. Moving through a large document does not cause an ever-growing block tree,
   DOM, parse cache, or render cache.
4. Background work cannot overwrite a newer edit, move the selection, or change
   the scroll anchor after its source revision becomes stale.
5. Saving is byte-correct with respect to the current text snapshot and never
   depends on exporting the hydrated block subset.
6. Small documents keep full Markdown behavior; scale changes scheduling and
   cache occupancy, not semantics.

The user-visible story remains `US-07` in
`docs/quality/USER_STORY_E2E.md`. This architecture also underpins document
lifecycle, editing, search, rich content, and publishing stories; scale is not
an isolated feature.

## Current-State Audit

The current implementation is a transitional mixed model. It has useful pieces,
but their ownership relationships are unsafe.

| Area | Current behavior | Consequence |
| --- | --- | --- |
| Authoritative content | `ContentState.blocks` is mutated by editor commands; `canonicalMarkdown` is synchronized through export/change paths | Two representations can disagree, and an input can require full-tree serialization |
| Partition coordinates | `partitionMap` stores absolute `startOffset` and `endOffset` values into one Markdown string | A length-changing edit before a partition makes later coordinates stale |
| Hydration | `_hydratePartitionChunk` slices `canonicalMarkdown` using stored partition offsets | Stale coordinates can parse the wrong substring; this is data correctness, not only latency |
| Rich model lifetime | Placeholders are replaced with parsed Blocks and retained in `blocks` | DOM roots are bounded, but model memory and traversal cost continue growing |
| Duplicate model | `DocumentModel.rebuildFromBlocks` copies the block graph | Production readers do not use it as authority, so it adds cost without resolving ownership |
| Search | Search recursively walks hydrated Blocks | Matches in unhydrated content are absent |
| TOC | TOC scans hydrated root Blocks | Heading navigation is incomplete until hydration happens to reach every heading |
| History | History stores Block snapshots, sharing selected roots | Memory and correctness remain coupled to hydration and mutable Block identity |
| Cursor | Selection uses Block keys and local offsets | Unmounted or evicted content has no durable position representation |
| Change dispatch | Markdown export, word count, cursor, history, and TOC can share the input path | One keystroke can trigger work proportional to document or hydrated-model size |
| Application state | Full Markdown crosses renderer/editor state boundaries | Reactive propagation can retain or copy a document-sized value unnecessarily |

Relevant implementation points at the time of this audit:

- `src/muya/lib/contentState/index.js`: mixed state construction and partition
  hydration.
- `src/muya/lib/contentState/partitionMap.js`: flat absolute-offset partition
  records.
- `src/muya/lib/contentState/documentModel.js`: rebuilt normalized mirror.
- `src/muya/lib/index.js`: change dispatch and derived-state fan-out.
- `src/muya/lib/contentState/searchCtrl.js`: hydrated-Block search.
- `src/muya/lib/contentState/tocCtrl.js`: hydrated-Block TOC.
- `src/muya/lib/contentState/history.js`: Block snapshot history.

### Immediate Correctness Containment

Until the authoritative transaction model and incremental partition index are
live, a length-changing edit invalidates all absolute partition offsets after
the edit. Code must not hydrate a later placeholder from those old offsets.

The temporary correctness rule is one of:

1. synchronously rebuild the partition map from the updated canonical text and
   invalidate all in-flight hydration jobs; or
2. cancel lazy hydration and materialize a known-correct representation for the
   edited document.

The application may temporarily spend more time, but it may not silently slice
and parse the wrong text. This containment is a release blocker, not an optional
optimization.

## Measured Evidence

Measurements diagnose the current implementation; they do not prove the target
architecture is implemented.

### 838 KB Real-World Document

Fixture used locally:

```text
~/code/CppCoreGuideline/CppCoreGuidelines.md
838,452 bytes
23,088 lines
```

Historical cold-start runs improved first-editable latency to roughly 1.6-2.0
seconds after viewport work. This is useful evidence that reducing initial
render scope works. It does not cover sustained edits, global features, cache
eviction, or stale partition positions.

The path above is developer-local evidence only. Committed E2E tests must create
their own fixtures in an isolated temporary directory and must never import a
real home or source directory.

### Temporary 128 MiB Stress Test

A generated 134,217,728-byte Markdown document produced 131,072 partitions.
Observed on 2026-07-20:

| Metric | Observation |
| --- | ---: |
| First content | about 6.25 s |
| Longest main-thread task | 4.443 s |
| Typing about 27 characters | 12.857 s |
| Renderer RSS | 173.5 MiB to 619.7 MiB |
| Mounted real DOM roots | 8 to 49 |

The small DOM count shows viewport mounting is working. The input delay and RSS
growth show that full-document strings, indexes, derived block state, and
synchronous whole-document work still dominate.

Supporting microbenchmarks on the same input:

| Operation | Observation |
| --- | ---: |
| `createPartitionMap(128 MiB)` | about 1.38 s and about 60 MiB RSS increase |
| one `wordCount(128 MiB)` | about 563 ms and about 39 MiB additional RSS |

A one-character insertion before a later partition also demonstrated stale
coordinates directly: the old range expected `beta` but sliced `\nbeta`.

Raw local telemetry, when retained, lives under ignored `test-results/` and is
not a portable repository fixture.

After the M0/M1 implementation slice, the same exact-size fixture completed an
isolated cold-start input probe with these single-run measurements:

| Metric | Observation |
| --- | ---: |
| Main entry to first editable | 4.415 s |
| Main entry to typed character visible | 5.043 s |
| First editable to typed character visible | 765 ms |
| `dispatchChange` transaction/export island | 1.6 ms |
| `setMarkdown` to partition-map completion | 1.711 s |

The remaining input-ready interval includes waiting for the first visible
partition to hydrate and the synthetic click. It is not the text transaction
duration. Before the fix, the benchmark did not merely run slowly: hydration
removed the deferred anchor from `blockMap` but left its DOM node mounted. The
synthetic click selected that orphan, `checkNeedRender` dereferenced a missing
Block, and the benchmark then appeared to hang after the renderer exited. The
benchmark now bounds input and shutdown operations and reports renderer crashes,
page errors, and error-level console messages.

## Non-Negotiable Invariants

These properties take priority over implementation convenience.

### One Source of Truth

- `DocumentStore` owns the complete current text and monotonically increasing
  revision.
- A Block, partition, index entry, vnode, or DOM node is never authoritative.
- Save and source mode read a `DocumentStore` snapshot, not an exported block
  tree.
- Pinia stores document handles, metadata, dirty state, and small summaries. It
  does not receive a new full-document string on every keystroke.

### Transactional Mutation

- Every mutation is an `EditTransaction`; DOM mutation is input evidence, not
  document state.
- A transaction declares its base revision and ordered non-overlapping replace
  steps.
- Applying a transaction is atomic from readers' perspective.
- Undo and redo apply inverse text transactions. They do not restore a partially
  hydrated Block snapshot.

### Stable Position Semantics

- Cursor, selection, composition, scroll anchors, and navigation targets use
  stable text anchors with explicit left/right affinity.
- Durable positions never depend on a DOM node or ephemeral Block key.
- Partition lookup uses cumulative lengths in an indexed sequence. Partition
  records do not cache document-wide absolute offsets that require suffix
  rewrites after every edit.

### Bounded Derived State

- Parsed Blocks and rendered nodes have explicit memory/count budgets and LRU
  eviction.
- Evicting any parse or render entry cannot lose text, history, selection,
  headings, references, or searchability.
- Every background result carries a source revision and is discarded if its
  inputs no longer match.

### Complete Global Behavior

- Search, TOC, references, word count, save, and export cover unrendered text.
- Markdown constructs crossing viewport boundaries behave exactly as they do in
  a fully rendered small document.
- No feature may force all partitions to hydrate merely to answer a
  document-wide query.

## Target Data Structures

### DocumentStore

`DocumentStore` is a chunked balanced text tree, implemented initially as a
rope-like B+ tree. Its public contract matters more than the internal tree
algorithm, but a flat JavaScript string is not an acceptable long-term backing
store for extreme documents.

Leaf chunks target 16-64 KiB and split near line boundaries when possible.
Internal nodes aggregate at least:

```text
utf16Length
newlineCount
utf8ByteLength (known or lazily computed)
subtreeRevision
wordCountSummary
```

Offsets exposed to renderer code are UTF-16 code-unit positions, matching DOM
selection semantics. File decoding and encoding own byte offsets. Tests must
cover astral characters, combining sequences, CRLF, lone CR, and a final line
without a newline.

Minimum interface:

```ts
interface DocumentStore {
  readonly revision: number
  readonly length: number

  slice(from: number, to: number, snapshot?: Revision): string
  lineAt(offset: number): LineInfo
  offsetAt(line: number, column: number): number
  createAnchor(offset: number, affinity: 'left' | 'right'): Anchor
  resolveAnchor(anchor: Anchor, revision?: Revision): number
  apply(transaction: EditTransaction): AppliedTransaction
  snapshot(): DocumentSnapshot
  stream(snapshot: DocumentSnapshot): AsyncIterable<string>
}
```

Tree edits and offset/line queries should be `O(log n + changed text)`. Reading
the complete document is intentionally `O(n)`, but it must be explicit and must
not occur in the keystroke-to-paint path.

### EditTransaction

```ts
interface ReplaceStep {
  from: number
  to: number
  insert: string
}

interface EditTransaction {
  baseRevision: number
  steps: ReplaceStep[]
  origin: 'input' | 'paste' | 'command' | 'undo' | 'redo' | 'source-mode'
  selectionBefore: AnchorRange
  selectionAfter?: AnchorRange
  timestamp: number
  compositionId?: string
}
```

The apply result contains the new revision, deleted slices needed for inversion,
an offset mapping, dirty text ranges, and invalidated parser checkpoints. Typing
transactions may coalesce within a short time window when origin, adjacency,
selection, and IME boundaries allow it. Paste and structural commands remain
separate undo units.

Transactions based on an old revision are either rebased through retained edit
maps or rejected. They are never applied to coincidentally matching numeric
offsets.

### AnchorMap

Only positions that must survive edits become explicit anchors: selection ends,
IME ranges, viewport anchor, bookmarks, diagnostics, and pending navigation.
Anchors attach to text-tree locations and carry affinity for insertion at the
same location.

Partitions do not allocate two heavyweight anchors each. Their locations are
implicit in the partition sequence tree's cumulative text lengths. This avoids
hundreds of thousands of marker objects for the 128 MiB case.

Deleted-range behavior is deterministic:

- left-affinity anchors collapse to the replacement start;
- right-affinity anchors collapse after inserted content;
- a selection preserves direction independently of endpoint order.

### PartitionIndex

`PartitionIndex` is a paged balanced sequence, not a flat list of absolute
ranges. Each leaf page stores compact partition records; internal nodes
aggregate text length, line count, estimated height, measured height, and
partition count. Offset-to-partition and scroll-position-to-partition queries
are prefix-sum tree lookups.

A partition record contains only derived state needed outside caches:

```text
partitionId
relativeTextLength
lineCount
syntaxKindHint
parserStartStateId
parserEndStateId
contentRevision
estimatedHeight
measuredHeightOrZero
flags
```

Do not store parse trees, rendered nodes, duplicated Markdown strings, or global
absolute offsets in partition records. Use packed arrays or page-local compact
records where profiling shows object overhead is material.

Partition IDs remain stable for unchanged records. Repartitioning replaces IDs
only inside the changed convergence window. Consumers must tolerate replacement
and map a removed partition target through its text anchor.

### Incremental Markdown Parser

The current line classifier is a useful scanner, not a sufficient Markdown
partitioner. Markdown block meaning can depend on earlier lines: fences, HTML
blocks, lists, blockquotes, setext headings, reference definitions, indentation,
and extension syntax all affect safe boundaries.

The incremental parser stores a compact parser checkpoint at selected
boundaries. After an edit it:

1. starts at the nearest preceding trusted checkpoint;
2. reparses forward through the dirty range;
3. continues until both boundary and parser end state converge with the previous
   revision;
4. replaces only that partition-index window;
5. escalates to a larger range, possibly end-of-document, when state cannot
   converge safely.

Correctness is more important than a minimal reparse range. Reparse work may be
scheduled in slices, but the active viewport receives a synchronous minimal
parse or a faithful plain-source fallback. A placeholder must never display
stale rich content as though it were current.

### BlockParseCache

Rich Muya Blocks become cache entries keyed by:

```text
(partitionId, contentRevision, parserConfigurationHash)
```

Entries are immutable after publication. The cache is segmented:

- pinned: active edit, selection endpoints, IME, and visible partitions;
- warm: viewport overscan and likely navigation targets;
- cold: evictable LRU entries.

Eviction removes Block objects and auxiliary token trees. Re-entry reparses from
the canonical text and checkpoint. Block keys are render-session identities and
must not leak into history or global indexes.

### Semantic Indexes

Document-wide features use independent incremental indexes:

| Index | Source | Update strategy | Required behavior |
| --- | --- | --- | --- |
| HeadingIndex | parser summaries | replace entries in changed partition window | complete TOC and heading navigation before rich hydration |
| ReferenceIndex | definitions and uses | invalidate affected labels and parser window | correct links across partitions |
| SearchIndex | text leaves or optional trigram pages | update changed leaves; verify matches against snapshot | search all text without hydrating Blocks |
| WordCountIndex | leaf aggregates | recompute changed leaves and tree sums | constant-time document total after local edit |
| LineIndex | text-tree newline aggregates | updated by tree edit | logarithmic line/offset mapping |

Search result positions are anchors or revision-qualified ranges. Highlighting
hydrates only visible result partitions. Replace-all first computes matches on
one immutable snapshot, then submits one transaction with steps applied in
reverse offset order.

### LayoutIndex

Layout is indexed by stable partition sequence, not by the hydrated Block array.
The same augmented tree used by `PartitionIndex`, or a tightly coupled layout
tree, stores estimated and measured heights.

When a measured height changes, the renderer preserves a viewport text anchor
and its intra-line pixel offset. Height corrections above that anchor adjust
scroll position in one batched frame. Corrections are not allowed to recursively
trigger full-document hydration.

Estimates use syntax kind, logical lines, wrapping width bucket, font metrics,
and a bounded history of measured samples. A width/theme/font change invalidates
measurement generations, not document text or parse entries.

### ViewportRenderCache

The DOM contains only visible partitions, overscan, the active selection, and a
small number of pinned interaction surfaces. Above and below spacers derive
their heights from `LayoutIndex`; they do not require one placeholder DOM node
per partition.

The render cache key includes partition content revision and view generation.
Unmounting removes listeners and diagram/image resources. Async rich media is
separately cancellable and cannot keep an evicted partition alive.

### Application State Boundary

The Vue/Pinia layer receives small events:

```text
documentId
revision
dirty
selectionSummary
wordCount
tocRevision
activePath
saveState
```

It obtains text only for explicit source-mode, save/export, clipboard, or small
range requests. Editor input must not publish the entire Markdown string into a
reactive store on each key.

## Critical Flows

### Open

1. Main process opens an isolated file handle and streams decoded chunks.
2. `DocumentStore` publishes an early immutable revision once enough content is
   available for the requested/initial viewport.
3. A worker scans partitions and parser checkpoints incrementally.
4. The renderer parses and mounts the initial viewport plus overscan.
5. Input readiness is declared when transactions, selection mapping, and save
   snapshot creation work, not when background parsing reaches EOF.
6. Global indexes and estimates continue in revision-checked background slices.

For smaller files the same pipeline may consume the entire stream in one slice.

### Input and IME

1. Translate `beforeinput` or an editor command into a transaction against the
   current revision.
2. Apply it to `DocumentStore` and map anchors.
3. Update the active partition synchronously; preserve native composition until
   `compositionend`.
4. Patch the visible DOM and selection.
5. Schedule parser convergence, semantic-index updates, layout measurement, and
   non-visible rendering by priority.
6. Emit small application summaries after the first painted response.

No full export, full word count, full TOC scan, or whole-document partition
rebuild is allowed between input and visible feedback.

### Scroll and Jump

1. Resolve scroll coordinates or a semantic target through layout/text indexes.
2. Cancel obsolete viewport jobs.
3. Pin the target, parse it, and render it before warm/cold work.
4. Mount a bounded range and evict distant unpinned entries.
5. Apply measured-height corrections around the stable viewport anchor.

Rapid top-middle-bottom jumps must converge to the final request. Completion of
an earlier request cannot pull the viewport back.

### Save and Export

Save captures one immutable `DocumentSnapshot` and streams it to an atomic
temporary-file replacement through the main-process boundary. Edits after the
snapshot create a newer dirty revision; they do not mutate the bytes being
written or incorrectly clear dirty state.

Rich export may require a complete parse, but it runs against an immutable
snapshot outside the input path, reports progress, observes cancellation, and
does not populate the interactive editor's bounded caches with the whole
document.

### Undo and Redo

History stores forward and inverse text transactions plus before/after anchor
selections. Deleted text can reference immutable rope chunks instead of copying
large strings where practical. The history budget is measured in retained bytes
as well as operation count.

Undo/redo applies a normal transaction, drives the same invalidation pipeline,
and can restore a selection in an unmounted partition. Rendering follows the
restored anchor; history never restores DOM or Block snapshots.

### Source Mode

Source mode is another view over a document snapshot, not a second authoritative
buffer. If the existing source editor requires a flat string, flattening is an
explicit, measured transition. Returning to rich mode submits a diff transaction
or a deliberate full-range replacement and rebuilds derived state by revision.

## Scheduling and Concurrency

Priority order:

```text
P0 transaction apply, IME, active selection, visible patch
P1 visible parse/render and final jump target
P2 viewport overscan and scroll-anchor measurement
P3 visible search highlights and requested navigation indexes
P4 global parser/index continuation and save support
P5 offscreen highlighting, diagrams, images, and speculative warming
```

Main-thread work after first editable should yield before an 8 ms slice is
exhausted and should be split further when input is pending. A hard 50 ms long
task is a defect except for explicitly instrumented platform operations outside
renderer control.

Workers handle scanning, parsing summaries, search indexing, and expensive
derived work when data transfer does not require flattening the full document.
Messages contain document ID, source revision, range/partition identity, config
hash, and task generation. Publication performs a compare-before-commit check.

Cancellation is semantic, not just best effort: obsolete results may finish
computing, but cannot publish into current indexes, layout, or DOM.

## Resource Budgets

Budgets are configuration values surfaced in telemetry, not vague aspirations.
Initial defaults should be tuned by measurement:

| Resource | Initial policy |
| --- | --- |
| Mounted partition roots | visible + overscan + pinned, normally <= 64 and hard-capped at 128 |
| Parsed Block partitions | <= 256 entries and <= 32 MiB estimated retained size, excluding pinned active entries |
| Render artifacts | <= 64 MiB, with diagrams/images separately accounted and cancellable |
| Background queue | coalesced by document/revision/partition/task kind; obsolete jobs removed |
| History | both operation cap and retained-text byte cap; large paste cannot multiply memory by undo depth |
| Height samples | compact per-partition scalar data; no retained DOM geometry objects |

For the generated 128 MiB ASCII stress document, the target steady renderer RSS
increase over an empty editor is at most 384 MiB. This is a diagnostic engineering
budget, not a promise that every 128 MiB Markdown extension can be richly
rendered at once. Cache telemetry must explain any exception.

## Migration Strategy

Each stage lands behind a runtime flag until its exit gate passes. The fallback
is the immediately preceding stage, not a second permanent editor mode.

### M0: Correctness Containment and Instrumentation

- Invalidate stale partition offsets after every length-changing edit.
- Record document revision, partition revision, cache occupancy, worker queue,
  long tasks, input-to-paint, scroll-anchor correction, and RSS samples.
- Add assertions that prevent a background result from publishing across a
  revision mismatch.

Exit gate: randomized length-changing edits cannot cause hydration to slice a
different range than a fresh full-text oracle; telemetry exists for every later
budget.

### M1: Authoritative DocumentStore

- Introduce the chunked text tree behind a narrow interface.
- Load and save from snapshots.
- Mirror current Block edits into text transactions temporarily and compare
  against legacy Markdown export in development builds.
- Remove routine full Markdown publication from the reactive change path.

Exit gate: save/source text comes from `DocumentStore`; differential tests show
transaction text equals legacy export for the supported editing command matrix;
normal typing performs no full-document string construction.

### M2: Transaction History and Stable Anchors

- Route input, paste, formatting commands, source-mode changes, undo, and redo
  through transactions.
- Move cursor, selection, composition, viewport, and navigation targets to
  anchors.
- Delete Block snapshot history after parity tests pass.

Exit gate: selection and history survive cache eviction and top-middle-bottom
jumps; memory retained by history respects its byte budget.

### M3: Incremental Partition and Semantic Indexes

- Replace the flat absolute-offset partition map with the augmented sequence.
- Add parser checkpoints and convergence-based reparsing.
- Move TOC, references, word count, line mapping, and document search off
  hydrated Blocks.

Exit gate: random edit/property tests match a from-scratch parse/index oracle;
all global features work while most partitions remain unhydrated.

### M4: Bounded Parse, Layout, and Render Caches

- Make rich Blocks immutable cache entries.
- Add viewport pinning, LRU eviction, spacer-based layout, and stable scroll
  anchoring.
- Detach resource ownership for diagrams, images, highlighting, and listeners.

Exit gate: traversing the entire 128 MiB fixture and returning to the top does
not produce monotonic Block/DOM/cache growth; revisited content remains correct.

### M5: Streaming and Worker Completion

- Stream file decoding and immutable snapshot saving.
- Move scanner/index work to workers without full-string structured clones.
- Implement priority, cancellation, coalescing, and revision publication checks.

Exit gate: first editable does not wait for EOF-derived work, obsolete rapid-jump
jobs cannot publish, and long-task budgets pass.

### M6: Legacy Removal

- Delete `canonicalMarkdown`/Block dual authority and the unused mirror model.
- Remove feature code that traverses all hydrated Blocks for document-global
  answers.
- Remove feature flags and fallback only after soak and cross-platform results.

Exit gate: ownership audit finds one authoritative text model; all definition of
done conditions below pass on one commit.

## Verification Strategy

### Deterministic Unit and Property Tests

- Compare random transaction sequences against a simple JavaScript string
  oracle, including Unicode and newline variants.
- Verify anchor affinity, collapse on deletion, revision rebasing/rejection, and
  inverse transactions.
- Compare partition/index results after random edits with a fresh full parse.
- Exercise fences, HTML blocks, nested lists/quotes, tables, setext headings,
  references, footnotes, math, and extension blocks across candidate boundaries.
- Assert LRU eviction, pinning, resource disposal, and byte/count budgets.
- Test save snapshots during concurrent edits and dirty-state acknowledgement.

### Integration Tests

- Run every editing command through transaction -> parse -> render -> selection
  mapping.
- Compare rich-to-source round trips before and after eviction.
- Verify TOC, references, search, replace-all, and word count with target content
  entirely outside the hydrated viewport.
- Inject delayed worker results and prove old revisions cannot publish.
- Resize and theme-switch while preserving a viewport text anchor.

### E2E User Story Coverage

The checked-in scale fixture is generated per test in its temporary workspace.
It must be deterministic, at least 700 KB for normal `US-07` coverage, and must
contain unique markers near top, middle, and bottom plus cross-boundary Markdown.
It must not open `~/code`, a user's document directory, or a real desktop file.

The 128 MiB case is a separate opt-in stress project. Generate it in the test's
temporary directory, stream its construction to avoid a duplicate in the test
runner, and delete it through test teardown. Do not commit the file.

Linux UI runs must isolate X11/Wayland, DBus, desktop portals, Electron user data,
downloads, IPC, and native dialogs. Save/export/print dialogs are stubbed at the
main-process boundary. Tests must never display a file chooser on the developer's
desktop.

For top, middle, bottom, edit, undo, search, and return-to-top flows, capture a
sequence of stable-state screenshots in the isolated display. Screenshots are
reviewed for:

- target content replacing placeholders;
- cursor and selection remaining on the intended text;
- no blank viewport or overlapping content;
- stable vertical anchor and bottom alignment;
- rich Markdown parity after eviction and re-entry;
- bounded visible roots reported alongside the image.

Screenshots validate visible state, not performance. Telemetry must provide
input-to-paint, long tasks, mounted roots, cache occupancy, revisions, scroll
corrections, and memory for the same run.

### Performance Gates

Measure cold runs, report p50 and p95, and keep raw traces as CI artifacts.

| Scenario | Gate |
| --- | --- |
| Generated 700-900 KB document: first editable | p95 <= 2.0 s on the reference runner |
| Same document: ordinary input to painted text | p95 <= 100 ms, max <= 250 ms |
| Same document: direct middle/bottom jump | target content <= 1.0 s; anchor drift <= 8 px |
| After first editable | no renderer task > 50 ms attributable to editor document work |
| 128 MiB opt-in: first editable | p95 <= 5.0 s |
| 128 MiB opt-in: input after ready | p95 <= 150 ms, max <= 500 ms |
| 128 MiB full traversal | DOM/cache counts return within budget after eviction; no monotonic growth |
| Save | output hash equals the selected immutable snapshot |

Reference-runner hardware, OS, Electron version, power mode, and build type must
be recorded beside results. A threshold change requires a documented decision;
it is not silently updated to make a regression pass.

## Observability

At minimum, traces correlate these fields by document ID and revision:

```text
file read/decode start, first chunk, and EOF
DocumentStore apply duration and changed bytes
partition reparse range and convergence distance
worker queued/start/finish/publish/discard
visible parse and render duration
input event to transaction, DOM patch, and paint
anchor correction pixels
mounted roots and pinned/warm/cold cache entries
estimated cache bytes and renderer RSS
snapshot creation, save completion, and acknowledged revision
```

Development assertions should fail loudly on duplicate authority, stale
publication, unresolved anchors, leaked pinned entries, and an implicit
whole-document read in an input handler.

## Rejected Designs

### Keep Blocks Authoritative and Virtualize Only DOM

Rejected because hydrated Blocks, history, and global traversals remain
unbounded. The 128 MiB results already show that a small DOM is insufficient.

### Flat Canonical String Plus Absolute Partition Offsets

Rejected because edits copy or reconstruct large strings and invalidate every
later coordinate. Rebuilding the flat map can be a containment fallback, not the
target.

### Permanent Large-File Mode

Rejected because it creates two semantic editors and lets correctness diverge.
The same pipeline should naturally do less work for small documents and bounded
work for large ones.

### Hydrate Everything in Idle Time

Rejected because idle completion eventually consumes document-proportional
memory and competes with later input. Offscreen derived objects require a reason
to exist and an eviction policy.

### Treat Web Workers as the Architecture

Rejected because moving a full parse or string copy off-thread does not fix
ownership, stale results, memory growth, or main-thread publication costs.
Workers execute bounded revisioned jobs within this architecture.

### Maintain Two Synchronized Document Models

Rejected because synchronization becomes a second correctness problem. During
migration, dual-write comparison is temporary instrumentation with a deletion
date and an exit gate.

## Definition of Done

The architecture migration is done only when all of the following are true:

- `DocumentStore` is the sole editable source of truth and save reads its
  immutable snapshot.
- No normal keystroke performs full export, full partition rebuild, full word
  count, full TOC, or full Markdown reactive publication.
- Cursor, selection, viewport, navigation, and history survive unmount and parse
  cache eviction without Block IDs.
- Partition positions cannot become stale after a prefix edit.
- Search, TOC, references, word count, save, and export include never-rendered
  content.
- Parsed Blocks, DOM, render resources, queues, and history obey observable hard
  budgets.
- Background results cannot publish across document revisions or task
  generations.
- Markdown boundary property tests match a from-scratch oracle.
- `US-01`, `US-02`, `US-03`, `US-05`, `US-06`, and `US-07` E2E flows pass with
  isolated native boundaries and reviewed screenshots.
- The 700-900 KB performance gates pass in required CI, and the 128 MiB stress
  run meets its diagnostic gates without using a developer-local file.
- Legacy Block authority, Block snapshot history, hydrated-only global scans,
  and the unused duplicate model are removed.

Until then, individual viewport improvements should be described precisely as
implemented slices, not as completion of partitioned rendering.
