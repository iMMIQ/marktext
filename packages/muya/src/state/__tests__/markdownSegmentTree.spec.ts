import type { TState } from '../types';
import { describe, expect, it } from 'vitest';
import { MarkdownSegmentTree } from '../markdownSegmentTree';
import { MarkdownSourceIndex } from '../markdownSourceIndex';

function paragraph(text: string): TState {
    return { name: 'paragraph', text };
}

describe('markdownSegmentTree', () => {
    it('keeps preempted segments sparse until the sequential prefix reaches them', () => {
        const sourceIndex = MarkdownSourceIndex.fromText('zero\n\none\n\ntwo\n\nthree\n');
        const tree = new MarkdownSegmentTree(sourceIndex);

        expect(tree.areAllStateCountsKnown).toBe(true);
        expect(tree.knownPrefixStates).toBe(4);
        expect(tree.commitSegment(2, [paragraph('two')])).toBe(true);
        expect(tree.completePrefix).toBe(0);
        expect(tree.stateRangeForSegment(2)).toEqual({ start: 2, end: 3 });
        expect(tree.stateIndexForLocation(2, 0)).toBe(2);
        expect(tree.stateIndexForLocation(2, 1)).toBeNull();
        expect(tree.statesForSegment(2)).toEqual([paragraph('two')]);

        tree.commitSegment(0, [paragraph('zero')]);
        tree.commitSegment(1, [paragraph('one')]);

        expect(tree.completePrefix).toBe(3);
        expect(tree.completePrefixStates).toBe(3);
        expect(tree.stateRangeForSegment(2)).toEqual({ start: 2, end: 3 });
        expect(tree.locationAtStateIndex(3)).toEqual({ segmentIndex: 3, localStateIndex: 0 });

        tree.commitSegment(3, [paragraph('three')]);
        expect(tree.isComplete).toBe(true);
        expect(tree.requireCompleteStateSnapshot()).toEqual([
            paragraph('zero'),
            paragraph('one'),
            paragraph('two'),
            paragraph('three'),
        ]);
    });

    it('replaces a parsed segment and updates following flat paths', () => {
        const index = MarkdownSourceIndex.fromText('a\n\nb\n\nc\n');
        const tree = new MarkdownSegmentTree(index);
        tree.commitSegment(0, [{ name: 'paragraph', text: 'a' }]);
        tree.commitSegment(1, [{ name: 'paragraph', text: 'b' }]);
        tree.commitSegment(2, [{ name: 'paragraph', text: 'c' }]);

        expect(tree.replaceSegment(1, [
            { name: 'paragraph', text: 'b1' },
            { name: 'paragraph', text: 'b2' },
        ])).toBe(true);

        expect(tree.totalStates).toBe(4);
        expect(tree.stateRangeForSegment(2)).toEqual({ start: 3, end: 4 });
        expect(tree.stateAtLocation(1, 1)).toMatchObject({ text: 'b2' });
        expect(tree.requireCompleteStateSnapshot().map(state => 'text' in state ? state.text : null))
            .toEqual(['a', 'b1', 'b2', 'c']);
    });

    it('rejects stale parse work and duplicate commits', () => {
        const sourceIndex = MarkdownSourceIndex.fromText('one\n\ntwo\n');
        const tree = new MarkdownSegmentTree(sourceIndex);

        expect(tree.commitSegment(0, [paragraph('stale')], sourceIndex.revision + 1)).toBe(false);
        expect(tree.commitSegment(0, [paragraph('one')])).toBe(true);
        expect(tree.commitSegment(0, [paragraph('duplicate')])).toBe(false);
        expect(tree.statesForSegment(0)).toEqual([paragraph('one')]);
    });

    it('copies only parsed semantic states into a sparse snapshot', () => {
        const tree = new MarkdownSegmentTree(MarkdownSourceIndex.fromText('zero\n\none\n\ntwo\n'));
        tree.commitSegment(2, [paragraph('two')]);
        const snapshot: TState[] = [];
        snapshot.length = tree.totalStates;

        tree.copyParsedStatesTo(snapshot);

        expect(snapshot.length).toBe(3);
        expect(0 in snapshot).toBe(false);
        expect(1 in snapshot).toBe(false);
        expect(snapshot[2]).toEqual(paragraph('two'));
    });

    it('keeps structural storage bounded independently of semantic state size', () => {
        const markdown = Array.from({ length: 2_500 }, (_, index) => `paragraph ${index}`).join('\n\n');
        const tree = new MarkdownSegmentTree(MarkdownSourceIndex.fromText(markdown));

        expect(tree.storageBytes).toBeLessThan(tree.length * 11 + 8);
    });

    it('fails closed when a certain source segment violates its state count hint', () => {
        const tree = new MarkdownSegmentTree(MarkdownSourceIndex.fromText('paragraph\n'));

        expect(() => tree.commitSegment(0, [paragraph('one'), paragraph('two')]))
            .toThrow(/expected 1 semantic states but parsed 2/);
    });
});
