// @vitest-environment happy-dom

import type { Muya } from '../../muya';
import * as json1 from 'ot-json1';
import { describe, expect, it } from 'vitest';
import JSONState, { asDoc } from '../index';

function makeMuya(): Muya {
    return {
        options: {
            fontSize: 16,
            lineHeight: 1.6,
            codeFontSize: 14,
            wrapCodeBlocks: false,
            tabSize: 4,
            footnote: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
            math: true,
            listIndentation: 1,
        },
        eventCenter: { emit: () => {} },
    } as unknown as Muya;
}

describe('document load metrics', () => {
    it('builds the source store and source index before incremental semantic state', () => {
        const markdown = '# Heading\n\nParagraph\n\n```ts\nconst x = 1;\n```\n';
        const state = new JSONState(makeMuya(), markdown);
        const metrics = state.getDocumentLoadMetrics();

        expect(metrics).toMatchObject({
            inputType: 'markdown',
            sourceBytes: markdown.length,
            sourceCandidates: 3,
            parsedLogicalBlocks: 0,
            semanticComplete: false,
            sourceStoreMs: expect.any(Number),
            sourceIndexMs: expect.any(Number),
            stateCountResolveMs: expect.any(Number),
            stateCountPreparsedSegments: expect.any(Number),
            semanticSlots: 3,
            fullParseMs: expect.any(Number),
        });
        expect(state.getSourceIndex()?.sourceForRange(1, 2)).toContain('Paragraph');
        expect(state.getSegmentTree()).toMatchObject({
            isComplete: false,
            parsedSegments: 0,
            parsedStates: 0,
        });

        state.ensureSemanticRange(0, 1);

        expect(state.stateAt(0)).toMatchObject({ name: 'atx-heading' });
        expect(state.getDocumentLoadMetrics()).toMatchObject({
            parsedLogicalBlocks: 1,
            semanticComplete: false,
        });
        expect(state.getState()).toHaveLength(3);
        expect(state.getDocumentLoadMetrics()).toMatchObject({
            parsedLogicalBlocks: 3,
            semanticComplete: true,
        });
    });

    it('keeps source coordinates and patches one parsed segment after an edit', () => {
        const state = new JSONState(makeMuya(), 'before\n');

        state.dispatch(json1.editOp([0, 'text'], 'text-unicode', [6, ' after']), 'test');

        expect(state.getSourceIndex()).not.toBeNull();
        expect(state.getSegmentTree()).not.toBeNull();
        expect(state.getMarkdown()).toBe('before after\n');
        expect(state.stateAt(0)).toMatchObject({ text: 'before after' });
    });

    it('preserves the source segment boundary after an incremental edit', () => {
        const state = new JSONState(makeMuya(), 'first\n\nsecond\n');

        state.dispatch(json1.editOp([0, 'text'], 'text-unicode', [5, '!']), 'test');

        expect(state.getMarkdown()).toBe('first!\n\nsecond\n');
        expect(state.getSegmentTree()).toMatchObject({ isComplete: false });
    });

    it('keeps an untouched source tail lazy across repeated edits', () => {
        const state = new JSONState(makeMuya(), 'first\n\nsecond\n\nthird');

        state.dispatch(json1.editOp([0, 'text'], 'text-unicode', [5, '!']), 'test');
        state.dispatch(json1.editOp([0, 'text'], 'text-unicode', [6, '?']), 'test');

        expect(state.getMarkdown()).toBe('first!?\n\nsecond\n\nthird');
        expect(state.getDocumentLoadMetrics()).toMatchObject({
            parsedLogicalBlocks: 1,
            semanticComplete: false,
        });
        expect(state.stateAt(1)).toBeNull();
    });

    it('uses canonical serialization after a final segment becomes complete', () => {
        const state = new JSONState(makeMuya(), 'before');

        state.dispatch(json1.editOp([0, 'text'], 'text-unicode', [6, ' after']), 'test');

        expect(state.getMarkdown()).toBe('before after\n');
    });

    it.each([
        ['fenced code', '```ts\nconst value = 1;\n```\n\nafter\n', [0, 'text'], 'const value = 2;', '```ts\nconst value = 2;\n```\n\nafter\n'],
        ['list', '- first\n- second\n\nafter\n', [0, 'children', 0, 'children', 0, 'text'], 'changed', '- changed\n- second\n\nafter\n'],
    ] as const)('keeps the source boundary when editing a %s segment', (_name, markdown, path, text, expected) => {
        const state = new JSONState(makeMuya(), markdown);
        const before = state.markdownToState(markdown)[0];
        const oldText = path.slice(1).reduce<unknown>(
            (value, key) => (value as Record<string | number, unknown>)[key],
            before,
        ) as string;

        state.dispatch(json1.editOp([...path], 'text-unicode', [{ d: oldText.length }, text]), 'test');

        expect(state.getMarkdown()).toBe(expected);
    });

    it('updates flat paths when Enter adds a state inside one source segment', () => {
        const state = new JSONState(makeMuya(), 'first\n\nsecond\n\nthird\n');
        const inserted = { name: 'paragraph', text: 'inserted' } as const;

        state.dispatch(json1.insertOp([1], asDoc(inserted)), 'test');

        expect(state.semanticLength).toBe(4);
        expect(state.stateAt(1)).toEqual(inserted);
        expect(state.stateAt(2)).toMatchObject({ text: 'second' });
        expect(state.stateAt(3)).toBeNull();
        expect(state.getMarkdown()).toBe('first\n\ninserted\n\nsecond\n\nthird\n');
        expect(state.getSegmentTree()?.locationAtStateIndex(2)).toMatchObject({ segmentIndex: 1 });
    });

    it('round-trips a source-backed edit through undo and redo operations', () => {
        const state = new JSONState(makeMuya(), 'first\n\nsecond\n\nthird\n');
        const edit = json1.editOp([0, 'text'], 'text-unicode', [5, '!'])!;
        const before = state.getStateSnapshot();

        state.dispatch(edit, 'test');
        const undo = json1.type.invertWithDoc(edit, asDoc(before));
        const after = state.getStateSnapshot();
        state.dispatch(undo, 'test');
        expect(state.getMarkdown()).toBe('first\n\nsecond\n\nthird\n');

        const redo = json1.type.invertWithDoc(undo, asDoc(after));
        state.dispatch(redo, 'test');
        expect(state.getMarkdown()).toBe('first!\n\nsecond\n\nthird\n');
        expect(state.isSemanticComplete).toBe(false);
    });

    it('materializes before deleting a whole source segment so undo paths stay valid', () => {
        const state = new JSONState(makeMuya(), 'first\n\nsecond\n');
        const before = state.getStateSnapshot();
        const remove = json1.removeOp([0])!;

        state.dispatch(remove, 'test');

        expect(state.isSourceBacked).toBe(false);
        expect(state.getMarkdown()).toBe('second\n');
        const undo = json1.type.invertWithDoc(remove, asDoc(before));
        state.dispatch(undo, 'test');
        expect(state.getMarkdown()).toBe('first\n\nsecond\n');
    });

    it('reports state-array loads without pretending they were source scanned', () => {
        const state = new JSONState(makeMuya(), [{ name: 'paragraph', text: 'text' }]);

        expect(state.getDocumentLoadMetrics()).toMatchObject({
            inputType: 'state',
            sourceBytes: 0,
            sourceCandidates: 0,
            semanticSlots: 1,
            parsedLogicalBlocks: 1,
        });
        expect(state.getSourceIndex()).toBeNull();
        expect(state.getSegmentTree()).toBeNull();
    });
});
