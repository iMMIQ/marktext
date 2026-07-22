// @vitest-environment happy-dom

import type { Muya } from '../../muya';
import * as json1 from 'ot-json1';
import { describe, expect, it } from 'vitest';
import JSONState from '../index';

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
    it('builds the source store and source index before the semantic state', () => {
        const markdown = '# Heading\n\nParagraph\n\n```ts\nconst x = 1;\n```\n';
        const state = new JSONState(makeMuya(), markdown);
        const metrics = state.getDocumentLoadMetrics();

        expect(metrics).toMatchObject({
            inputType: 'markdown',
            sourceBytes: markdown.length,
            sourceCandidates: 3,
            parsedLogicalBlocks: 3,
            sourceStoreMs: expect.any(Number),
            sourceIndexMs: expect.any(Number),
            fullParseMs: expect.any(Number),
        });
        expect(state.getSourceIndex()?.sourceForRange(1, 2)).toContain('Paragraph');
    });

    it('invalidates source coordinates after semantic operations', () => {
        const state = new JSONState(makeMuya(), 'before\n');

        state.dispatch(json1.editOp([0, 'text'], 'text-unicode', [6, ' after']), 'test');

        expect(state.getSourceIndex()).toBeNull();
    });

    it('reports state-array loads without pretending they were source scanned', () => {
        const state = new JSONState(makeMuya(), [{ name: 'paragraph', text: 'text' }]);

        expect(state.getDocumentLoadMetrics()).toMatchObject({
            inputType: 'state',
            sourceBytes: 0,
            sourceCandidates: 0,
            parsedLogicalBlocks: 1,
        });
        expect(state.getSourceIndex()).toBeNull();
    });
});
