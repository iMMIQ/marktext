import { describe, expect, it } from 'vitest';
import { SparseState } from '../sparseState';

describe('sparseState', () => {
    it('exposes an array-compatible persistent snapshot', () => {
        const first = SparseState.empty<string>(1_000, 8).withUpdates([
            [3, 'three'],
            [700, 'seven hundred'],
        ]);
        const firstArray = first.asArray();
        const second = first.withUpdates([[3, 'changed']]);

        expect(Array.isArray(firstArray)).toBe(true);
        expect(firstArray.length).toBe(1_000);
        expect(2 in firstArray).toBe(false);
        expect(3 in firstArray).toBe(true);
        expect(firstArray[3]).toBe('three');
        expect(second.asArray()[3]).toBe('changed');
        expect(firstArray[3]).toBe('three');
        expect(firstArray.slice(698, 702)).toEqual([undefined, undefined, 'seven hundred', undefined]);
    });

    it('remaps only populated entries across structural splices', () => {
        const first = SparseState.empty<string>(1_000, 8).withUpdates([
            [2, 'before'],
            [500, 'removed'],
            [900, 'after'],
        ]);

        const second = first.splice(500, 1, ['left', 'right']);

        expect(second.length).toBe(1_001);
        expect(second.at(2)).toBe('before');
        expect(second.at(500)).toBe('left');
        expect(second.at(501)).toBe('right');
        expect(second.at(901)).toBe('after');
        expect(first.at(500)).toBe('removed');
        expect(first.at(900)).toBe('after');
    });
});
