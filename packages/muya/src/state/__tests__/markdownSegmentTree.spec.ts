import type { TState } from '../types';
import { describe, expect, it } from 'vitest';
import { MarkdownSegmentTree } from '../markdownSegmentTree';
import { MarkdownSourceIndex } from '../markdownSourceIndex';
import { MarkdownSourceParser } from '../markdownSourceParser';

function paragraph(text: string): TState {
    return { name: 'paragraph', text };
}

const PARSER_OPTIONS = {
    footnote: false,
    math: true,
    isGitlabCompatibilityEnabled: true,
    trimUnnecessaryCodeBlockEmptyLines: false,
    frontMatter: false,
};

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

    it('maps past a zero-state uncertain segment without rebuilding counts', () => {
        const tree = new MarkdownSegmentTree(MarkdownSourceIndex.fromText('[link]: /target\n\nafter\n'));

        expect(tree.knownCountPrefix).toBe(0);
        expect(tree.commitSegment(0, [])).toBe(true);
        expect(tree.areAllStateCountsKnown).toBe(true);
        expect(tree.totalStates).toBe(1);
        expect(tree.stateRangeForSegment(0)).toEqual({ start: 0, end: 0 });
        expect(tree.stateRangeForSegment(1)).toEqual({ start: 0, end: 1 });
        expect(tree.locationAtStateIndex(0)).toEqual({ segmentIndex: 1, localStateIndex: 0 });
    });

    it('keeps structural storage bounded independently of semantic state size', () => {
        const markdown = Array.from({ length: 2_500 }, (_, index) => `paragraph ${index}`).join('\n\n');
        const tree = new MarkdownSegmentTree(MarkdownSourceIndex.fromText(markdown));

        expect(tree.storageBytes).toBeLessThan(tree.length * 7);
    });

    it('fails closed when a certain source segment violates its state count hint', () => {
        const tree = new MarkdownSegmentTree(MarkdownSourceIndex.fromText('paragraph\n'));

        expect(() => tree.commitSegment(0, [paragraph('one'), paragraph('two')]))
            .toThrow(/expected 1 semantic states but parsed 2/);
    });

    it.each([0x1, 0x51A7E, 0xC0FFEE, 0xDEADBEEF, 0xFFFFFFFF])(
        'matches flat state ranges through preempted parsing for seed %s',
        (initialSeed) => {
            let seed = initialSeed;
            const random = () => {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 0x1_0000_0000;
            };
            const markdown = Array.from({ length: 80 }, (_, index) => {
                const variant = Math.floor(random() * 5);
                if (variant === 0)
                    return `[reference-${index}]: /target/${index}`;
                if (variant === 1)
                    return `> quote ${index}\n> continued`;
                if (variant === 2)
                    return `- item ${index}\n- item ${index + 1}`;
                if (variant === 3)
                    return `\`\`\`ts\nconst value = ${index};\n\`\`\``;
                return `paragraph ${index}`;
            }).join('\n\n');
            const source = MarkdownSourceIndex.fromText(markdown, { frontMatter: false });
            const parser = new MarkdownSourceParser(PARSER_OPTIONS);
            const expected = Array.from(
                { length: source.length },
                (_, index) => Array.from(parser.parseSegmentStates(source, index)),
            );
            const tree = new MarkdownSegmentTree(source);
            const order = Array.from({ length: source.length }, (_, index) => index);
            for (let index = order.length - 1; index > 0; index--) {
                const target = Math.floor(random() * (index + 1));
                [order[index], order[target]] = [order[target], order[index]];
            }
            for (const segmentIndex of order)
                expect(tree.commitSegment(segmentIndex, expected[segmentIndex])).toBe(true);

            const assertFlatModel = () => {
                let stateIndex = 0;
                for (let segmentIndex = 0; segmentIndex < expected.length; segmentIndex++) {
                    const states = expected[segmentIndex];
                    expect(tree.stateRangeForSegment(segmentIndex)).toEqual({
                        start: stateIndex,
                        end: stateIndex + states.length,
                    });
                    expect(tree.statesForSegment(segmentIndex)).toEqual(states);
                    for (let localStateIndex = 0; localStateIndex < states.length; localStateIndex++) {
                        expect(tree.stateIndexForLocation(segmentIndex, localStateIndex)).toBe(stateIndex);
                        expect(tree.locationAtStateIndex(stateIndex)).toEqual({
                            segmentIndex,
                            localStateIndex,
                        });
                        stateIndex++;
                    }
                }
                expect(tree.totalStates).toBe(stateIndex);
                expect(tree.requireCompleteStateSnapshot()).toEqual(expected.flat());
            };
            assertFlatModel();

            for (let operation = 0; operation < 20; operation++) {
                const segmentIndex = Math.floor(random() * expected.length);
                const states = Array.from(
                    { length: Math.floor(random() * 4) },
                    (_, index) => paragraph(`replacement ${operation}:${index}`),
                );
                expected[segmentIndex] = states;
                expect(tree.replaceSegment(segmentIndex, states)).toBe(true);
                assertFlatModel();
            }
        },
    );
});
