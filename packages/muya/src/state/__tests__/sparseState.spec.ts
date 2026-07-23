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

    it.each([0x1, 0x51A7E, 0xC0FFEE, 0xDEADBEEF, 0xFFFFFFFF])(
        'matches a persistent sparse array model for seed %s',
        (initialSeed) => {
            let seed = initialSeed;
            const random = () => {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 0x1_0000_0000;
            };
            const model: Array<string | undefined> = [];
            model.length = 53;
            let state = SparseState.empty<string>(model.length, 7);

            for (let operation = 0; operation < 300; operation++) {
                const action = random();
                if (model.length > 0 && action < 0.4) {
                    const previous = state;
                    const previousModel = model.slice();
                    const updates = Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
                        const index = Math.floor(random() * model.length);
                        const value = `${initialSeed}:${operation}:${index}`;
                        model[index] = value;
                        return [index, value] as const;
                    });
                    state = state.withUpdates(updates);
                    expect(previous.toArray()).toEqual(previousModel);
                }
                else if (model.length > 0 && action < 0.65) {
                    const updates = Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
                        const index = Math.floor(random() * model.length);
                        const value = `hydrated:${initialSeed}:${operation}:${index}`;
                        if (model[index] === undefined)
                            model[index] = value;
                        return [index, value] as const;
                    });
                    expect(state.hydrate(updates)).toBe(state);
                }
                else {
                    const start = Math.floor(random() * (model.length + 1));
                    const removed = Math.min(model.length - start, Math.floor(random() * 8));
                    const inserted = Array.from(
                        { length: Math.floor(random() * 8) },
                        (_, index) => `inserted:${initialSeed}:${operation}:${index}`,
                    );
                    const previous = state;
                    const previousModel = model.slice();
                    model.splice(start, removed, ...inserted);
                    state = state.splice(start, removed, inserted);
                    expect(previous.toArray()).toEqual(previousModel);
                }

                expect(state.length).toBe(model.length);
                expect(state.toArray()).toEqual(model);
                const defined: Array<readonly [number, string]> = [];
                state.forEachDefined((value, index) => defined.push([index, value]));
                expect(defined).toEqual(model.flatMap((value, index) => (
                    value === undefined ? [] : [[index, value] as const]
                )));
                for (let sample = 0; sample < 5 && model.length > 0; sample++) {
                    const index = Math.floor(random() * model.length);
                    expect(state.at(index)).toBe(model[index]);
                    expect(index in state.asArray()).toBe(model[index] !== undefined);
                }
            }
        },
    );
});
