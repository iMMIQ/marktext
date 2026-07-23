import type { Doc, JSONOp, JSONOpList, Path } from 'ot-json1';
import type { Muya } from '../muya';
import type { TDiff } from '../utils';
import type { MarkdownParseSession } from './markdownParseSession';
import type { MarkdownSegmentTree } from './markdownSegmentTree';
import type { TState } from './types';
import * as json1 from 'ot-json1';
import { deepClone } from '../utils';
import logger from '../utils/logger';
import { DocumentStore } from './documentStore';
import { getTOC } from './getTOC';

import { MarkdownSourceIndex } from './markdownSourceIndex';
import { MarkdownSourceParser } from './markdownSourceParser';
import { SparseState } from './sparseState';
import StateToMarkdown from './stateToMarkdown';

const debug = logger('jsonState:');

// ot-json1 declares its document type as the opaque `Doc`. Muya treats the
// document as `TState[]`; bridging the two requires `unknown` casts that
// happen at every callsite. Concentrate them here so production code never
// writes `as unknown as Doc` itself.
export function asDoc(state: readonly TState[] | TState): Doc {
    // eslint-disable-next-line no-restricted-syntax
    return state as unknown as Doc;
}

export interface IJSONChangePayload {
    op: JSONOp;
    source: string;
    prevStateSnapshot: readonly TState[];
    stateSnapshot: readonly TState[];
    structuralChange: IStructuralChange | null;
    readonly prevDoc: TState[];
    readonly doc: TState[];
}

export interface IStructuralChange {
    start: number;
    removed: number;
    inserted: number;
}

export function asState(doc: unknown): TState[] {
    return doc as TState[];
}

export interface IDocumentLoadMetrics {
    inputType: 'markdown' | 'state';
    sourceBytes: number;
    sourceStoreMs: number;
    sourceIndexMs: number;
    sourceIndexBytes: number;
    segmentIndexBytes: number;
    stateCountResolveMs: number;
    stateCountPreparsedSegments: number;
    semanticSlots: number;
    fullParseMs: number;
    sourceCandidates: number;
    parsedLogicalBlocks: number;
    semanticComplete: boolean;
}

export interface ISemanticParseResult {
    stateRanges: Array<{ start: number; end: number }>;
    parsedSegments: number;
    complete: boolean;
}

function topLevelIndexes(op: JSONOp): number[] {
    const indexes: number[] = [];
    const visit = (component: unknown) => {
        if (!Array.isArray(component) || component.length === 0)
            return;
        if (typeof component[0] === 'number') {
            indexes.push(component[0]);
            return;
        }
        component.forEach(visit);
    };
    visit(op);
    return indexes;
}

function shiftTopLevelIndexes(op: JSONOp, delta: number): JSONOp {
    if (!Array.isArray(op))
        return op;
    if (typeof op[0] === 'number')
        return [op[0] - delta, ...op.slice(1)] as JSONOpList;
    return op.map(component => shiftTopLevelIndexes(component as JSONOp, delta)) as JSONOpList;
}

function topLevelComponents(op: JSONOp): JSONOpList[] | null {
    if (op === null)
        return [];
    if (typeof op[0] === 'number')
        return [op];
    if (op.every(component => Array.isArray(component) && typeof component[0] === 'number'))
        return op as JSONOpList[];
    return null;
}

function containsStateName(states: readonly TState[], names: ReadonlySet<string>): boolean {
    for (const state of states) {
        if (names.has(state.name))
            return true;
        if ('children' in state && containsStateName(state.children, names))
            return true;
    }
    return false;
}

const REFERENCE_DEFINITION_NAMES = new Set(['link-reference-definition']);
const HEADING_NAMES = new Set(['atx-heading', 'setext-heading']);

class JSONState {
    static invert(op: JSONOpList) {
        return json1.type.invert(op);
    }

    static compose(op1: JSONOpList, op2: JSONOpList) {
        return json1.type.compose(op1, op2);
    }

    static transform(
        op: JSONOpList,
        otherOp: JSONOpList,
        type: 'left' | 'right',
    ) {
        return json1.type.transform(op, otherOp, type);
    }

    private _operationCache: JSONOpList[] = [];

    // Handle of the scheduled deferred-op flush. Doubles as the "a flush is
    // already scheduled" guard (non-null ⇒ batching in progress), and lets
    // `setContent` cancel a pending batch that belongs to the outgoing
    // document (#2938).
    private _rafId: number | null = null;

    private _state = SparseState.empty<TState>(0);

    private _sourceIndex: MarkdownSourceIndex | null = null;

    private _segmentTree: MarkdownSegmentTree | null = null;

    private _parseSession: MarkdownParseSession | null = null;

    private _sourceOverrides = new Map<number, string>();

    private _semanticParseMs = 0;

    private _referenceDefinitionsReady = false;

    private _referenceRevision = 0;

    private _structuralChange: IStructuralChange | null = null;

    private _headingsReady = false;

    private _loadMetrics: IDocumentLoadMetrics = {
        inputType: 'state',
        sourceBytes: 0,
        sourceStoreMs: 0,
        sourceIndexMs: 0,
        sourceIndexBytes: 0,
        segmentIndexBytes: 0,
        stateCountResolveMs: 0,
        stateCountPreparsedSegments: 0,
        semanticSlots: 0,
        fullParseMs: 0,
        sourceCandidates: 0,
        parsedLogicalBlocks: 0,
        semanticComplete: true,
    };

    constructor(private _muya: Muya, stateOrMarkdown: TState[] | string) {
        this.setContent(stateOrMarkdown);
    }

    private _apply(op: JSONOp) {
        this._structuralChange = null;
        // ot-json1's noop is the literal `null`. `json1.type.apply` accepts it
        // and returns the doc unchanged — short-circuit instead so the rest of
        // the call site can treat `op` as definitely applied.
        if (op === null)
            return;
        if (this._applySourceBackedOperation(op))
            return;
        this._sourceIndex = null;
        this._segmentTree = null;
        this._parseSession = null;
        this._sourceOverrides.clear();
        const state = asState(json1.type.apply(asDoc(this._state.toArray()), op));
        this._state = SparseState.fromArray(state);
        this._referenceDefinitionsReady = false;
        this._headingsReady = false;
        this._referenceRevision++;
    }

    setContent(content: TState[] | string) {
        // A pending deferred-op batch belongs to the OUTGOING document. Applying
        // it to the new content would corrupt it (or throw and leave the flush
        // guard stuck, freezing all future edits). Drop the batch and cancel its
        // scheduled flush before swapping the state (#2938).
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._operationCache = [];

        if (typeof content === 'object')
            this._setState(content);
        else
            this._setMarkdown(content);
    }

    private _setState(state: TState[]) {
        this._sourceIndex = null;
        this._segmentTree = null;
        this._parseSession = null;
        this._sourceOverrides.clear();
        this._semanticParseMs = 0;
        this._referenceDefinitionsReady = false;
        this._headingsReady = false;
        this._referenceRevision++;
        this._state = SparseState.fromArray(state);
        this._loadMetrics = {
            inputType: 'state',
            sourceBytes: 0,
            sourceStoreMs: 0,
            sourceIndexMs: 0,
            sourceIndexBytes: 0,
            segmentIndexBytes: 0,
            stateCountResolveMs: 0,
            stateCountPreparsedSegments: 0,
            semanticSlots: state.length,
            fullParseMs: 0,
            sourceCandidates: 0,
            parsedLogicalBlocks: state.length,
            semanticComplete: true,
        };
    }

    private _setMarkdown(markdown: string) {
        const storeStartedAt = performance.now();
        const snapshot = new DocumentStore(markdown).snapshot();
        const storeCompletedAt = performance.now();
        const {
            fontSize,
            lineHeight,
            codeFontSize,
            wrapCodeBlocks,
            tabSize,
            frontMatter,
            footnote,
            math,
        } = this._muya.options;
        this._sourceIndex = new MarkdownSourceIndex(snapshot, {
            fontSize,
            lineHeight,
            codeFontSize,
            wrapCodeBlocks,
            tabSize,
            frontMatter,
            footnote,
            math,
        });
        const sourceIndexCompletedAt = performance.now();
        const parseSession = this._markdownParser().createSession(this._sourceIndex);
        const stateCountStartedAt = performance.now();
        const stateCountPreparsedSegments = parseSession.resolveStateCounts();
        const stateCountCompletedAt = performance.now();
        this._segmentTree = parseSession.segments;
        this._parseSession = parseSession;
        this._sourceOverrides.clear();
        this._semanticParseMs = stateCountCompletedAt - stateCountStartedAt;
        this._referenceDefinitionsReady = false;
        this._referenceRevision++;
        const updates: Array<readonly [number, TState]> = [];
        this._segmentTree.forEachParsedStateAt((state, stateIndex) => {
            updates.push([stateIndex, state]);
        });
        this._state = SparseState.empty<TState>(this._segmentTree.totalStates).withUpdates(updates);
        this._loadMetrics = {
            inputType: 'markdown',
            sourceBytes: snapshot.length,
            sourceStoreMs: storeCompletedAt - storeStartedAt,
            sourceIndexMs: sourceIndexCompletedAt - storeCompletedAt,
            sourceIndexBytes: this._sourceIndex.storageBytes,
            segmentIndexBytes: this._segmentTree.storageBytes,
            stateCountResolveMs: stateCountCompletedAt - stateCountStartedAt,
            stateCountPreparsedSegments,
            semanticSlots: this._segmentTree.totalStates,
            fullParseMs: this._semanticParseMs,
            sourceCandidates: this._sourceIndex.length,
            parsedLogicalBlocks: this._segmentTree.parsedStates,
            semanticComplete: this._segmentTree.isComplete,
        };
    }

    getDocumentLoadMetrics(): IDocumentLoadMetrics {
        return {
            ...this._loadMetrics,
            fullParseMs: this._semanticParseMs,
            semanticSlots: this._segmentTree?.totalStates ?? this._state.length,
            parsedLogicalBlocks: this._segmentTree?.parsedStates ?? this._state.length,
            semanticComplete: this._segmentTree?.isComplete ?? true,
        };
    }

    getSourceIndex() {
        return this._sourceIndex;
    }

    getSegmentTree() {
        return this._segmentTree;
    }

    get semanticLength() {
        return this._segmentTree?.totalStates ?? this._state.length;
    }

    get isSemanticComplete() {
        return this._segmentTree?.isComplete ?? true;
    }

    get referenceRevision() {
        return this._referenceRevision;
    }

    get isSourceBacked() {
        return this._sourceIndex !== null;
    }

    stateAt(index: number): TState | null {
        return this._state.at(index) ?? null;
    }

    forEachParsedState(visitor: (state: TState) => void) {
        if (this._segmentTree)
            this._segmentTree.forEachParsedState(visitor);
        else
            this._state.forEach(visitor);
    }

    forEachParsedStateInSourceOrder(visitor: (state: TState) => void) {
        if (!this._segmentTree) {
            this._state.forEach(visitor);
            return;
        }
        for (let segmentIndex = 0; segmentIndex < this._segmentTree.length; segmentIndex++) {
            const states = this._segmentTree.statesForSegment(segmentIndex);
            if (states)
                states.forEach(visitor);
        }
    }

    forEachTextState(visitor: (text: string, path: Path) => void) {
        this._materializeAllSemanticStates();
        const visit = (states: readonly TState[], parentPath: Path) => {
            states.forEach((state, index) => {
                const path = [...parentPath, index];
                if (state.name === 'code-block' && state.meta.lang)
                    visitor(state.meta.lang, [...path, 'meta', 'lang']);
                if ('text' in state)
                    visitor(state.text, [...path, 'text']);
                if ('children' in state)
                    visit(state.children, [...path, 'children']);
            });
        };
        visit(this._state.asArray(), []);
    }

    ensureReferenceDefinitions() {
        if (this._referenceDefinitionsReady || !this._sourceIndex || !this._segmentTree)
            return;
        for (let segmentIndex = 0; segmentIndex < this._sourceIndex.length; segmentIndex++) {
            if (this._sourceIndex.kindAt(segmentIndex) !== 'definition')
                continue;
            const range = this._segmentTree.stateRangeForSegment(segmentIndex);
            if (range)
                this.ensureSemanticRange(range.start, range.end);
        }
        this._referenceDefinitionsReady = true;
    }

    ensureHeadings() {
        if (this._headingsReady || !this._sourceIndex || !this._segmentTree)
            return;
        for (let segmentIndex = 0; segmentIndex < this._sourceIndex.length; segmentIndex++) {
            if (this._sourceIndex.kindAt(segmentIndex) !== 'heading')
                continue;
            const range = this._segmentTree.stateRangeForSegment(segmentIndex);
            if (range)
                this.ensureSemanticRange(range.start, range.end);
        }
        this._headingsReady = true;
    }

    ensureSemanticRange(start: number, end: number, direction: 1 | -1 = 1): ISemanticParseResult {
        const session = this._parseSession;
        const segments = this._segmentTree;
        if (!session || !segments || start >= end)
            return { stateRanges: [], parsedSegments: 0, complete: this.isSemanticComplete };

        const normalizedStart = Math.max(0, Math.min(start, segments.totalStates - 1));
        const normalizedEnd = Math.max(normalizedStart + 1, Math.min(end, segments.totalStates));
        const first = segments.locationAtStateIndex(normalizedStart);
        const last = segments.locationAtStateIndex(normalizedEnd - 1);
        if (!first || !last)
            return { stateRanges: [], parsedSegments: 0, complete: segments.isComplete };

        session.prioritizeViewport(first.segmentIndex, last.segmentIndex + 1, direction);
        const startedAt = performance.now();
        let parsedSegments = 0;
        const stateRanges: Array<{ start: number; end: number }> = [];
        while (!this._isStateRangeParsed(normalizedStart, normalizedEnd)) {
            const batch = session.parseNext(Math.max(1, last.segmentIndex - first.segmentIndex + 1));
            parsedSegments += batch.parsedSegments;
            if (batch.task)
                stateRanges.push(...this._syncParsedSegments(batch.task.start, batch.task.end));
            if (!batch.task || (batch.parsedSegments === 0 && !this._isStateRangeParsed(normalizedStart, normalizedEnd)))
                throw new Error(`Semantic parser made no progress for state range [${normalizedStart}, ${normalizedEnd}).`);
        }
        this._semanticParseMs += performance.now() - startedAt;
        stateRanges.push(...this._syncParsedSegments(first.segmentIndex, last.segmentIndex + 1));
        return { stateRanges, parsedSegments, complete: segments.isComplete };
    }

    parseNextSemanticBatch(maxSegments = 256): ISemanticParseResult {
        const session = this._parseSession;
        if (!session)
            return { stateRanges: [], parsedSegments: 0, complete: true };
        const startedAt = performance.now();
        const batch = session.parseNext(maxSegments);
        this._semanticParseMs += performance.now() - startedAt;
        const stateRanges = batch.task
            ? this._syncParsedSegments(batch.task.start, batch.task.end)
            : [];
        return { stateRanges, parsedSegments: batch.parsedSegments, complete: batch.complete };
    }

    private _isStateRangeParsed(start: number, end: number) {
        for (let stateIndex = start; stateIndex < end; stateIndex++) {
            if (!this._state.has(stateIndex))
                return false;
        }
        return true;
    }

    private _syncParsedSegments(start: number, end: number) {
        const segments = this._segmentTree;
        if (!segments)
            return [];
        const ranges: Array<{ start: number; end: number }> = [];
        const normalizedStart = Math.max(0, start);
        const normalizedEnd = Math.min(end, segments.length);
        const updates: Array<readonly [number, TState]> = [];
        for (let segmentIndex = normalizedStart; segmentIndex < normalizedEnd; segmentIndex++) {
            const states = segments.statesForSegment(segmentIndex);
            const range = segments.stateRangeForSegment(segmentIndex);
            if (!states || !range)
                continue;
            for (let localIndex = 0; localIndex < states.length; localIndex++)
                updates.push([range.start + localIndex, states[localIndex]]);
            ranges.push(range);
        }
        if (updates.length > 0)
            this._state.hydrate(updates);
        return ranges;
    }

    private _materializeAllSemanticStates() {
        const session = this._parseSession;
        if (!session)
            return;
        while (!session.segments.isComplete) {
            const startedAt = performance.now();
            const batch = session.parseNext(256);
            this._semanticParseMs += performance.now() - startedAt;
            if (batch.task)
                this._syncParsedSegments(batch.task.start, batch.task.end);
            if (!batch.task)
                throw new Error('Semantic parser stopped before completing the document.');
        }
    }

    private _segmentForOperationIndex(index: number) {
        const segments = this._segmentTree;
        if (!segments || segments.totalStates === 0)
            return null;
        if (index === segments.totalStates)
            return segments.length - 1;
        return segments.locationAtStateIndex(index)?.segmentIndex ?? null;
    }

    private _ensureOperationStates(op: JSONOp) {
        const segments = this._segmentTree;
        if (!segments || op === null)
            return;
        const segmentIndexes = new Set<number>();
        for (const index of topLevelIndexes(op)) {
            const segmentIndex = this._segmentForOperationIndex(index);
            if (segmentIndex !== null)
                segmentIndexes.add(segmentIndex);
        }
        for (const segmentIndex of segmentIndexes) {
            const range = segments.stateRangeForSegment(segmentIndex);
            if (range)
                this.ensureSemanticRange(range.start, Math.max(range.start + 1, range.end));
        }
    }

    private _groupSourceOperationComponents(op: JSONOp) {
        const components = topLevelComponents(op);
        if (!components)
            return null;
        const grouped = new Map<number, JSONOpList[]>();
        for (const component of components) {
            const segmentIndex = this._segmentForOperationIndex(component[0] as number);
            if (segmentIndex === null)
                return null;
            const group = grouped.get(segmentIndex) ?? [];
            group.push(component);
            grouped.set(segmentIndex, group);
        }
        return grouped;
    }

    private _applySourceBackedOperation(op: JSONOp) {
        const segments = this._segmentTree;
        if (!segments || !this._parseSession)
            return false;
        const indexes = [...new Set(topLevelIndexes(op))];
        if (indexes.length === 0)
            return false;
        const grouped = this._groupSourceOperationComponents(op);
        if (!grouped) {
            this._materializeAllSemanticStates();
            return false;
        }

        const replacements: Array<{
            segmentIndex: number;
            range: { start: number; end: number };
            previousStates: readonly TState[];
            nextStates: TState[];
        }> = [];
        for (const [segmentIndex, group] of grouped) {
            const range = segments.stateRangeForSegment(segmentIndex)!;
            this.ensureSemanticRange(range.start, Math.max(range.start + 1, range.end));
            const previousStates = segments.statesForSegment(segmentIndex);
            if (!previousStates) {
                this._materializeAllSemanticStates();
                return false;
            }
            const shifted = group.map(component =>
                shiftTopLevelIndexes(component, range.start) as JSONOpList,
            );
            const localOp = shifted.length === 1 ? shifted[0] : shifted;
            const nextStates = asState(json1.type.apply(asDoc(Array.from(previousStates)), localOp));
            // A zero-state source segment has no flat path that a later undo
            // insert can map back to. Cross-segment structural edits can also
            // move segment boundaries. Preserve the existing single-segment
            // structural path, while limiting multi-segment batches to
            // independent text edits.
            if (
                nextStates.length === 0
                || (grouped.size > 1 && nextStates.length !== previousStates.length)
            ) {
                this._materializeAllSemanticStates();
                return false;
            }
            replacements.push({ segmentIndex, range, previousStates, nextStates });
        }

        for (const { segmentIndex, range, previousStates, nextStates } of replacements) {
            const sourceKind = this._sourceIndex!.kindAt(segmentIndex);
            const touchesReferenceDefinitions = sourceKind === 'definition'
                || containsStateName(previousStates, REFERENCE_DEFINITION_NAMES)
                || containsStateName(nextStates, REFERENCE_DEFINITION_NAMES);
            const touchesHeadings = sourceKind === 'heading'
                || containsStateName(previousStates, HEADING_NAMES)
                || containsStateName(nextStates, HEADING_NAMES);
            if (!segments.replaceSegment(segmentIndex, nextStates))
                return false;
            if (previousStates.length !== nextStates.length) {
                this._structuralChange = {
                    start: range.start,
                    removed: previousStates.length,
                    inserted: nextStates.length,
                };
            }
            this._sourceOverrides.set(segmentIndex, this._serializeSegmentOverride(segmentIndex, nextStates));
            if (touchesReferenceDefinitions) {
                this._referenceDefinitionsReady = false;
                this._referenceRevision++;
            }
            if (touchesHeadings)
                this._headingsReady = false;
            this._state = this._state.splice(
                range.start,
                previousStates.length,
                nextStates,
            );
        }
        return true;
    }

    private _serializeSegmentOverride(segmentIndex: number, states: readonly TState[]) {
        const sourceIndex = this._sourceIndex!;
        const original = sourceIndex.snapshot.slice(
            sourceIndex.sourceFromAt(segmentIndex),
            sourceIndex.sourceToAt(segmentIndex),
        );
        const originalSuffix = /((?:\r?\n[\t ]*)+)$/.exec(original)?.[1] ?? '';
        const generated = this.getMarkdownFromState(states).replace(/(?:\r?\n)+$/, '');
        return generated + originalSuffix;
    }

    // Parse markdown into a block-state array with the editor's current
    // render-affecting options, WITHOUT mutating `this._state`. Used by
    // `buildReplaceOp` to compute the target state for a bulk replacement.
    markdownToState(markdown: string, sourceIndex?: MarkdownSourceIndex): TState[] {
        const { frontMatter, footnote, math } = this._muya.options;
        const index = sourceIndex ?? MarkdownSourceIndex.fromText(markdown, {
            fontSize: this._muya.options.fontSize,
            lineHeight: this._muya.options.lineHeight,
            codeFontSize: this._muya.options.codeFontSize,
            wrapCodeBlocks: this._muya.options.wrapCodeBlocks,
            tabSize: this._muya.options.tabSize,
            frontMatter,
            footnote,
            math,
        });
        return this._markdownParser().parseAllStates(index);
    }

    private _markdownParser() {
        const {
            footnote,
            isGitlabCompatibilityEnabled,
            trimUnnecessaryCodeBlockEmptyLines,
            frontMatter,
            math,
        } = this._muya.options;
        return new MarkdownSourceParser({
            footnote,
            isGitlabCompatibilityEnabled,
            trimUnnecessaryCodeBlockEmptyLines,
            frontMatter,
            math,
        });
    }

    /**
     * Build a single, fully-invertible ot-json1 op that turns the CURRENT
     * document state into `content` (markdown or a state array), and return it
     * together with the before/after states.
     *
     * The op is deliberately MOVE-FREE: it replaces each overlapping top-level
     * block, inserts the tail, and removes the surplus (highest index first).
     * It never emits a pick/drop `move`, so `json1.type.apply` reproduces the
     * target state exactly and `invertWithDoc` yields a lossless inverse. The op
     * is applied to the live tree via `ScrollPage.updateState` (a full rebuild),
     * never the incremental DOM walker, so arbitrary block-type changes are safe.
     */
    buildReplaceOp(content: TState[] | string): {
        op: JSONOpList;
        prevState: TState[];
        nextState: TState[];
    } {
        const prevState = this.getState();
        const nextState
            = typeof content === 'string' ? this.markdownToState(content) : deepClone(content);

        const components: JSONOpList[] = [];
        const max = Math.max(prevState.length, nextState.length);

        for (let i = 0; i < max; i++) {
            if (i < prevState.length && i < nextState.length) {
                if (
                    JSON.stringify(prevState[i]) !== JSON.stringify(nextState[i])
                ) {
                    components.push(
                        json1.replaceOp(
                            [i],
                            asDoc(prevState[i]),
                            asDoc(nextState[i]),
                        )!,
                    );
                }
            }
            else if (i < nextState.length) {
                components.push(json1.insertOp([i], asDoc(nextState[i]))!);
            }
        }

        // Remove surplus trailing blocks from the end so earlier indices stay
        // stable while composing.
        for (let i = prevState.length - 1; i >= nextState.length; i--)
            components.push(json1.removeOp([i])!);

        // Compose the components into one op. `json1.type.compose` returns
        // `JSONOp` (= null | JSONOpList) and its identity element is `null`
        // (composing onto `[]` throws "Empty descent"). Start from `null`, then
        // normalize the final result to the empty op `[]` when nothing changed
        // (the documents were identical) so callers can rely on `op.length`.
        let composed: JSONOp = null;
        for (const component of components)
            composed = json1.type.compose(composed, component);

        const op: JSONOpList = composed ?? [];

        return { op, prevState, nextState };
    }

    insertOperation(path: Path, state: TState) {
        const operation = json1.insertOp(path, asDoc(state))!;

        this._operationCache.push(operation);

        this._emitStateChange();
    }

    removeOperation(path: Path) {
        const operation = json1.removeOp(path)!;

        this._operationCache.push(operation);

        this._emitStateChange();
    }

    editOperation(path: Path, diff: TDiff[]) {
        const operation = json1.editOp(path, 'text-unicode', diff)!;

        this._operationCache.push(operation);

        this._emitStateChange();
    }

    replaceOperation(path: Path, oldValue: Doc, newValue: Doc) {
        const operation = json1.replaceOp(path, oldValue, newValue)!;

        this._operationCache.push(operation);

        this._emitStateChange();
    }

    dispatch(op: JSONOp, source = 'user' /* user, api */) {
        this._ensureOperationStates(op);
        const prevStateSnapshot = this._state.asArray();
        this._apply(op);
        debug.log(JSON.stringify(op));
        this._emitJSONChange(op, source, prevStateSnapshot);
    }

    getState(): TState[] {
        this._materializeAllSemanticStates();
        return deepClone(this._state.toArray());
    }

    getStateIfComplete(): TState[] | null {
        return this.isSemanticComplete ? deepClone(this._state.toArray()) : null;
    }

    getStateSnapshot(): readonly TState[] {
        return this._state.asArray();
    }

    getMarkdown() {
        if (this._sourceIndex) {
            if (this.isSemanticComplete)
                return this.getMarkdownFromState(this._state.asArray());
            if (this._sourceOverrides.size === 0)
                return this._sourceIndex.snapshot.toString();
            const chunks: string[] = [];
            let cursor = 0;
            for (const [segmentIndex, source] of [...this._sourceOverrides].sort(([a], [b]) => a - b)) {
                const from = this._sourceIndex.sourceFromAt(segmentIndex);
                const to = this._sourceIndex.sourceToAt(segmentIndex);
                chunks.push(this._sourceIndex.snapshot.slice(cursor, from), source);
                cursor = to;
            }
            chunks.push(this._sourceIndex.snapshot.slice(cursor));
            return chunks.join('');
        }
        return this.getMarkdownFromState(this._state.asArray());
    }

    getTOC() {
        return getTOC(this._muya);
    }

    // Serialize an ARBITRARY state array to markdown with the same generator
    // `getMarkdown` uses. Used by `Muya.getCursorOffset` to serialize a
    // sentinel-bearing state clone WITHOUT mutating the live `_state`.
    getMarkdownFromState(state: readonly TState[]): string {
        const mdGenerator = new StateToMarkdown({
            listIndentation: this._muya.options.listIndentation,
        });

        return mdGenerator.generate(state);
    }

    private _emitStateChange() {
        if (this._rafId !== null)
            return;

        this._rafId = requestAnimationFrame(() => {
            this._rafId = null;
            this._flushOperationCache();
        });
    }

    private _emitJSONChange(op: JSONOp, source: string, prevStateSnapshot: readonly TState[]) {
        const stateSnapshot = this._state.asArray();
        const payload: IJSONChangePayload = {
            op,
            source,
            prevStateSnapshot,
            stateSnapshot,
            structuralChange: this._structuralChange,
            get prevDoc() {
                return deepClone(Array.from(prevStateSnapshot));
            },
            get doc() {
                return deepClone(Array.from(stateSnapshot));
            },
        };
        this._muya.eventCenter.emit('json-change', payload);
    }

    // Apply queued edits to the current document now instead of on the next
    // frame. Lets a tab switch persist the outgoing tab's last keystroke before
    // `setContent` replaces the document, otherwise that edit is lost (#2938).
    flush() {
        if (this._rafId === null)
            return;

        cancelAnimationFrame(this._rafId);
        this._rafId = null;
        this._flushOperationCache();
    }

    private _flushOperationCache() {
        if (!this._operationCache.length)
            return;

        // Wrap compose in a lambda — `Array.prototype.reduce` passes
        // (acc, current, index, array) to the callback, but
        // `json1.type.compose` only accepts (op1, op2). Without the
        // wrapper TS rejects the signature mismatch.
        // `compose` returns JSONOp (= null | JSONOpList). Multiple queued
        // operations may cancel each other out (for example during IME
        // composition), producing the identity operation (`null`).
        const op = this._operationCache.reduce(
            (acc, curr) => json1.type.compose(acc, curr) as JSONOpList,
        );
        this._ensureOperationStates(op);
        const prevStateSnapshot = this._state.asArray();
        this._apply(op);
        // Clear before emitting: a listener that edits synchronously then starts
        // a fresh batch instead of mutating the one being flushed.
        this._operationCache = [];

        if (op === null)
            return;

        this._emitJSONChange(op, 'user', prevStateSnapshot);
    }
}

export default JSONState;
