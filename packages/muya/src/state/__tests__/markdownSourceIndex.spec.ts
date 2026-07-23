import { describe, expect, it, vi } from 'vitest';
import { DocumentStore } from '../documentStore';
import { MarkdownSourceIndex } from '../markdownSourceIndex';

describe('markdownSourceIndex', () => {
    it('scans mixed Markdown into source-backed block candidates', () => {
        const markdown = [
            '# Heading',
            '',
            'paragraph one',
            'continued',
            '',
            '- item one',
            '- item two',
            '',
            '```ts',
            '',
            'const value = 1;',
            '```',
            '',
            '---',
            '',
        ].join('\n');
        const index = MarkdownSourceIndex.fromText(markdown, { frontMatter: false });

        expect(index.records().map(record => record.kind)).toEqual([
            'heading',
            'paragraph',
            'list',
            'code',
            'thematic-break',
        ]);
        expect(index.sourceForRange(3, 4)).toContain('const value = 1;');
        expect(index.recordAt(3)).toMatchObject({ hardLines: 4, startLine: 8 });
        expect(index.records().map(record => record.stateCountHint)).toEqual([
            1,
            1,
            1,
            1,
            1,
        ]);
    });

    it('recognizes setext headings, tables, math, and configured frontmatter', () => {
        const markdown = [
            '---',
            'title: Example',
            '---',
            '',
            'Setext title',
            '============',
            '',
            '| A | B |',
            '| - | - |',
            '| 1 | 2 |',
            '',
            '$$',
            'x + y',
            '$$',
        ].join('\n');
        const index = MarkdownSourceIndex.fromText(markdown);

        expect(index.records().map(record => record.kind)).toEqual([
            'frontmatter',
            'heading',
            'table',
            'math',
        ]);
    });

    it('gives hyphen setext headings precedence over thematic breaks', () => {
        const index = MarkdownSourceIndex.fromText('Title\r\n---\r\n\r\n---\r\n', { frontMatter: false });

        expect(index.records().map(record => record.kind)).toEqual(['heading', 'thematic-break']);
        expect(index.recordAt(0)).toMatchObject({ hardLines: 2, startLine: 0, endLine: 3 });
    });

    it('only recognizes frontmatter at the first source offset', () => {
        const index = MarkdownSourceIndex.fromText('\n---\ntitle: Example\n---\n');

        expect(index.recordAt(0)?.kind).not.toBe('frontmatter');
    });

    it('keeps longer matching fence closers and embedded blank lines in one candidate', () => {
        const index = MarkdownSourceIndex.fromText('````js\nconst x = `value`;\n\n`````\nafter');

        expect(index.records().map(record => record.kind)).toEqual(['code', 'paragraph']);
        expect(index.recordAt(0)).toMatchObject({ hardLines: 4, startLine: 0, endLine: 4 });
    });

    it('queries source offsets, heights, and progress ranges logarithmically', () => {
        const markdown = Array.from({ length: 100 }, (_, index) => `paragraph ${index}`)
            .join('\n\n');
        const index = MarkdownSourceIndex.fromText(markdown);
        const middleOffset = markdown.indexOf('paragraph 50');

        expect(index.length).toBe(100);
        expect(index.indexAtOffset(middleOffset)).toBe(50);
        expect(index.indexAtProgress(0.5)).toBeGreaterThan(40);
        expect(index.indexAtProgress(0.5)).toBeLessThan(60);
        expect(index.rangeForProgress(0.5, 0.55)).toMatchObject({
            start: expect.any(Number),
            end: expect.any(Number),
        });
        expect(index.totalHeight).toBeGreaterThan(0);
    });

    it('keeps compact records exact after growing beyond the initial capacity', () => {
        const markdown = Array.from({ length: 2_500 }, (_, index) => `paragraph ${index}`)
            .join('\n\n');
        const index = MarkdownSourceIndex.fromText(markdown);
        const records = index.records();

        expect(index.length).toBe(2_500);
        expect(records).toHaveLength(index.length);
        for (const candidate of [0, 1_023, 1_024, 2_499]) {
            const record = records[candidate];
            expect(index.recordAt(candidate)).toEqual(record);
            expect(index.sourceFromAt(candidate)).toBe(record.from);
            expect(index.sourceToAt(candidate)).toBe(record.to);
            expect(index.indexAtOffset(record.from)).toBe(candidate);
            expect(index.indexAtHeight(index.topAt(candidate))).toBe(candidate);
        }

        expect(index.storageBytes).toBeLessThan(index.length * 70);
    });

    it('uses snapshot chunks without flattening the document', () => {
        const snapshot = new DocumentStore(`${'x'.repeat(2_000)}\n\nend`, { chunkSize: 1024 }).snapshot();
        const flatten = vi.spyOn(snapshot, 'toString').mockImplementation(() => {
            throw new Error('must not flatten');
        });

        const index = new MarkdownSourceIndex(snapshot, { contentWidth: 160 });

        expect(index.length).toBe(2);
        expect(index.recordAt(0)!.visualRows).toBeGreaterThan(10);
        expect(flatten).not.toHaveBeenCalled();
    });

    it('resumes a bounded source scan without changing the final index', () => {
        const markdown = [
            '# first',
            '',
            'paragraph',
            '',
            '```ts',
            '',
            'const value = 1;',
            '```',
            '',
            '- one',
            '- two',
        ].join('\n');
        const snapshot = new DocumentStore(markdown, { chunkSize: 1024 }).snapshot();
        const scan = MarkdownSourceIndex.startScan(snapshot);
        const batches = [];

        while (!scan.complete)
            batches.push(scan.step(2));

        const incremental = scan.finish();
        const synchronous = new MarkdownSourceIndex(snapshot);
        expect(batches.length).toBeGreaterThan(1);
        expect(batches.at(-1)).toMatchObject({
            scannedBytes: markdown.length,
            sourceBytes: markdown.length,
            complete: true,
        });
        expect(incremental.records()).toEqual(synchronous.records());
    });
});
