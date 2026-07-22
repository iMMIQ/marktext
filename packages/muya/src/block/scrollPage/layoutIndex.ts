import type { TState } from '../../state/types';

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

class HeightTree {
    private _tree = new Float64Array(1);

    get size() {
        return this._tree.length - 1;
    }

    get storageBytes() {
        return this._tree.byteLength;
    }

    build(values: Float64Array, measured?: Float64Array) {
        this._tree = new Float64Array(values.length + 1);
        for (let index = 1; index <= values.length; index++) {
            const measuredHeight = measured?.[index - 1];
            this._tree[index] += measuredHeight !== undefined && !Number.isNaN(measuredHeight)
                ? measuredHeight
                : values[index - 1];
            const parent = index + (index & -index);
            if (parent <= values.length)
                this._tree[parent] += this._tree[index];
        }
    }

    add(index: number, delta: number) {
        for (let cursor = index + 1; cursor < this._tree.length; cursor += cursor & -cursor)
            this._tree[cursor] += delta;
    }

    sum(count: number) {
        let total = 0;
        for (let cursor = Math.min(Math.max(0, count), this.size); cursor > 0; cursor -= cursor & -cursor)
            total += this._tree[cursor];
        return total;
    }

    lowerBound(offset: number) {
        if (this.size === 0 || offset <= 0)
            return 0;
        let index = 0;
        let bit = 1;
        while ((bit << 1) <= this.size)
            bit <<= 1;
        let remaining = offset;
        for (let step = bit; step > 0; step >>= 1) {
            const next = index + step;
            if (next <= this.size && this._tree[next] <= remaining) {
                index = next;
                remaining -= this._tree[next];
            }
        }
        return Math.min(index, this.size - 1);
    }
}

export class LayoutIndex {
    private readonly _heightTree = new HeightTree();
    private _estimatedHeights = new Float64Array(0);
    private _measuredHeights = new Float64Array(0);
    private _revision = 0;

    get revision() {
        return this._revision;
    }

    get length() {
        return this._estimatedHeights.length;
    }

    get totalHeight() {
        return this._heightTree.sum(this.length);
    }

    get storageBytes() {
        return this._estimatedHeights.byteLength
            + this._measuredHeights.byteLength
            + this._heightTree.storageBytes;
    }

    rebuild(states: readonly TState[], metrics: Partial<ILayoutMetrics> = {}, revision = this._revision + 1) {
        const resolvedMetrics = { ...DEFAULT_METRICS, ...metrics };
        const preserveMeasurements = revision === this._revision;
        const previousMeasurements = this._measuredHeights;
        this._revision = revision;
        this._estimatedHeights = new Float64Array(states.length);
        this._measuredHeights = new Float64Array(states.length);
        this._measuredHeights.fill(Number.NaN);
        if (preserveMeasurements) {
            this._measuredHeights.set(
                previousMeasurements.subarray(0, Math.min(states.length, previousMeasurements.length)),
            );
        }
        for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
            this._estimatedHeights[stateIndex] = Math.max(
                1,
                estimateStateHeight(states[stateIndex], resolvedMetrics),
            );
        }
        this._heightTree.build(this._estimatedHeights, this._measuredHeights);
    }

    recordAt(index: number) {
        if (index < 0 || index >= this.length)
            return null;
        const measuredHeight = this._measuredHeights[index];
        return {
            id: index,
            stateIndex: index,
            estimatedHeight: this._estimatedHeights[index],
            measuredHeight: Number.isNaN(measuredHeight) ? null : measuredHeight,
            revision: this._revision,
        } satisfies ILayoutRecord;
    }

    heightAt(index: number) {
        if (index < 0 || index >= this.length)
            return 0;
        const measuredHeight = this._measuredHeights[index];
        return Number.isNaN(measuredHeight) ? this._estimatedHeights[index] : measuredHeight;
    }

    topAt(index: number) {
        return this._heightTree.sum(index);
    }

    indexAtOffset(offset: number) {
        return this._heightTree.lowerBound(Math.max(0, offset));
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
        this._measuredHeights[index] = measuredHeight;
        const delta = measuredHeight - previousHeight;
        if (delta !== 0)
            this._heightTree.add(index, delta);
        return delta;
    }

    clearMeasurements() {
        this._measuredHeights.fill(Number.NaN);
        this._heightTree.build(this._estimatedHeights);
    }
}
