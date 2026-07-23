import { describe, expect, it } from 'vitest';
import { PagedMeasuredSequence } from '../pagedMeasuredSequence';

type Record = [number, number, number];

function reader(records: readonly Record[]) {
    return (index: number, measure: number) => records[index][measure];
}

function prefix(records: readonly Record[], count: number) {
    return records.slice(0, count).reduce<Record>(
        (totals, record) => record.map((value, index) => value + totals[index]) as Record,
        [0, 0, 0],
    );
}

function select(records: readonly Record[], measure: number, offset: number) {
    if (records.length === 0 || offset <= 0)
        return 0;
    let remaining = offset;
    for (let index = 0; index < records.length; index++) {
        if (records[index][measure] > remaining)
            return index;
        remaining -= records[index][measure];
    }
    return records.length - 1;
}

describe('pagedMeasuredSequence', () => {
    it('stores compact integer columns without changing aggregate precision', () => {
        const records: Record[] = Array.from({ length: 1_000 }, (_, index) => [
            index + 1,
            index % 256,
            index % 2,
        ]);
        const sequence = new PagedMeasuredSequence(
            3,
            256,
            32,
            ['uint32', 'uint8', 'uint8'],
        );
        sequence.build(records.length, reader(records));

        expect([...sequence.recordAt(999)]).toEqual(records[999]);
        expect([...sequence.prefixMeasures(1_000)]).toEqual(prefix(records, 1_000));
        expect(sequence.storageBytes).toBeLessThan(7_000);
        expect(() => sequence.setMeasure(0, 1, 256)).toThrow(/requires a uint8 value/);
    });

    it('skips zero-measure records during measured selection', () => {
        const sequence = new PagedMeasuredSequence(1, 4, 4, ['uint32']);
        sequence.build(4, index => [0, 0, 2, 1][index]);

        expect(sequence.selectByMeasure(0, 0)).toBe(2);
        expect(sequence.selectByMeasure(0, 1)).toBe(2);
        expect(sequence.selectByMeasure(0, 2)).toBe(3);
    });

    it('bulk builds compact pages and queries rank, prefixes, ranges, and measures', () => {
        const records: Record[] = Array.from({ length: 137 }, (_, index) => [
            index + 1,
            (index % 7) + 1,
            (index % 3) + 1,
        ]);
        const sequence = new PagedMeasuredSequence(3, 8, 4);
        sequence.build(records.length, reader(records));

        expect(sequence.length).toBe(records.length);
        expect([...sequence.recordAt(73)]).toEqual(records[73]);
        expect([...sequence.prefixMeasures(91)]).toEqual(prefix(records, 91));
        expect(sequence.total(1)).toBe(prefix(records, records.length)[1]);
        for (const offset of [0, 1, 25, sequence.total(1) / 2, sequence.total(1)])
            expect(sequence.selectByMeasure(1, offset)).toBe(select(records, 1, offset));

        const visited: Array<{ index: number; record: number[] }> = [];
        sequence.iterateRange(63, 84, (index, record) => {
            visited.push({ index, record: [...record] });
        });
        expect(visited).toEqual(records.slice(63, 84).map((record, offset) => ({
            index: offset + 63,
            record,
        })));
        expect(sequence.storageBytes).toBeLessThan(8_000);
    });

    it('matches an array model through randomized splices and updates', () => {
        let seed = 0xC0FFEE;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 0x1_0000_0000;
        };
        const makeRecord = (): Record => [
            1 + Math.floor(random() * 100),
            1 + Math.floor(random() * 50),
            1 + Math.floor(random() * 10),
        ];
        const model: Record[] = Array.from({ length: 80 }, makeRecord);
        const sequence = new PagedMeasuredSequence(3, 8, 4);
        sequence.build(model.length, reader(model));

        for (let operation = 0; operation < 1_000; operation++) {
            if (model.length > 0 && random() < 0.35) {
                const index = Math.floor(random() * model.length);
                const measure = Math.floor(random() * 3);
                const value = 1 + Math.floor(random() * 100);
                model[index][measure] = value;
                sequence.setMeasure(index, measure, value);
            }
            else {
                const index = Math.floor(random() * (model.length + 1));
                const removed = Math.min(
                    model.length - index,
                    Math.floor(random() * 12),
                );
                const inserted = Array.from({ length: Math.floor(random() * 12) }, makeRecord);
                model.splice(index, removed, ...inserted);
                sequence.splice(index, removed, inserted.length, reader(inserted));
            }

            expect(sequence.length).toBe(model.length);
            const count = Math.floor(random() * (model.length + 1));
            expect([...sequence.prefixMeasures(count)]).toEqual(prefix(model, count));
            for (let measure = 0; measure < 3; measure++) {
                const total = prefix(model, model.length)[measure];
                expect(sequence.total(measure)).toBe(total);
                if (model.length > 0) {
                    const offset = random() * total;
                    expect(sequence.selectByMeasure(measure, offset)).toBe(select(model, measure, offset));
                }
            }
            if (model.length > 0) {
                const index = Math.floor(random() * model.length);
                expect([...sequence.recordAt(index)]).toEqual(model[index]);
            }
        }
    });
});
