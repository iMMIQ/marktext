import type { TState } from '../../../state/types';
import { describe, expect, it } from 'vitest';
import { MarkdownSourceIndex } from '../../../state/markdownSourceIndex';
import { MarkdownSourceParser } from '../../../state/markdownSourceParser';
import { LayoutIndex } from '../layoutIndex';

const metrics = {
    contentWidth: 400,
    fontSize: 16,
    lineHeight: 1.5,
    codeFontSize: 14,
    wrapCodeBlocks: true,
    tabSize: 4,
};

describe('layoutIndex', () => {
    it('maps offsets, progress, and viewports to block ranges', () => {
        const states: TState[] = Array.from({ length: 10 }, (_, index) => ({
            name: 'paragraph',
            text: `paragraph ${index}`,
        }));
        const index = new LayoutIndex();
        index.rebuild(states, metrics, 7);

        expect(index.revision).toBe(7);
        expect(index.indexAtOffset(0)).toBe(0);
        expect(index.indexAtProgress(1)).toBe(9);
        const viewport = index.rangeForViewport(index.topAt(4), index.heightAt(4), 0);
        expect(viewport.start).toBe(4);
        expect(viewport.end).toBeGreaterThanOrEqual(5);
    });

    it('updates all following offsets after a measured height correction', () => {
        const states: TState[] = [
            { name: 'paragraph', text: 'a' },
            { name: 'paragraph', text: 'b' },
            { name: 'paragraph', text: 'c' },
        ];
        const index = new LayoutIndex();
        index.rebuild(states, metrics);
        const previousTop = index.topAt(2);
        const previousHeight = index.heightAt(1);

        const delta = index.updateMeasuredHeight(1, previousHeight + 50);

        expect(delta).toBe(50);
        expect(index.topAt(2)).toBeCloseTo(previousTop + 50);
    });

    it('accounts for wrapping and block-specific layout', () => {
        const states: TState[] = [
            { name: 'paragraph', text: 'short' },
            { name: 'paragraph', text: 'long '.repeat(100) },
            { name: 'diagram', meta: { lang: 'yaml', type: 'mermaid' }, text: 'graph TD\nA-->B' },
        ];
        const index = new LayoutIndex();
        index.rebuild(states, metrics);

        expect(index.heightAt(1)).toBeGreaterThan(index.heightAt(0));
        expect(index.heightAt(2)).toBeGreaterThanOrEqual(240);
    });

    it('uses one path for tiny documents and naturally returns the whole range', () => {
        const index = new LayoutIndex();
        index.rebuild([{ name: 'paragraph', text: 'tiny' }], metrics);

        expect(index.rangeForViewport(0, 800, 800)).toEqual({
            start: 0,
            end: 1,
            top: 0,
            bottom: index.totalHeight,
        });
    });

    it('keeps large layout storage compact and materializes records on demand', () => {
        const states: TState[] = Array.from({ length: 2_500 }, (_, index) => ({
            name: 'paragraph',
            text: `paragraph ${index}`,
        }));
        const index = new LayoutIndex();
        index.rebuild(states, metrics, 9);

        expect(index.storageBytes).toBeLessThan(states.length * 25 + 16);
        expect(index.recordAt(1_024)).toMatchObject({
            id: 1_024,
            stateIndex: 1_024,
            measuredHeight: null,
            revision: 9,
        });
    });

    it('builds a full semantic layout before ordinary segments are parsed', () => {
        const markdown = Array.from({ length: 100 }, (_, index) => `paragraph ${index}`).join('\n\n');
        const source = MarkdownSourceIndex.fromText(markdown);
        const parser = new MarkdownSourceParser({
            footnote: false,
            math: true,
            isGitlabCompatibilityEnabled: true,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: true,
        });
        const session = parser.createSession(source);
        const index = new LayoutIndex();

        expect(session.resolveStateCounts()).toBe(0);
        expect(session.segments.parsedSegments).toBe(0);
        index.rebuildFromSegments(session.segments, metrics, 11);

        expect(index.length).toBe(100);
        expect(index.totalHeight).toBeCloseTo(source.totalHeight);
        expect(index.indexAtProgress(1)).toBe(99);
        expect(index.recordAt(50)).toMatchObject({ stateIndex: 50, revision: 11 });
    });
});
