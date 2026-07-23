import type { MarkdownSourceIndex } from './markdownSourceIndex';
import type { TState } from './types';
import { PagedMeasuredSequence } from '../utils/pagedMeasuredSequence';

export interface ISegmentStateRange {
    start: number;
    end: number;
}

export interface ISegmentStateLocation {
    segmentIndex: number;
    localStateIndex: number;
}

const STATE_COUNT = 0;
const STATE_COUNT_KNOWN = 1;
const PARSED = 2;

/**
 * Stable source-segment ownership for semantic states.
 *
 * Sequential parsing appends into one compact prefix. Viewport work may finish
 * out of order and remains sparse until the sequential prefix reaches it. Flat
 * OT paths are exposed only for that complete prefix, where every preceding
 * segment state count is known.
 */
export class MarkdownSegmentTree {
    private readonly _segments = new PagedMeasuredSequence(
        3,
        256,
        32,
        ['uint32', 'uint8', 'uint8'],
    );

    private readonly _prefixStates: TState[] = [];
    private readonly _segmentBuffer = new Float64Array(3);
    private readonly _sparseStates = new Map<number, readonly TState[]>();
    private _completePrefix = 0;
    private _knownCountPrefix = 0;
    private _parsedSegments = 0;
    private _parsedStates = 0;

    readonly revision: number;

    constructor(readonly sourceIndex: MarkdownSourceIndex) {
        this.revision = sourceIndex.revision;
        let cachedIndex = -1;
        let cachedHint: 1 | null = null;
        this._segments.build(sourceIndex.length, (segmentIndex, measure) => {
            if (segmentIndex !== cachedIndex) {
                cachedIndex = segmentIndex;
                cachedHint = sourceIndex.stateCountHintAt(segmentIndex);
                if (segmentIndex === this._knownCountPrefix && cachedHint !== null)
                    this._knownCountPrefix++;
            }
            if (measure === STATE_COUNT)
                return cachedHint ?? 0;
            return measure === STATE_COUNT_KNOWN && cachedHint !== null ? 1 : 0;
        });
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

    get knownCountPrefix() {
        return this._knownCountPrefix;
    }

    get knownPrefixStates() {
        return this._statePrefix(this._knownCountPrefix);
    }

    get areAllStateCountsKnown() {
        return this._knownCountPrefix === this.length;
    }

    get isComplete() {
        return this._completePrefix === this.length;
    }

    get totalStates() {
        if (!this.areAllStateCountsKnown)
            throw new Error(`Semantic state counts are incomplete: ${this._knownCountPrefix}/${this.length}.`);
        return this._segments.total(STATE_COUNT);
    }

    get storageBytes() {
        return this._segments.storageBytes;
    }

    isParsed(segmentIndex: number) {
        this._assertSegmentIndex(segmentIndex);
        return this._segments.measureAt(segmentIndex, PARSED) === 1;
    }

    isStateCountKnown(segmentIndex: number) {
        this._assertSegmentIndex(segmentIndex);
        return this._segments.measureAt(segmentIndex, STATE_COUNT_KNOWN) === 1;
    }

    stateCountAt(segmentIndex: number) {
        this._assertSegmentIndex(segmentIndex);
        const segment = this._segments.recordAt(segmentIndex, this._segmentBuffer);
        return segment[STATE_COUNT_KNOWN] === 1
            ? segment[STATE_COUNT]
            : null;
    }

    commitSegment(segmentIndex: number, states: readonly TState[], revision = this.revision) {
        this._assertSegmentIndex(segmentIndex);
        if (revision !== this.revision)
            return false;
        if (this._segments.measureAt(segmentIndex, PARSED) === 1)
            return false;

        const stateCountKnown = this._segments.measureAt(segmentIndex, STATE_COUNT_KNOWN) === 1;
        const expectedStateCount = this._segments.measureAt(segmentIndex, STATE_COUNT);
        if (
            stateCountKnown
            && expectedStateCount !== states.length
        ) {
            throw new Error(
                `Source segment ${segmentIndex} expected ${expectedStateCount} semantic states but parsed ${states.length}.`,
            );
        }

        this._segments.setMeasure(segmentIndex, PARSED, 1);
        if (!stateCountKnown) {
            this._segments.setMeasure(segmentIndex, STATE_COUNT, states.length);
            this._segments.setMeasure(segmentIndex, STATE_COUNT_KNOWN, 1);
            this._advanceKnownCountPrefix();
        }
        this._parsedSegments++;
        this._parsedStates += states.length;

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

    replaceSegment(segmentIndex: number, states: readonly TState[], revision = this.revision) {
        this._assertSegmentIndex(segmentIndex);
        if (revision !== this.revision || this._segments.measureAt(segmentIndex, PARSED) === 0)
            return false;

        const previousCount = this._segments.measureAt(segmentIndex, STATE_COUNT);
        const nextStates = Array.from(states);
        if (segmentIndex < this._completePrefix) {
            const start = this._statePrefix(segmentIndex);
            this._prefixStates.splice(start, previousCount, ...nextStates);
        }
        else {
            this._sparseStates.set(segmentIndex, nextStates);
        }

        this._segments.setMeasure(segmentIndex, STATE_COUNT, nextStates.length);
        this._segments.setMeasure(segmentIndex, STATE_COUNT_KNOWN, 1);
        this._parsedStates += nextStates.length - previousCount;
        return true;
    }

    statesForSegment(segmentIndex: number): readonly TState[] | null {
        this._assertSegmentIndex(segmentIndex);
        if (this._segments.measureAt(segmentIndex, PARSED) === 0)
            return null;
        if (segmentIndex >= this._completePrefix)
            return this._sparseStates.get(segmentIndex) ?? null;

        const start = this._statePrefix(segmentIndex);
        return this._prefixStates.slice(
            start,
            start + this._segments.measureAt(segmentIndex, STATE_COUNT),
        );
    }

    stateAtLocation(segmentIndex: number, localStateIndex: number): TState | null {
        this._assertSegmentIndex(segmentIndex);
        if (!Number.isInteger(localStateIndex) || localStateIndex < 0)
            return null;
        if (this._segments.measureAt(segmentIndex, PARSED) === 0)
            return null;
        if (segmentIndex >= this._completePrefix)
            return this._sparseStates.get(segmentIndex)?.[localStateIndex] ?? null;
        const stateIndex = this.stateIndexForLocation(segmentIndex, localStateIndex);
        return stateIndex === null ? null : this._prefixStates[stateIndex] ?? null;
    }

    stateRangeForSegment(segmentIndex: number): ISegmentStateRange | null {
        this._assertSegmentIndex(segmentIndex);
        if (segmentIndex >= this._knownCountPrefix)
            return null;
        const start = this._statePrefix(segmentIndex);
        return {
            start,
            end: start + this._segments.measureAt(segmentIndex, STATE_COUNT),
        };
    }

    stateIndexForLocation(segmentIndex: number, localStateIndex: number) {
        const range = this.stateRangeForSegment(segmentIndex);
        if (
            !range
            || !Number.isInteger(localStateIndex)
            || localStateIndex < 0
            || range.start + localStateIndex >= range.end
        ) {
            return null;
        }
        return range.start + localStateIndex;
    }

    locationAtStateIndex(stateIndex: number): ISegmentStateLocation | null {
        if (!Number.isInteger(stateIndex) || stateIndex < 0 || stateIndex >= this.knownPrefixStates)
            return null;
        const segmentIndex = this._segments.selectByMeasure(STATE_COUNT, stateIndex);
        return {
            segmentIndex,
            localStateIndex: stateIndex - this._statePrefix(segmentIndex),
        };
    }

    completeStateSnapshot(): TState[] | null {
        return this.isComplete ? this._prefixStates : null;
    }

    forEachParsedState(visitor: (state: TState) => void) {
        for (const state of this._prefixStates)
            visitor(state);
        for (const states of this._sparseStates.values()) {
            for (const state of states)
                visitor(state);
        }
    }

    copyParsedStatesTo(target: TState[]) {
        this.forEachParsedStateAt((state, stateIndex) => {
            target[stateIndex] = state;
        });
    }

    forEachParsedStateAt(visitor: (state: TState, stateIndex: number) => void) {
        for (let stateIndex = 0; stateIndex < this._prefixStates.length; stateIndex++)
            visitor(this._prefixStates[stateIndex], stateIndex);
        for (const [segmentIndex, states] of this._sparseStates) {
            const start = this._statePrefix(segmentIndex);
            for (let localStateIndex = 0; localStateIndex < states.length; localStateIndex++)
                visitor(states[localStateIndex], start + localStateIndex);
        }
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

    private _statePrefix(segmentCount: number) {
        return this._segments.prefixMeasure(segmentCount, STATE_COUNT);
    }

    private _advanceKnownCountPrefix() {
        while (
            this._knownCountPrefix < this.length
            && this._segments.measureAt(this._knownCountPrefix, STATE_COUNT_KNOWN) === 1
        ) {
            this._knownCountPrefix++;
        }
    }

    private _assertSegmentIndex(segmentIndex: number) {
        if (!Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex >= this.length)
            throw new RangeError(`Invalid source segment ${segmentIndex} for ${this.length} segments.`);
    }
}
