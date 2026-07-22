import type { MarkdownSourceIndex } from './markdownSourceIndex';
import type { TState } from './types';

export interface ISegmentStateRange {
    start: number;
    end: number;
}

export interface ISegmentStateLocation {
    segmentIndex: number;
    localStateIndex: number;
}

class StateCountTree {
    private readonly _tree: Uint32Array;

    constructor(length: number) {
        this._tree = new Uint32Array(length + 1);
    }

    get storageBytes() {
        return this._tree.byteLength;
    }

    build(values: Uint32Array) {
        this._tree.fill(0);
        for (let index = 1; index <= values.length; index++) {
            this._tree[index] += values[index - 1];
            const parent = index + (index & -index);
            if (parent < this._tree.length)
                this._tree[parent] += this._tree[index];
        }
    }

    sum(count: number) {
        let total = 0;
        for (let cursor = Math.min(Math.max(0, count), this._tree.length - 1); cursor > 0; cursor -= cursor & -cursor)
            total += this._tree[cursor];
        return total;
    }

    indexAt(stateIndex: number) {
        let segmentIndex = 0;
        let prefixCount = 0;
        let bit = 1;
        while ((bit << 1) < this._tree.length)
            bit <<= 1;
        for (let step = bit; step > 0; step >>= 1) {
            const next = segmentIndex + step;
            if (next < this._tree.length && prefixCount + this._tree[next] <= stateIndex) {
                segmentIndex = next;
                prefixCount += this._tree[next];
            }
        }
        return segmentIndex;
    }
}

/**
 * Stable source-segment ownership for semantic states.
 *
 * Sequential parsing appends into one compact prefix. Viewport work may finish
 * out of order and remains sparse until the sequential prefix reaches it. Flat
 * OT paths are exposed only for that complete prefix, where every preceding
 * segment state count is known.
 */
export class MarkdownSegmentTree {
    private readonly _stateCounts: Uint32Array;
    private readonly _parsed: Uint8Array;
    private readonly _countTree: StateCountTree;
    private readonly _prefixStates: TState[] = [];
    private readonly _sparseStates = new Map<number, readonly TState[]>();
    private _completePrefix = 0;
    private _parsedSegments = 0;
    private _parsedStates = 0;
    private _countTreeDirty = false;

    readonly revision: number;

    constructor(readonly sourceIndex: MarkdownSourceIndex) {
        this.revision = sourceIndex.revision;
        this._stateCounts = new Uint32Array(sourceIndex.length);
        this._parsed = new Uint8Array(sourceIndex.length);
        this._countTree = new StateCountTree(sourceIndex.length);
    }

    get length() {
        return this.sourceIndex.length;
    }

    get parsedSegments() {
        return this._parsedSegments;
    }

    get parsedStates() {
        return this._parsedStates;
    }

    get completePrefix() {
        return this._completePrefix;
    }

    get completePrefixStates() {
        return this._prefixStates.length;
    }

    get isComplete() {
        return this._completePrefix === this.length;
    }

    get storageBytes() {
        return this._stateCounts.byteLength
            + this._parsed.byteLength
            + this._countTree.storageBytes;
    }

    isParsed(segmentIndex: number) {
        this._assertSegmentIndex(segmentIndex);
        return this._parsed[segmentIndex] === 1;
    }

    commitSegment(segmentIndex: number, states: readonly TState[], revision = this.revision) {
        this._assertSegmentIndex(segmentIndex);
        if (revision !== this.revision)
            return false;
        if (this._parsed[segmentIndex] === 1)
            return false;

        this._parsed[segmentIndex] = 1;
        this._stateCounts[segmentIndex] = states.length;
        this._parsedSegments++;
        this._parsedStates += states.length;
        this._countTreeDirty = true;

        if (segmentIndex === this._completePrefix) {
            this._appendToPrefix(states);
            while (this._completePrefix < this.length) {
                const pending = this._sparseStates.get(this._completePrefix);
                if (!pending)
                    break;
                this._sparseStates.delete(this._completePrefix);
                this._appendToPrefix(pending);
            }
        }
        else {
            this._sparseStates.set(segmentIndex, states);
        }
        return true;
    }

    statesForSegment(segmentIndex: number): readonly TState[] | null {
        this._assertSegmentIndex(segmentIndex);
        if (this._parsed[segmentIndex] === 0)
            return null;
        if (segmentIndex >= this._completePrefix)
            return this._sparseStates.get(segmentIndex) ?? null;

        this._ensureCountTree();
        const start = this._countTree.sum(segmentIndex);
        return this._prefixStates.slice(start, start + this._stateCounts[segmentIndex]);
    }

    stateRangeForSegment(segmentIndex: number): ISegmentStateRange | null {
        this._assertSegmentIndex(segmentIndex);
        if (segmentIndex >= this._completePrefix)
            return null;
        this._ensureCountTree();
        const start = this._countTree.sum(segmentIndex);
        return { start, end: start + this._stateCounts[segmentIndex] };
    }

    locationAtStateIndex(stateIndex: number): ISegmentStateLocation | null {
        if (!Number.isInteger(stateIndex) || stateIndex < 0 || stateIndex >= this._prefixStates.length)
            return null;
        this._ensureCountTree();
        const segmentIndex = this._countTree.indexAt(stateIndex);
        return {
            segmentIndex,
            localStateIndex: stateIndex - this._countTree.sum(segmentIndex),
        };
    }

    completeStateSnapshot(): TState[] | null {
        return this.isComplete ? this._prefixStates : null;
    }

    requireCompleteStateSnapshot(): TState[] {
        const state = this.completeStateSnapshot();
        if (!state)
            throw new Error(`Semantic state is incomplete: ${this._completePrefix}/${this.length} source segments parsed.`);
        return state;
    }

    private _appendToPrefix(states: readonly TState[]) {
        this._prefixStates.push(...states);
        this._completePrefix++;
    }

    private _ensureCountTree() {
        if (!this._countTreeDirty)
            return;
        this._countTree.build(this._stateCounts);
        this._countTreeDirty = false;
    }

    private _assertSegmentIndex(segmentIndex: number) {
        if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= this.length)
            throw new RangeError(`Invalid source segment ${segmentIndex} for ${this.length} segments.`);
    }
}
