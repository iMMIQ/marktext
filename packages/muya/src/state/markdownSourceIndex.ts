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
    records: ISourceBlockRecord[],
    metrics: ISourceLayoutMetrics,
) {
    const kind = builder.kind === 'paragraph' && builder.samples[1] && SETEXT_HEADING.test(builder.samples[1])
        ? 'heading'
        : builder.kind === 'paragraph' && builder.samples[1] && TABLE_DELIMITER.test(builder.samples[1])
            ? 'table'
            : builder.kind;
    const resolved = { ...builder, kind };
    records.push({
        id: records.length,
        from: resolved.from,
        to: resolved.to,
        startLine: resolved.startLine,
        endLine: resolved.endLine,
        kind,
        hardLines: resolved.hardLines,
        visualRows: resolved.visualRows,
        estimatedHeight: Math.max(1, estimateHeight(resolved, metrics)),
    });
}

function appendLine(
    builder: IRecordBuilder,
    line: ISourceLine,
    columns: number,
    wrap = true,
) {
    builder.to = line.nextOffset;
    builder.endLine = line.line + 1;
    builder.hardLines++;
    builder.visualRows += wrap ? rowsForLine(line, columns) : 1;
    builder.lastSample = line.sample;
    if (builder.samples.length < 2)
        builder.samples.push(line.sample);
}

function createBuilder(
    line: ISourceLine,
    classified: ReturnType<typeof classifyLine>,
    from: number,
    columns: number,
): IRecordBuilder {
    return {
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
    records: ISourceBlockRecord[],
    metrics: ISourceLayoutMetrics,
) {
    if (builder)
        finalize(builder, records, metrics);
    return null;
}

function consumeFencedLine(
    builder: IRecordBuilder,
    line: ISourceLine,
    records: ISourceBlockRecord[],
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
    records: ISourceBlockRecord[],
    metrics: ISourceLayoutMetrics,
) {
    flushBuilder(builder, records, metrics);
    if (records.length > 0) {
        const previous = records[records.length - 1];
        previous.to = line.nextOffset;
        previous.endLine = line.line + 1;
    }
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
    records: ISourceBlockRecord[],
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
    records: ISourceBlockRecord[],
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

function scan(snapshot: DocumentSnapshot, metrics: ISourceLayoutMetrics) {
    const records: ISourceBlockRecord[] = [];
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
        const placeholder: IRecordBuilder = {
            from: 0,
            to: snapshot.length,
            startLine: 0,
            endLine: snapshot.lineCount,
            kind: 'blank',
            hardLines: 1,
            visualRows: 1,
            samples: [''],
            lastSample: '',
        };
        finalize(placeholder, records, metrics);
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
    private readonly _records: ISourceBlockRecord[];
    private readonly _heightEnds: Float64Array;

    readonly revision: number;

    constructor(
        readonly snapshot: DocumentSnapshot,
        metrics: Partial<ISourceLayoutMetrics> = {},
    ) {
        const resolvedMetrics = { ...DEFAULT_METRICS, ...metrics };
        this.revision = snapshot.revision;
        this._records = scan(snapshot, resolvedMetrics);
        this._heightEnds = new Float64Array(this._records.length);
        let height = 0;
        for (let index = 0; index < this._records.length; index++) {
            height += this._records[index].estimatedHeight;
            this._heightEnds[index] = height;
        }
    }

    static fromText(text: string, metrics: Partial<ISourceLayoutMetrics> = {}) {
        return new MarkdownSourceIndex(new DocumentStore(text).snapshot(), metrics);
    }

    get length() {
        return this._records.length;
    }

    get totalHeight() {
        return this._heightEnds[this._heightEnds.length - 1] ?? 0;
    }

    records() {
        return this._records as readonly ISourceBlockRecord[];
    }

    recordAt(index: number) {
        return this._records[index] ?? null;
    }

    topAt(index: number) {
        return index <= 0 ? 0 : this._heightEnds[Math.min(index, this.length) - 1];
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
            if (this._records[middle].to <= offset)
                low = middle + 1;
            else
                high = middle;
        }
        return Math.min(low, this.length - 1);
    }

    indexAtHeight(offset: number) {
        if (offset <= 0)
            return 0;
        return Math.min(lowerBound(this._heightEnds, offset), this.length - 1);
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
            from: this._records[normalizedStart].from,
            to: this._records[normalizedEnd - 1].to,
            top: this.topAt(normalizedStart),
            bottom: this.topAt(normalizedEnd),
        };
    }

    sourceForRange(start: number, end: number) {
        const range = this.range(start, end);
        return this.snapshot.slice(range.from, range.to);
    }
}
