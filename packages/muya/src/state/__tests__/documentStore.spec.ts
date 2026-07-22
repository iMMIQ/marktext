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

    it('queries line and offset positions without flattening the document', () => {
        const text = `${'a'.repeat(1_100)}\nbeta\ngamma\n`;
        const store = new DocumentStore(text, { chunkSize: 1024 });

        expect(store.lineCount).toBe(4);
        expect(store.offsetAtLine(0)).toBe(0);
        expect(store.offsetAtLine(1)).toBe(1_101);
        expect(store.offsetAtLine(3)).toBe(text.length);
        expect(store.lineAtOffset(1_100)).toBe(0);
        expect(store.lineAtOffset(1_101)).toBe(1);
        expect(store.lineAtOffset(text.length)).toBe(3);
        expect(store.lineRange(1)).toEqual({ from: 1_101, to: 1_105 });
        const gamma = store.lineRange(2);
        expect(store.slice(gamma.from, gamma.to)).toBe('gamma');
        expect(() => store.offsetAtLine(4)).toThrow(/Invalid line/);
    });

    it('keeps line queries stable on snapshots after edits', () => {
        const store = new DocumentStore('alpha\nbeta\ngamma');
        const snapshot = store.snapshot();

        store.replace(6, 10, 'one\ntwo');

        expect(snapshot.lineCount).toBe(3);
        expect(snapshot.offsetAtLine(2)).toBe(11);
        expect(snapshot.lineRange(1)).toEqual({ from: 6, to: 10 });
        expect(store.lineCount).toBe(4);
        expect(store.offsetAtLine(2)).toBe(10);
        expect(store.lineRange(2)).toEqual({ from: 10, to: 13 });
    });

    it('matches reference line queries across chunks and random edits', () => {
        let seed = 0xC0FFEE;
        const random = () => {
            seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
            return seed / 0x1_0000_0000;
        };
        const randomText = (length: number) => Array.from({ length }, () => {
            const value = random();
            return value < 0.08 ? '\n' : value < 0.1 ? '\r' : String.fromCharCode(97 + Math.floor(random() * 26));
        }).join('');
        const referenceLineStarts = (text: string) => {
            const starts = [0];
            for (let offset = 0; offset < text.length; offset++) {
                if (text[offset] === '\n')
                    starts.push(offset + 1);
            }
            return starts;
        };
        const assertQueries = (store: DocumentStore, text: string) => {
            const starts = referenceLineStarts(text);
            expect(store.lineCount).toBe(starts.length);
            for (let line = 0; line < starts.length; line++) {
                const next = starts[line + 1] ?? text.length;
                let to = next > starts[line] && text[next - 1] === '\n' ? next - 1 : next;
                if (to > starts[line] && text[to - 1] === '\r')
                    to--;
                expect(store.offsetAtLine(line)).toBe(starts[line]);
                expect(store.lineRange(line)).toEqual({ from: starts[line], to });
            }
            for (let sample = 0; sample < 40; sample++) {
                const offset = Math.floor(random() * (text.length + 1));
                expect(store.lineAtOffset(offset)).toBe(text.slice(0, offset).split('\n').length - 1);
            }
        };

        let text = randomText(4_096);
        const store = new DocumentStore(text, { chunkSize: 1024 });
        assertQueries(store, text);

        for (let edit = 0; edit < 30; edit++) {
            const from = Math.floor(random() * (text.length + 1));
            const to = from + Math.floor(random() * (text.length - from + 1));
            const insert = randomText(Math.floor(random() * 80));
            store.replace(from, to, insert);
            text = `${text.slice(0, from)}${insert}${text.slice(to)}`;
            assertQueries(store, text);
        }
    });
});
