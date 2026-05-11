# Editor Partitioned Rendering Optimization Plan

## Goal

Reduce complex Markdown cold start time to first editable content from the current
multi-second full-render path to a target of 1-2 seconds.

For this plan, "first editable" means:

- The first viewport, or the viewport around the requested cursor, is visible.
- The editor accepts input without waiting for full-document rich rendering.
- Saving preserves the complete canonical Markdown text.
- Derived state such as TOC, word count, image metadata, diagrams, and code
  highlighting may finish in the background.

## Plan Status

Status date: 2026-05-11

| Item | Status | Evidence / Gate |
| --- | --- | --- |
| Baseline measurement | Done | `CppCoreGuidelines.md` benchmark captured below. |
| Current architecture review | Done | Muya synchronous path and relevant source files identified below. |
| Zed comparison | Done | Comparable rope/display-map/viewport/background principles summarized below. |
| Optimization design | Done | Unified partitioned pipeline described below. |
| Implementation | Not started | This document is the implementation plan; code changes should begin at Phase 1. |
| Full test after this plan update | Done | `bun run test` passed on 2026-05-11. |

Implementation phases must update this table as work lands. After each phase is
implemented, run the full test suite and record the command, result, date, and
any known gaps in the verification log.

## Verification Log

| Date | Scope | Command | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-05-11 | Plan document only | `bun run test` | Passed | Unit: 31 files / 837 tests passed. E2E: 36 tests passed. |

## Current Baseline

Measured with:

```text
/home/ayd/code/CppCoreGuidelines/CppCoreGuidelines.md
```

File size:

```text
820 KB
23088 lines
838452 bytes
```

Observed median from 3 cold-start runs:

| Metric | Median |
| --- | ---: |
| Main entry to successful input | 10.52s |
| Renderer start to successful input | 9.85s |
| Renderer mount to successful input | 9.37s |
| Editor initialization | 5.99s |
| Muya creation path | 5.99s |

The dominant known cost is the synchronous Muya path:

```text
setMarkdown -> importMarkdown -> full render -> dispatchChange
```

This path currently parses and renders too much before the editor can accept
input.

## Design Principle

All files should use the same rendering pipeline. Avoid a separate "large file"
mode that diverges from normal behavior.

Small files should finish quickly because they have fewer partitions. Large files
should become editable quickly because only the visible partitions block the
first frame.

## Target Architecture

```text
canonical markdown text
  -> PartitionMap
  -> BlockParseCache
  -> RenderCache
  -> ViewportRenderer
```

### Canonical Markdown Text

The complete Markdown text is the only source of truth.

Everything else is derived and may be invalidated or rebuilt:

- partitions
- Muya block trees
- rendered DOM or vnode cache
- TOC
- word count
- references
- image metadata
- diagram output
- code highlighting

Edits, paste, undo, redo, and save operate on canonical text first.

### PartitionMap

`PartitionMap` is a lightweight index over canonical text. It should be cheap to
build compared to full Markdown parse and rich rendering.

Each partition should include:

```text
id
startOffset
endOffset
startLine
endLine
typeHint
version
estimatedHeight
measuredHeight
parseState
renderState
```

Partition boundaries should be selected around Markdown-safe units:

- headings
- paragraphs
- list blocks
- blockquotes
- tables
- fenced code blocks
- HTML blocks
- math blocks
- diagram blocks
- thematic breaks

The partitioner may be conservative. If a boundary is uncertain, expand the
partition rather than risk incorrect structure.

### ViewportRenderer

Cold start should synchronously process only:

- the partition containing the requested cursor, if any
- partitions visible in the first viewport
- a small buffer before and after the viewport

Other partitions should initially render as placeholders or cheap plain-text
fallbacks. Full rich rendering should happen later.

### Background Work

Use a priority queue:

```text
P0: currently edited partition
P1: visible viewport partitions
P2: viewport buffer partitions
P3: headings, references, TOC-related partitions
P4: full-document derived state
P5: diagrams, images, code highlighting for non-visible partitions
```

Heavy tasks should not block first editable:

- full-document `ExportMarkdown`
- full-document word count
- full-document TOC
- Mermaid, flowchart, sequence, plantuml, and vega rendering
- image size probing and remote image validation
- Prism language loading and syntax highlighting
- non-visible inline tokenizer work

## Edit Flow

Normal typing should invalidate only the active partition.

Large paste or cross-partition edits should be treated as a canonical text
replacement:

```text
replace [startOffset, endOffset) with pastedText
```

Then:

1. Pause background jobs that overlap the affected range.
2. Apply the replacement to canonical text.
3. Find partitions intersecting the replaced range.
4. Expand to safe Markdown boundaries.
5. Remove old affected partitions.
6. Repartition the expanded range.
7. Synchronously parse and render visible affected partitions.
8. Queue the rest for background parsing and rendering.
9. Update cursor, selection, undo entry, and dirty ranges.

If a paste creates uncertain syntax state, such as an unmatched fence or HTML
block, expand the reparse range. The worst acceptable fallback is reparsing from
the nearest safe boundary to the end of the document, while preserving canonical
text immediately.

## Inspiration From Zed

Zed uses a similar architectural idea even though it is a code editor rather
than a Markdown rich text editor.

Useful patterns to borrow:

- Rope-backed text is the source of truth.
- Display state is a layered derived map.
- Edits are propagated as invalidated ranges through mapping layers.
- Layout and drawing operate on the visible row range.
- Syntax parsing is interpolated immediately and completed in the background.

For MarkText, the equivalent unit should be Markdown partitions and blocks, not
only display rows.

## Implementation Phases

### Phase 1: Measurement and Blocking Work Removal

Status: Not started.

Add detailed startup and editor-load metrics:

```text
file:read-start
file:read-end
editor:file-loaded
muya:set-markdown-start
muya:import-markdown-end
muya:render-end
muya:dispatch-change-start
muya:dispatch-change-end
editor:first-editable
```

Defer initial derived state:

- Do not run full-document `ExportMarkdown` immediately after opening a file.
- Defer word count and TOC calculation.
- Defer initial non-visible code highlighting and diagram rendering.

Expected target:

```text
10.5s -> 6-7s first editable
```

### Phase 2: Introduce PartitionMap

Status: Not started.

Add canonical text and partition index.

At first, keep most existing Muya internals, but feed Muya only the initial
visible partitions for first editable. Non-visible partitions render as stable
placeholders.

Expected target:

```text
6-7s -> 2-3s first editable
```

### Phase 3: Background Rich Rendering

Status: Not started.

Move the following to background or viewport-triggered tasks:

- TOC
- word count
- image metadata
- diagram rendering
- code highlighting
- non-visible inline tokenization

Use partition version checks so stale background results are discarded.

Expected target:

```text
2-3s -> 1-2s first editable
```

### Phase 4: Full Viewport Virtualization

Status: Not started.

Replace full `StateRender.render(blocks)` with a viewport-aware renderer:

- mount only viewport and buffer partitions
- unmount distant partitions
- retain measured heights
- update scroll anchoring when heights change
- render active partition synchronously
- render inactive partitions lazily

Adapt these features to canonical text and dirty partition ranges:

- selection
- cursor mapping
- undo and redo
- search
- save
- export
- TOC
- spellcheck

## Risks

### Cross-Partition Markdown Semantics

References, list continuation, blockquote nesting, HTML blocks, and fenced code
blocks may cross naive boundaries.

Mitigation:

- use conservative safe boundaries
- expand reparse ranges when syntax state is uncertain
- maintain a lightweight global reference and heading index
- allow background correction of previously rendered partitions

### Cursor and Selection Mapping

Current editor logic often relies on block keys and DOM state.

Mitigation:

- introduce offset/anchor-based cursor positions
- map anchors to partitions and local offsets
- treat DOM/block ids as rendering details, not the authoritative position

### Undo and Redo

Transactions can cross partitions.

Mitigation:

- record transactions against canonical text ranges
- derive dirty partition ranges from transaction ranges
- rebuild partition caches after undo and redo

### Scroll Jumping

Unrendered partitions need estimated height. Real rich rendering may change
height later.

Mitigation:

- estimate height from line count and type hint
- store measured heights
- preserve viewport anchor when correcting heights
- avoid changing current active partition height unexpectedly

### Background Staleness

Background parse/render output may complete after edits changed the partition.

Mitigation:

- attach partition version to each job
- discard stale results
- coalesce queued jobs by partition id

## Proof of Concept

Build the smallest useful prototype:

1. Load full file into canonical text.
2. Build `PartitionMap`.
3. Render only the first viewport partitions.
4. Render remaining partitions as placeholders.
5. Allow typing in the visible partition.
6. Save from canonical text.
7. Fill placeholders in the background.

Validation target using `CppCoreGuidelines.md`:

```text
main -> first editable < 2s
visible input has no obvious jank
save preserves full file content
scrolling progressively fills rich rendering
```

If the proof of concept meets this target, continue with full integration.
