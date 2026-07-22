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

        expect(tree.commitSegment(2, [paragraph('two a'), paragraph('two b')])).toBe(true);
        expect(tree.completePrefix).toBe(0);
        expect(tree.stateRangeForSegment(2)).toBeNull();
        expect(tree.statesForSegment(2)).toEqual([paragraph('two a'), paragraph('two b')]);

        tree.commitSegment(0, [paragraph('zero')]);
        tree.commitSegment(1, [paragraph('one')]);

        expect(tree.completePrefix).toBe(3);
        expect(tree.completePrefixStates).toBe(4);
        expect(tree.stateRangeForSegment(2)).toEqual({ start: 2, end: 4 });
        expect(tree.locationAtStateIndex(3)).toEqual({ segmentIndex: 2, localStateIndex: 1 });

        tree.commitSegment(3, [paragraph('three')]);
        expect(tree.isComplete).toBe(true);
        expect(tree.requireCompleteStateSnapshot()).toEqual([
            paragraph('zero'),
            paragraph('one'),
            paragraph('two a'),
            paragraph('two b'),
            paragraph('three'),
        ]);
    });

    it('rejects stale parse work and duplicate commits', () => {
        const sourceIndex = MarkdownSourceIndex.fromText('one\n\ntwo\n');
        const tree = new MarkdownSegmentTree(sourceIndex);

        expect(tree.commitSegment(0, [paragraph('stale')], sourceIndex.revision + 1)).toBe(false);
        expect(tree.commitSegment(0, [paragraph('one')])).toBe(true);
        expect(tree.commitSegment(0, [paragraph('duplicate')])).toBe(false);
        expect(tree.statesForSegment(0)).toEqual([paragraph('one')]);
    });

    it('keeps structural storage bounded independently of semantic state size', () => {
        const markdown = Array.from({ length: 2_500 }, (_, index) => `paragraph ${index}`).join('\n\n');
        const tree = new MarkdownSegmentTree(MarkdownSourceIndex.fromText(markdown));

        expect(tree.storageBytes).toBeLessThan(tree.length * 10 + 8);
    });
});
