import type { DocumentSnapshot } from './documentStore';
import { DocumentStore } from './documentStore';

export type TSourceBlockKind
    = | 'blank'
        | 'code'
        | 'definition'
        | 'footnote'
        | 'frontmatter'
        | 'heading'
        | 'html'
        | 'list'
        | 'math'
        | 'paragraph'
        | 'quote'
        | 'table'
        | 'thematic-break';

export interface ISourceLayoutMetrics {
    contentWidth: number;
    fontSize: number;
    lineHeight: number;
    codeFontSize: number;
    wrapCodeBlocks: boolean;
    tabSize: number;
    frontMatter: boolean;
    footnote: boolean;
    math: boolean;
}

export interface ISourceBlockRecord {
    id: number;
    from: number;
    to: number;
    startLine: number;
    endLine: number;
    kind: TSourceBlockKind;
    hardLines: number;
    visualRows: number;
    estimatedHeight: number;
    stateCountHint: 1 | null;
}

export interface ISourceBlockRange {
    start: number;
    end: number;
    from: number;
    to: number;
    top: number;
    bottom: number;
}

interface ISourceLine {
    from: number;
    to: number;
    nextOffset: number;
    line: number;
    sample: string;
    visualColumns: number;
    blank: boolean;
}

interface IRecordBuilder {
    from: number;
    to: number;
    startLine: number;
    endLine: number;
    kind: TSourceBlockKind;
    hardLines: number;
    visualRows: number;
    samples: string[];
    lastSample: string;
    fence?: { marker: string; length: number };
    untilBlank?: boolean;
    stateCountRisk?: boolean;
    listMarkerFamily?: string;
}

interface ILineClassification {
    kind: TSourceBlockKind;
    fence?: { marker: string; length: number };
    untilBlank?: boolean;
}

const DEFAULT_METRICS: ISourceLayoutMetrics = {
    contentWidth: 700,
    fontSize: 16,
    lineHeight: 1.6,
    codeFontSize: 14,
    wrapCodeBlocks: false,
    tabSize: 4,
    frontMatter: true,
    footnote: false,
    math: true,
};

const SOURCE_KINDS: readonly TSourceBlockKind[] = [
    'blank',
    'code',
    'definition',
    'footnote',
    'frontmatter',
    'heading',
    'html',
    'list',
    'math',
    'paragraph',
    'quote',
    'table',
    'thematic-break',
];
const SOURCE_KIND_CODES = Object.fromEntries(
    SOURCE_KINDS.map((kind, code) => [kind, code]),
) as Record<TSourceBlockKind, number>;
const UNCERTAIN_STATE_COUNT = 0x80;
const SOURCE_KIND_MASK = 0x7F;

function growUint32(values: Uint32Array, capacity: number) {
    const next = new Uint32Array(capacity);
    next.set(values);
    return next;
}

function growUint8(values: Uint8Array, capacity: number) {
    const next = new Uint8Array(capacity);
    next.set(values);
    return next;
}

function growFloat64(values: Float64Array, capacity: number) {
    const next = new Float64Array(capacity);
    next.set(values);
    return next;
}

class SourceRecordTable {
    private _length = 0;
    private _capacity = 1024;
    private _from = new Uint32Array(this._capacity);
    private _to = new Uint32Array(this._capacity);
    private _startLine = new Uint32Array(this._capacity);
    private _endLine = new Uint32Array(this._capacity);
    private _hardLines = new Uint32Array(this._capacity);
    private _visualRows = new Uint32Array(this._capacity);
    private _kind = new Uint8Array(this._capacity);
    private _heightEnds = new Float64Array(this._capacity);

    get length() {
        return this._length;
    }

    get heightEnds() {
        return this._heightEnds.subarray(0, this._length);
    }

    get storageBytes() {
        return this._from.byteLength
            + this._to.byteLength
            + this._startLine.byteLength
            + this._endLine.byteLength
            + this._hardLines.byteLength
            + this._visualRows.byteLength
            + this._kind.byteLength
            + this._heightEnds.byteLength;
    }

    append(record: Omit<ISourceBlockRecord, 'id'>) {
        this._ensureCapacity();
        const index = this._length;
        this._from[index] = record.from;
        this._to[index] = record.to;
        this._startLine[index] = record.startLine;
        this._endLine[index] = record.endLine;
        this._hardLines[index] = record.hardLines;
        this._visualRows[index] = record.visualRows;
        this._kind[index] = SOURCE_KIND_CODES[record.kind]
            | (record.stateCountHint === null ? UNCERTAIN_STATE_COUNT : 0);
        this._heightEnds[index] = (index === 0 ? 0 : this._heightEnds[index - 1]) + record.estimatedHeight;
        this._length++;
    }

    extendLast(to: number, endLine: number) {
        if (this._length === 0)
            return;
        this._to[this._length - 1] = to;
        this._endLine[this._length - 1] = endLine;
    }

    fromAt(index: number) {
        return this._from[index];
    }

    toAt(index: number) {
        return this._to[index];
    }

    stateCountHintAt(index: number): 1 | null {
        return (this._kind[index] & UNCERTAIN_STATE_COUNT) === 0 ? 1 : null;
    }

    kindAt(index: number) {
        return SOURCE_KINDS[this._kind[index] & SOURCE_KIND_MASK];
    }

    recordAt(index: number): ISourceBlockRecord | null {
        if (index < 0 || index >= this._length)
            return null;
        const top = index === 0 ? 0 : this._heightEnds[index - 1];
        return {
            id: index,
            from: this._from[index],
            to: this._to[index],
            startLine: this._startLine[index],
            endLine: this._endLine[index],
            kind: SOURCE_KINDS[this._kind[index] & SOURCE_KIND_MASK],
            hardLines: this._hardLines[index],
            visualRows: this._visualRows[index],
            estimatedHeight: this._heightEnds[index] - top,
            stateCountHint: this.stateCountHintAt(index),
        };
    }

    private _ensureCapacity() {
        if (this._length < this._capacity)
            return;
        this._capacity *= 2;
        this._from = growUint32(this._from, this._capacity);
        this._to = growUint32(this._to, this._capacity);
        this._startLine = growUint32(this._startLine, this._capacity);
        this._endLine = growUint32(this._endLine, this._capacity);
        this._hardLines = growUint32(this._hardLines, this._capacity);
        this._visualRows = growUint32(this._visualRows, this._capacity);
        this._kind = growUint8(this._kind, this._capacity);
        this._heightEnds = growFloat64(this._heightEnds, this._capacity);
    }
}

const FENCE_START = /^ {0,3}(`{3,}|~{3,})/;
const ATX_HEADING = /^ {0,3}(#{1,6})(?:\s+|$)/;
const SETEXT_HEADING = /^ {0,3}(?:=+|-+)\s*$/;
const LIST_ITEM = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:\s+|$)/;
const QUOTE = /^ {0,3}>/;
const THEMATIC_BREAK = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
const TABLE_DELIMITER = /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?$/;
const DEFINITION = /^ {0,3}\[[^\]\n]+\]:/;
const FOOTNOTE_DEFINITION = /^ {0,3}\[\^[^\]\n]+\]:/;
const INDENTED = /^(?: {4}|\t)/;
const HTML_BLOCK_TAG = /^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|\/?>|$)/i;

function htmlFence(sample: string) {
    const tag = /^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/i.exec(sample)?.[1];
    if (tag)
        return new RegExp(`</${tag}\\s*>`, 'i');
    if (/^ {0,3}<!--/.test(sample))
        return /-->/;
    if (/^ {0,3}<\?/.test(sample))
        return /\?>/;
    if (/^ {0,3}<!\[CDATA\[/.test(sample))
        return /\]\]>/;
    if (/^ {0,3}<![A-Z]/.test(sample))
        return />/;
    return null;
}

function visualColumns(segment: string, initialColumn: number, tabSize: number) {
    if (!/[\t\u0080-\uFFFF]/.test(segment))
        return initialColumn + segment.length;

    let column = initialColumn;
    for (let index = 0; index < segment.length; index++) {
        const codePoint = segment.codePointAt(index)!;
        if (codePoint > 0xFFFF)
            index++;
        if (codePoint === 9) {
            column += Math.max(1, tabSize - (column % tabSize));
            continue;
        }
        column += codePoint >= 0x1100 ? 2 : 1;
    }
    return column;
}

function* iterateLines(snapshot: DocumentSnapshot, tabSize: number): Generator<ISourceLine> {
    let absoluteOffset = 0;
    let lineStart = 0;
    let line = 0;
    let sample = '';
    let columns = 0;

    for (const chunk of snapshot.chunks()) {
        let cursor = 0;
        while (cursor < chunk.length) {
            const newline = chunk.indexOf('\n', cursor);
            const end = newline === -1 ? chunk.length : newline;
            const segment = chunk.slice(cursor, end);
            if (sample.length < 256)
                sample += segment.slice(0, 256 - sample.length);
            columns = visualColumns(segment, columns, tabSize);
            absoluteOffset += segment.length;
            cursor = end;

            if (newline === -1)
                break;

            const normalizedSample = sample.endsWith('\r') ? sample.slice(0, -1) : sample;
            yield {
                from: lineStart,
                to: absoluteOffset,
                nextOffset: absoluteOffset + 1,
                line,
                sample: normalizedSample,
                visualColumns: normalizedSample.length === sample.length ? columns : Math.max(0, columns - 1),
                blank: normalizedSample.trim().length === 0,
            };
            absoluteOffset++;
            cursor++;
            lineStart = absoluteOffset;
            line++;
            sample = '';
            columns = 0;
        }
    }

    if (lineStart < snapshot.length || snapshot.length === 0) {
        const normalizedSample = sample.endsWith('\r') ? sample.slice(0, -1) : sample;
        yield {
            from: lineStart,
            to: snapshot.length,
            nextOffset: snapshot.length,
            line,
            sample: normalizedSample,
            visualColumns: normalizedSample.length === sample.length ? columns : Math.max(0, columns - 1),
            blank: normalizedSample.trim().length === 0,
        };
    }
}

function classifyHtml(sample: string): ILineClassification | null {
    const htmlEnd = htmlFence(sample);
    if (htmlEnd) {
        return htmlEnd.test(sample.slice(sample.indexOf('<') + 1))
            ? { kind: 'html' }
            : { kind: 'html', untilBlank: false, fence: { marker: htmlEnd.source, length: 0 } };
    }
    if (HTML_BLOCK_TAG.test(sample) || /^ {0,3}<[^>\n]+>\s*$/.test(sample))
        return { kind: 'html', untilBlank: true };
    return null;
}

function classifyLine(line: ISourceLine, isDocumentStart: boolean, metrics: ISourceLayoutMetrics): ILineClassification {
    const { sample } = line;
    if (isDocumentStart && metrics.frontMatter && /^(?:---|\+\+\+|;;;|\{)\s*$/.test(sample)) {
        const marker = sample.trim();
        return {
            kind: 'frontmatter',
            fence: { marker: marker === '{' ? '}' : marker[0], length: marker === '{' ? 1 : 3 },
        };
    }
    const fence = FENCE_START.exec(sample);
    if (fence) {
        return {
            kind: 'code',
            fence: { marker: fence[1][0], length: fence[1].length },
        };
    }
    if (metrics.math && /^ {0,3}\$\$\s*$/.test(sample))
        return { kind: 'math', fence: { marker: '$', length: 2 } };
    if (metrics.footnote && FOOTNOTE_DEFINITION.test(sample))
        return { kind: 'footnote', untilBlank: true };
    if (DEFINITION.test(sample))
        return { kind: 'definition', untilBlank: true };
    if (INDENTED.test(sample))
        return { kind: 'code' };
    if (ATX_HEADING.test(sample))
        return { kind: 'heading' };
    if (THEMATIC_BREAK.test(sample))
        return { kind: 'thematic-break' };
    if (QUOTE.test(sample))
        return { kind: 'quote' };
    if (LIST_ITEM.test(sample))
        return { kind: 'list' };
    return classifyHtml(sample) ?? { kind: 'paragraph' };
}

function closesFence(line: ISourceLine, fence: NonNullable<IRecordBuilder['fence']>) {
    if (fence.length === 0)
        return new RegExp(fence.marker, 'i').test(line.sample);
    const sample = line.sample.trim();
    if (fence.marker === '}')
        return sample === '}';
    const escaped = fence.marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}{${fence.length},}\\s*$`).test(sample);
}

function rowsForLine(line: ISourceLine, columns: number) {
    return Math.max(1, Math.ceil(line.visualColumns / columns));
}

function estimateHeight(builder: IRecordBuilder, metrics: ISourceLayoutMetrics) {
    const baseLineHeight = metrics.fontSize * metrics.lineHeight;
    if (builder.kind === 'blank')
        return baseLineHeight;
    if (builder.kind === 'heading') {
        const level = ATX_HEADING.exec(builder.samples[0])?.[1].length
            ?? (builder.samples[1]?.trim().startsWith('=') ? 1 : 2);
        const scale = [1, 1.875, 1.5, 1.375, 1.25, 1.125, 1][level] ?? 1;
        return builder.visualRows * metrics.fontSize * scale * 1.4 + metrics.fontSize * 2;
    }
    if (builder.kind === 'code' || builder.kind === 'frontmatter')
        return builder.visualRows * metrics.codeFontSize * 1.6 + metrics.fontSize * 2;
    if (builder.kind === 'math')
        return Math.max(baseLineHeight * 2.5, builder.visualRows * baseLineHeight + metrics.fontSize);
    if (builder.kind === 'thematic-break')
        return baseLineHeight + metrics.fontSize;
    return builder.visualRows * baseLineHeight + metrics.fontSize;
}

function finalize(
    builder: IRecordBuilder,
    records: SourceRecordTable,
    metrics: ISourceLayoutMetrics,
) {
    const kind = builder.kind === 'paragraph' && builder.samples[1] && SETEXT_HEADING.test(builder.samples[1])
        ? 'heading'
        : builder.kind === 'paragraph' && builder.samples[1] && TABLE_DELIMITER.test(builder.samples[1])
            ? 'table'
            : builder.kind;
    const resolved = { ...builder, kind };
    let stateCountHint: 1 | null = 1;
    if (
        kind === 'definition'
        || kind === 'frontmatter'
        || kind === 'html'
        || ((kind === 'list' || kind === 'quote') && resolved.stateCountRisk)
        || (kind === 'paragraph' && /^\s*\[/.test(resolved.samples[0] ?? ''))
    ) {
        stateCountHint = null;
    }
    records.append({
        from: resolved.from,
        to: resolved.to,
        startLine: resolved.startLine,
        endLine: resolved.endLine,
        kind,
        hardLines: resolved.hardLines,
        visualRows: resolved.visualRows,
        estimatedHeight: Math.max(1, estimateHeight(resolved, metrics)),
        stateCountHint,
    });
}

function appendLine(
    builder: IRecordBuilder,
    line: ISourceLine,
    columns: number,
    wrap = true,
) {
    updateStateCountRisk(builder, line);
    builder.to = line.nextOffset;
    builder.endLine = line.line + 1;
    builder.hardLines++;
    builder.visualRows += wrap ? rowsForLine(line, columns) : 1;
    builder.lastSample = line.sample;
    if (builder.samples.length < 2)
        builder.samples.push(line.sample);
}

function listMarkerFamily(sample: string) {
    const match = /^ {0,3}([-+*]|\d+([.)]))(?:[ \t]+|$)/.exec(sample);
    if (!match)
        return null;
    return match[2] ? `ordered:${match[2]}` : `bullet:${match[1]}`;
}

function updateStateCountRisk(builder: IRecordBuilder, line: ISourceLine) {
    if (line.blank) {
        builder.stateCountRisk = true;
        return;
    }
    if (builder.kind === 'quote' && !QUOTE.test(line.sample)) {
        builder.stateCountRisk = true;
        return;
    }
    if (builder.kind !== 'list')
        return;
    const family = listMarkerFamily(line.sample);
    if (!family)
        return;
    if (builder.listMarkerFamily && builder.listMarkerFamily !== family)
        builder.stateCountRisk = true;
    builder.listMarkerFamily ??= family;
}

function createBuilder(
    line: ISourceLine,
    classified: ReturnType<typeof classifyLine>,
    from: number,
    columns: number,
): IRecordBuilder {
    const builder: IRecordBuilder = {
        from,
        to: line.nextOffset,
        startLine: line.line,
        endLine: line.line + 1,
        kind: classified.kind,
        hardLines: 1,
        visualRows: rowsForLine(line, columns),
        samples: [line.sample],
        lastSample: line.sample,
        fence: classified.fence,
        untilBlank: classified.untilBlank,
    };
    updateStateCountRisk(builder, line);
    return builder;
}

function continuesAfterBlank(builder: IRecordBuilder | null, line: ISourceLine) {
    if (!builder)
        return false;
    if (builder.kind === 'list')
        return LIST_ITEM.test(line.sample) || /^ {2,}\S/.test(line.sample) || /^\t\S/.test(line.sample);
    if (builder.kind === 'quote')
        return QUOTE.test(line.sample);
    if (builder.kind === 'code' && !builder.fence)
        return INDENTED.test(line.sample);
    if (builder.kind === 'footnote')
        return INDENTED.test(line.sample);
    if (builder.kind === 'definition')
        return DEFINITION.test(line.sample);
    return false;
}

function canInterruptParagraph(classified: ILineClassification, line: ISourceLine) {
    if (classified.kind === 'definition' || (classified.kind === 'code' && !classified.fence))
        return false;
    if (classified.kind === 'list') {
        return /^ {0,3}(?:[-+*]\s+\S|1[.)]\s+\S)/.test(line.sample);
    }
    if (classified.kind === 'html')
        return Boolean(htmlFence(line.sample) || HTML_BLOCK_TAG.test(line.sample));
    return true;
}

function absorbBlankLines(
    builder: IRecordBuilder,
    lines: ISourceLine[],
    columns: number,
) {
    for (const line of lines)
        appendLine(builder, line, columns);
}

function flushBuilder(
    builder: IRecordBuilder | null,
    records: SourceRecordTable,
    metrics: ISourceLayoutMetrics,
) {
    if (builder)
        finalize(builder, records, metrics);
    return null;
}

function consumeFencedLine(
    builder: IRecordBuilder,
    line: ISourceLine,
    records: SourceRecordTable,
    metrics: ISourceLayoutMetrics,
    codeColumns: number,
) {
    const closing = closesFence(line, builder.fence!);
    appendLine(builder, line, codeColumns, metrics.wrapCodeBlocks);
    return closing ? flushBuilder(builder, records, metrics) : builder;
}

function consumeBlankLine(
    builder: IRecordBuilder | null,
    line: ISourceLine,
    records: SourceRecordTable,
    metrics: ISourceLayoutMetrics,
) {
    flushBuilder(builder, records, metrics);
    records.extendLast(line.nextOffset, line.line + 1);
    return null;
}

function continuesCurrentBlock(builder: IRecordBuilder | null, line: ISourceLine) {
    return Boolean(
        builder?.untilBlank
        || ((builder?.kind === 'list' || builder?.kind === 'quote') && /^(?: {2,}|\t)/.test(line.sample)),
    );
}

function interruptsCurrentBlock(builder: IRecordBuilder, classified: ILineClassification) {
    return Boolean(
        classified.fence
        || classified.kind === 'heading'
        || classified.kind === 'thematic-break'
        || (classified.kind !== 'paragraph' && classified.kind !== builder.kind),
    );
}

function startContentBuilder(
    line: ISourceLine,
    classified: ILineClassification,
    records: SourceRecordTable,
    metrics: ISourceLayoutMetrics,
    textColumns: number,
    codeColumns: number,
) {
    const columns = classified.kind === 'code' || classified.kind === 'frontmatter'
        ? codeColumns
        : textColumns;
    const builder = createBuilder(line, classified, records.length === 0 ? 0 : line.from, columns);
    return (classified.kind === 'heading' || classified.kind === 'thematic-break') && !classified.fence
        ? flushBuilder(builder, records, metrics)
        : builder;
}

function consumeContentLine(
    builder: IRecordBuilder | null,
    line: ISourceLine,
    records: SourceRecordTable,
    metrics: ISourceLayoutMetrics,
    textColumns: number,
    codeColumns: number,
) {
    if (continuesCurrentBlock(builder, line)) {
        appendLine(builder!, line, textColumns);
        return builder;
    }
    // A hyphen setext underline is also a thematic break in isolation. When
    // it directly follows paragraph text, CommonMark gives the setext form
    // precedence, so consume it before classifying an interrupting block.
    if (builder?.kind === 'paragraph' && !INDENTED.test(builder.lastSample) && SETEXT_HEADING.test(line.sample)) {
        appendLine(builder, line, textColumns);
        return flushBuilder(builder, records, metrics);
    }

    const classified = classifyLine(line, line.from === 0, metrics);
    if (builder?.kind === 'paragraph' && !canInterruptParagraph(classified, line)) {
        appendLine(builder, line, textColumns);
        return builder;
    }
    if (builder?.kind === 'code' && !builder.fence && !INDENTED.test(line.sample))
        builder = flushBuilder(builder, records, metrics);
    if (builder && interruptsCurrentBlock(builder, classified))
        builder = flushBuilder(builder, records, metrics);

    if (!builder)
        return startContentBuilder(line, classified, records, metrics, textColumns, codeColumns);

    appendLine(builder, line, textColumns);
    return builder;
}

export interface ISourceScanBatch {
    processedLines: number;
    scannedBytes: number;
    sourceBytes: number;
    records: number;
    complete: boolean;
}

const completedScanRecords = new WeakMap<object, SourceRecordTable>();

/** Pausable structural scan used by both synchronous and scheduled loaders. */
export class MarkdownSourceScanSession {
    private readonly _records = new SourceRecordTable();
    private readonly _lines: Generator<ISourceLine>;
    private readonly _textColumns: number;
    private readonly _codeColumns: number;
    private _builder: IRecordBuilder | null = null;
    private _blankLines: ISourceLine[] = [];
    private _scannedBytes = 0;
    private _complete = false;

    constructor(
        readonly snapshot: DocumentSnapshot,
        private readonly _metrics: ISourceLayoutMetrics,
    ) {
        this._lines = iterateLines(snapshot, _metrics.tabSize);
        this._textColumns = Math.max(12, Math.floor(_metrics.contentWidth / (_metrics.fontSize * 0.56)));
        this._codeColumns = Math.max(12, Math.floor(_metrics.contentWidth / (_metrics.codeFontSize * 0.61)));
    }

    get complete() {
        return this._complete;
    }

    step(maxLines: number): ISourceScanBatch {
        if (!Number.isInteger(maxLines) || maxLines <= 0)
            throw new RangeError('Source scan line budget must be a positive integer.');

        let processedLines = 0;
        while (!this._complete && processedLines < maxLines) {
            const next = this._lines.next();
            if (next.done) {
                this._finish();
                break;
            }

            const line = next.value;
            processedLines++;
            this._scannedBytes = line.nextOffset;
            if (this._builder?.fence) {
                this._builder = consumeFencedLine(
                    this._builder,
                    line,
                    this._records,
                    this._metrics,
                    this._codeColumns,
                );
                continue;
            }

            if (line.blank) {
                this._blankLines.push(line);
                continue;
            }

            if (this._blankLines.length > 0) {
                if (continuesAfterBlank(this._builder, line)) {
                    absorbBlankLines(this._builder!, this._blankLines, this._textColumns);
                }
                else {
                    for (const blankLine of this._blankLines) {
                        this._builder = consumeBlankLine(
                            this._builder,
                            blankLine,
                            this._records,
                            this._metrics,
                        );
                    }
                }
                this._blankLines = [];
            }

            this._builder = consumeContentLine(
                this._builder,
                line,
                this._records,
                this._metrics,
                this._textColumns,
                this._codeColumns,
            );
        }

        return {
            processedLines,
            scannedBytes: this._scannedBytes,
            sourceBytes: this.snapshot.length,
            records: this._records.length,
            complete: this._complete,
        };
    }

    finish() {
        while (!this._complete)
            this.step(Number.MAX_SAFE_INTEGER);
        return new MarkdownSourceIndex(this);
    }

    private _finish() {
        flushBuilder(this._builder, this._records, this._metrics);
        for (const line of this._blankLines)
            consumeBlankLine(null, line, this._records, this._metrics);

        if (this._records.length === 0) {
            finalize({
                from: 0,
                to: this.snapshot.length,
                startLine: 0,
                endLine: this.snapshot.lineCount,
                kind: 'blank',
                hardLines: 1,
                visualRows: 1,
                samples: [''],
                lastSample: '',
            }, this._records, this._metrics);
        }
        this._builder = null;
        this._blankLines = [];
        this._scannedBytes = this.snapshot.length;
        this._complete = true;
        completedScanRecords.set(this, this._records);
    }
}

function scan(snapshot: DocumentSnapshot, metrics: ISourceLayoutMetrics) {
    const records = new SourceRecordTable();
    const textColumns = Math.max(12, Math.floor(metrics.contentWidth / (metrics.fontSize * 0.56)));
    const codeColumns = Math.max(12, Math.floor(metrics.contentWidth / (metrics.codeFontSize * 0.61)));
    let builder: IRecordBuilder | null = null;
    let blankLines: ISourceLine[] = [];

    for (const line of iterateLines(snapshot, metrics.tabSize)) {
        if (builder?.fence) {
            builder = consumeFencedLine(builder, line, records, metrics, codeColumns);
            continue;
        }

        if (line.blank) {
            blankLines.push(line);
            continue;
        }

        if (blankLines.length > 0) {
            if (continuesAfterBlank(builder, line)) {
                absorbBlankLines(builder!, blankLines, textColumns);
            }
            else {
                for (const blankLine of blankLines)
                    builder = consumeBlankLine(builder, blankLine, records, metrics);
            }
            blankLines = [];
        }

        builder = consumeContentLine(builder, line, records, metrics, textColumns, codeColumns);
    }
    flushBuilder(builder, records, metrics);
    for (const line of blankLines)
        consumeBlankLine(null, line, records, metrics);

    if (records.length === 0) {
        finalize({
            from: 0,
            to: snapshot.length,
            startLine: 0,
            endLine: snapshot.lineCount,
            kind: 'blank',
            hardLines: 1,
            visualRows: 1,
            samples: [''],
            lastSample: '',
        }, records, metrics);
    }
    return records;
}

function lowerBound(values: Float64Array, target: number) {
    let low = 0;
    let high = values.length;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (values[middle] <= target)
            low = middle + 1;
        else
            high = middle;
    }
    return low;
}

export class MarkdownSourceIndex {
    private readonly _records: SourceRecordTable;

    readonly snapshot: DocumentSnapshot;
    readonly revision: number;

    constructor(
        source: DocumentSnapshot | MarkdownSourceScanSession,
        metrics: Partial<ISourceLayoutMetrics> = {},
    ) {
        const session = source instanceof MarkdownSourceScanSession ? source : null;
        const snapshot = session?.snapshot ?? source as DocumentSnapshot;
        const resolvedMetrics = { ...DEFAULT_METRICS, ...metrics };
        this.snapshot = snapshot;
        this.revision = snapshot.revision;
        const sessionRecords = session ? completedScanRecords.get(session) : null;
        if (session && !sessionRecords)
            throw new Error('Cannot build a source index from an incomplete scan.');
        this._records = sessionRecords ?? scan(snapshot, resolvedMetrics);
    }

    static fromText(text: string, metrics: Partial<ISourceLayoutMetrics> = {}) {
        return new MarkdownSourceIndex(new DocumentStore(text).snapshot(), metrics);
    }

    static startScan(snapshot: DocumentSnapshot, metrics: Partial<ISourceLayoutMetrics> = {}) {
        return new MarkdownSourceScanSession(snapshot, { ...DEFAULT_METRICS, ...metrics });
    }

    get length() {
        return this._records.length;
    }

    get totalHeight() {
        return this._records.heightEnds[this.length - 1] ?? 0;
    }

    get storageBytes() {
        return this._records.storageBytes;
    }

    estimatedHeightAt(index: number) {
        if (index < 0 || index >= this.length)
            return 0;
        return this.topAt(index + 1) - this.topAt(index);
    }

    records() {
        return Array.from({ length: this.length }, (_, index) => this._records.recordAt(index)!);
    }

    recordAt(index: number) {
        return this._records.recordAt(index);
    }

    sourceFromAt(index: number) {
        if (index < 0 || index >= this.length)
            throw new RangeError(`Invalid source candidate ${index} for ${this.length} candidates.`);
        return this._records.fromAt(index);
    }

    sourceToAt(index: number) {
        if (index < 0 || index >= this.length)
            throw new RangeError(`Invalid source candidate ${index} for ${this.length} candidates.`);
        return this._records.toAt(index);
    }

    stateCountHintAt(index: number) {
        if (index < 0 || index >= this.length)
            throw new RangeError(`Invalid source candidate ${index} for ${this.length} candidates.`);
        return this._records.stateCountHintAt(index);
    }

    kindAt(index: number) {
        if (index < 0 || index >= this.length)
            throw new RangeError(`Invalid source candidate ${index} for ${this.length} candidates.`);
        return this._records.kindAt(index);
    }

    topAt(index: number) {
        return index <= 0 ? 0 : this._records.heightEnds[Math.min(index, this.length) - 1];
    }

    indexAtOffset(offset: number) {
        if (offset <= 0)
            return 0;
        if (offset >= this.snapshot.length)
            return this.length - 1;
        let low = 0;
        let high = this.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (this._records.toAt(middle) <= offset)
                low = middle + 1;
            else
                high = middle;
        }
        return Math.min(low, this.length - 1);
    }

    indexAtHeight(offset: number) {
        if (offset <= 0)
            return 0;
        return Math.min(lowerBound(this._records.heightEnds, offset), this.length - 1);
    }

    indexAtProgress(progress: number) {
        const normalized = Math.min(1, Math.max(0, progress));
        return normalized === 1
            ? this.length - 1
            : this.indexAtHeight(this.totalHeight * normalized);
    }

    rangeForProgress(from: number, to: number): ISourceBlockRange {
        const start = this.indexAtProgress(Math.min(from, to));
        const end = Math.min(this.length, this.indexAtProgress(Math.max(from, to)) + 1);
        return this.range(start, end);
    }

    range(start: number, end: number): ISourceBlockRange {
        const normalizedStart = Math.min(this.length - 1, Math.max(0, start));
        const normalizedEnd = Math.min(this.length, Math.max(normalizedStart + 1, end));
        return {
            start: normalizedStart,
            end: normalizedEnd,
            from: this._records.fromAt(normalizedStart),
            to: this._records.toAt(normalizedEnd - 1),
            top: this.topAt(normalizedStart),
            bottom: this.topAt(normalizedEnd),
        };
    }

    sourceForRange(start: number, end: number) {
        const range = this.range(start, end);
        return this.snapshot.slice(range.from, range.to);
    }
}
