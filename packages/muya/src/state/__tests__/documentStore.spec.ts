import { describe, expect, it } from 'vitest';
import { DocumentStore } from '../documentStore';

describe('documentStore', () => {
    it('slices across chunks and keeps immutable snapshots', () => {
        const store = new DocumentStore('alpha\nbeta\ngamma', { chunkSize: 1024 });
        const snapshot = store.snapshot();

        store.replace(6, 10, 'BETA!');

        expect(snapshot.toString()).toBe('alpha\nbeta\ngamma');
        expect(store.toString()).toBe('alpha\nBETA!\ngamma');
        expect(store.slice(6, 11)).toBe('BETA!');
        expect(store.lineCount).toBe(3);
    });

    it('updates anchors according to their affinity', () => {
        const store = new DocumentStore('abcd');
        const left = store.createAnchor(2, 'left');
        const right = store.createAnchor(2, 'right');

        store.replace(2, 2, 'XY');

        expect(store.resolveAnchor(left)).toBe(2);
        expect(store.resolveAnchor(right)).toBe(4);
    });

    it('returns an invertible transaction and rejects stale revisions', () => {
        const store = new DocumentStore('alpha beta');
        const applied = store.apply({
            baseRevision: 0,
            origin: 'input',
            steps: [{ from: 6, to: 10, insert: 'BETA' }],
        });

        expect(store.toString()).toBe('alpha BETA');
        store.apply(applied.inverse);
        expect(store.toString()).toBe('alpha beta');
        expect(() => store.apply({
            baseRevision: 0,
            origin: 'input',
            steps: [{ from: 0, to: 0, insert: 'x' }],
        })).toThrow(/Stale edit transaction/);
    });

    it('applies multiple non-overlapping replacements atomically', () => {
        const store = new DocumentStore('0123456789');

        store.apply({
            baseRevision: 0,
            origin: 'command',
            steps: [
                { from: 1, to: 3, insert: 'A' },
                { from: 7, to: 9, insert: 'BC' },
            ],
        });

        expect(store.toString()).toBe('0A3456BC9');
        expect(store.revision).toBe(1);
    });
});
