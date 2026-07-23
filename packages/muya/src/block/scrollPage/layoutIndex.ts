import type { MarkdownSegmentTree } from '../../state/markdownSegmentTree';
import type { TState } from '../../state/types';
import { PagedMeasuredSequence } from '../../utils/pagedMeasuredSequence';

export interface ILayoutMetrics {
    contentWidth: number;
    fontSize: number;
    lineHeight: number;
    codeFontSize: number;
    wrapCodeBlocks: boolean;
    tabSize: number;
}

export interface ILayoutRecord {
    id: number;
    stateIndex: number;
    estimatedHeight: number;
    measuredHeight: number | null;
    revision: number;
}

export interface ILayoutRange {
    start: number;
    end: number;
    top: number;
    bottom: number;
}

const DEFAULT_METRICS: ILayoutMetrics = {
    contentWidth: 700,
    fontSize: 16,
    lineHeight: 1.6,
    codeFontSize: 14,
    wrapCodeBlocks: false,
    tabSize: 4,
};

const HEADING_SCALE = [1, 1.875, 1.5, 1.375, 1.25, 1.125, 1];
const ESTIMATED_HEIGHT = 0;
const EFFECTIVE_HEIGHT = 1;
const MEASURED = 2;
const LAYOUT_MEASURES = 3;

function visualWidth(codePoint: number) {
    if (
        codePoint >= 0x1100
        && (
            codePoint <= 0x115F
            || codePoint === 0x2329
            || codePoint === 0x232A
            || (codePoint >= 0x2E80 && codePoint <= 0xA4CF)
            || (codePoint >= 0xAC00 && codePoint <= 0xD7A3)
            || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
            || (codePoint >= 0xFE10 && codePoint <= 0xFE6F)
            || (codePoint >= 0xFF00 && codePoint <= 0xFF60)
            || (codePoint >= 0x1F300 && codePoint <= 0x1FAFF)
        )
    ) {
        return 2;
    }
    return 1;
}

function estimateWrappedRows(text: string, columns: number, tabSize: number) {
    if (!text)
        return 1;

    let rows = 1;
    let column = 0;
    for (let index = 0; index < text.length; index++) {
        const codePoint = text.codePointAt(index)!;
        if (codePoint > 0xFFFF)
            index++;
        if (codePoint === 10) {
            rows++;
            column = 0;
            continue;
        }
        if (codePoint === 13)
            continue;

        const width = codePoint === 9
            ? Math.max(1, tabSize - (column % tabSize))
            : visualWidth(codePoint);
        if (column > 0 && column + width > columns) {
            rows++;
            column = 0;
        }
        column += width;
    }
    return rows;
}

function countHardLines(text: string) {
    let lines = 1;
    for (let index = 0; index < text.length; index++) {
        if (text.charCodeAt(index) === 10)
            lines++;
    }
    return lines;
}

function estimateLeafHeight(state: Extract<TState, { text: string }>, metrics: ILayoutMetrics) {
    const lineHeight = metrics.fontSize * metrics.lineHeight;
    const contentColumns = Math.max(12, Math.floor(metrics.contentWidth / (metrics.fontSize * 0.56)));

    switch (state.name) {
        case 'atx-heading':
        case 'setext-heading': {
            const scale = HEADING_SCALE[state.meta.level] ?? 1;
            const rows = estimateWrappedRows(state.text, Math.max(8, Math.floor(contentColumns / scale)), metrics.tabSize);
            return rows * metrics.fontSize * scale * 1.4 + metrics.fontSize * 2;
        }
        case 'thematic-break':
            return lineHeight + metrics.fontSize;
        case 'code-block':
        case 'frontmatter':
        case 'html-block': {
            const codeColumns = Math.max(12, Math.floor(metrics.contentWidth / (metrics.codeFontSize * 0.61)));
            const rows = metrics.wrapCodeBlocks
                ? estimateWrappedRows(state.text, codeColumns, metrics.tabSize)
                : countHardLines(state.text);
            return Math.max(1, rows) * metrics.codeFontSize * 1.6 + metrics.fontSize * 2;
        }
        case 'math-block':
            return Math.max(lineHeight * 2.5, countHardLines(state.text) * lineHeight + metrics.fontSize);
        case 'diagram':
            return Math.max(240, countHardLines(state.text) * lineHeight + metrics.fontSize * 2);
        case 'table.cell':
            return estimateWrappedRows(state.text, Math.max(8, Math.floor(contentColumns / 3)), metrics.tabSize) * lineHeight;
        default: {
            const rows = estimateWrappedRows(state.text, contentColumns, metrics.tabSize);
            return rows * lineHeight + metrics.fontSize;
        }
    }
}

function estimateStateHeight(state: TState, metrics: ILayoutMetrics): number {
    if ('text' in state)
        return estimateLeafHeight(state, metrics);

    if (state.name === 'table') {
        const rowHeights = state.children.map((row) => {
            return Math.max(
                metrics.fontSize * metrics.lineHeight * 1.75,
                ...row.children.map(cell => estimateLeafHeight(cell, metrics) + metrics.fontSize),
            );
        });
        return rowHeights.reduce((sum, height) => sum + height, metrics.fontSize);
    }

    const childrenHeight = state.children.reduce(
        (sum, child) => sum + estimateStateHeight(child, metrics),
        0,
    );
    switch (state.name) {
        case 'block-quote':
            return Math.max(metrics.fontSize * metrics.lineHeight, childrenHeight) + metrics.fontSize;
        case 'order-list':
        case 'bullet-list':
        case 'task-list':
            return Math.max(metrics.fontSize * metrics.lineHeight, childrenHeight) + metrics.fontSize;
        case 'list-item':
        case 'task-list-item':
            return Math.max(metrics.fontSize * metrics.lineHeight, childrenHeight);
        case 'footnote':
            return Math.max(metrics.fontSize * metrics.lineHeight * 2, childrenHeight + metrics.fontSize * 2);
        case 'table.row':
            return Math.max(metrics.fontSize * metrics.lineHeight * 1.75, childrenHeight);
    }
}

export class LayoutIndex {
    private readonly _records = new PagedMeasuredSequence(LAYOUT_MEASURES);
    private _revision = 0;

    get revision() {
        return this._revision;
    }

    get length() {
        return this._records.length;
    }

    get totalHeight() {
        return this._records.total(EFFECTIVE_HEIGHT);
    }

    get storageBytes() {
        return this._records.storageBytes;
    }

    rebuild(states: readonly TState[], metrics: Partial<ILayoutMetrics> = {}, revision = this._revision + 1) {
        const resolvedMetrics = { ...DEFAULT_METRICS, ...metrics };
        this._buildRecords(
            states.length,
            index => Math.max(1, estimateStateHeight(states[index], resolvedMetrics)),
            revision,
        );
    }

    rebuildFromSegments(
        segments: MarkdownSegmentTree,
        metrics: Partial<ILayoutMetrics> = {},
        revision = this._revision + 1,
    ) {
        if (!segments.areAllStateCountsKnown)
            throw new Error(`Cannot build semantic layout with only ${segments.knownCountPrefix}/${segments.length} segment counts.`);
        const resolvedMetrics = { ...DEFAULT_METRICS, ...metrics };
        const estimatedHeights = new Float64Array(segments.knownPrefixStates);
        let stateIndex = 0;
        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
            const stateCount = segments.stateCountAt(segmentIndex)!;
            const fallbackHeight = segments.sourceIndex.estimatedHeightAt(segmentIndex) / Math.max(1, stateCount);
            for (let localStateIndex = 0; localStateIndex < stateCount; localStateIndex++) {
                const state = segments.stateAtLocation(segmentIndex, localStateIndex);
                estimatedHeights[stateIndex++] = Math.max(
                    1,
                    state ? estimateStateHeight(state, resolvedMetrics) : fallbackHeight,
                );
            }
        }
        this._buildRecords(estimatedHeights.length, index => estimatedHeights[index], revision);
    }

    splice(
        index: number,
        removed: number,
        insertedStates: readonly TState[],
        metrics: Partial<ILayoutMetrics> = {},
        revision = this._revision + 1,
    ) {
        const resolvedMetrics = { ...DEFAULT_METRICS, ...metrics };
        let cachedIndex = -1;
        let cachedHeight = 0;
        this._records.splice(index, removed, insertedStates.length, (insertedIndex, measure) => {
            if (cachedIndex !== insertedIndex) {
                cachedIndex = insertedIndex;
                cachedHeight = Math.max(1, estimateStateHeight(insertedStates[insertedIndex], resolvedMetrics));
            }
            return measure === MEASURED ? 0 : cachedHeight;
        });
        this._revision = revision;
    }

    recordAt(index: number) {
        if (index < 0 || index >= this.length)
            return null;
        const estimatedHeight = this._records.measureAt(index, ESTIMATED_HEIGHT);
        const effectiveHeight = this._records.measureAt(index, EFFECTIVE_HEIGHT);
        const measured = this._records.measureAt(index, MEASURED) === 1;
        return {
            id: index,
            stateIndex: index,
            estimatedHeight,
            measuredHeight: measured ? effectiveHeight : null,
            revision: this._revision,
        } satisfies ILayoutRecord;
    }

    heightAt(index: number) {
        if (index < 0 || index >= this.length)
            return 0;
        return this._records.measureAt(index, EFFECTIVE_HEIGHT);
    }

    topAt(index: number) {
        return this._records.prefixMeasure(index, EFFECTIVE_HEIGHT);
    }

    indexAtOffset(offset: number) {
        return this._records.selectByMeasure(EFFECTIVE_HEIGHT, Math.max(0, offset));
    }

    indexAtProgress(progress: number) {
        if (this.length === 0)
            return 0;
        const normalized = Math.min(1, Math.max(0, progress));
        if (normalized === 1)
            return this.length - 1;
        return this.indexAtOffset(this.totalHeight * normalized);
    }

    rangeForViewport(scrollTop: number, viewportHeight: number, overscan = viewportHeight): ILayoutRange {
        if (this.length === 0)
            return { start: 0, end: 0, top: 0, bottom: 0 };
        const startOffset = Math.max(0, scrollTop - Math.max(0, overscan));
        const endOffset = Math.min(
            this.totalHeight,
            Math.max(startOffset, scrollTop + Math.max(1, viewportHeight) + Math.max(0, overscan)),
        );
        const start = this.indexAtOffset(startOffset);
        const end = Math.min(this.length, this.indexAtOffset(endOffset) + 1);
        return { start, end, top: this.topAt(start), bottom: this.topAt(end) };
    }

    updateMeasuredHeight(index: number, measuredHeight: number) {
        if (index < 0 || index >= this.length || !Number.isFinite(measuredHeight) || measuredHeight <= 0)
            return 0;
        const previousHeight = this.heightAt(index);
        const delta = measuredHeight - previousHeight;
        this._records.setMeasure(index, EFFECTIVE_HEIGHT, measuredHeight);
        this._records.setMeasure(index, MEASURED, 1);
        return delta;
    }

    updateEstimatedState(
        index: number,
        state: TState,
        metrics: Partial<ILayoutMetrics> = {},
    ) {
        if (index < 0 || index >= this.length)
            return 0;
        const nextHeight = Math.max(
            1,
            estimateStateHeight(state, { ...DEFAULT_METRICS, ...metrics }),
        );
        const previousHeight = this.heightAt(index);
        this._records.setMeasure(index, ESTIMATED_HEIGHT, nextHeight);
        if (this._records.measureAt(index, MEASURED) === 1)
            return 0;
        const delta = nextHeight - previousHeight;
        this._records.setMeasure(index, EFFECTIVE_HEIGHT, nextHeight);
        return delta;
    }

    clearMeasurements() {
        const length = this.length;
        this._records.build(length, (index, measure) => {
            const estimatedHeight = this._records.measureAt(index, ESTIMATED_HEIGHT);
            return measure === MEASURED ? 0 : estimatedHeight;
        });
    }

    private _buildRecords(length: number, estimatedAt: (index: number) => number, revision: number) {
        const preserveMeasurements = revision === this._revision;
        const previousLength = this.length;
        let cachedIndex = -1;
        let cachedEstimatedHeight = 0;
        this._revision = revision;
        this._records.build(length, (index, measure) => {
            if (cachedIndex !== index) {
                cachedIndex = index;
                cachedEstimatedHeight = estimatedAt(index);
            }
            const measured = preserveMeasurements
                && index < previousLength
                && this._records.measureAt(index, MEASURED) === 1;
            if (measure === ESTIMATED_HEIGHT)
                return cachedEstimatedHeight;
            if (measure === EFFECTIVE_HEIGHT && measured)
                return this._records.measureAt(index, EFFECTIVE_HEIGHT);
            if (measure === MEASURED)
                return measured ? 1 : 0;
            return cachedEstimatedHeight;
        });
    }
}
