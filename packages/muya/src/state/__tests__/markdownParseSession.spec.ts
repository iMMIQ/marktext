import type { IMarkdownToStateOptions } from '../markdownToState';
import { describe, expect, it } from 'vitest';
import { MarkdownParsePriority, MarkdownParseSession } from '../markdownParseSession';
import { MarkdownSourceIndex } from '../markdownSourceIndex';
import { MarkdownSourceParser } from '../markdownSourceParser';
import { MarkdownToState } from '../markdownToState';

const OPTIONS: IMarkdownToStateOptions = {
    footnote: false,
    math: true,
    isGitlabCompatibilityEnabled: true,
    trimUnnecessaryCodeBlockEmptyLines: false,
    frontMatter: false,
};

function createSession(blocks = 20) {
    const markdown = Array.from({ length: blocks }, (_, index) => `paragraph ${index}`).join('\n\n');
    const sourceIndex = MarkdownSourceIndex.fromText(markdown, { frontMatter: false });
    const parser = new MarkdownSourceParser(OPTIONS);
    const session = new MarkdownParseSession(
        sourceIndex,
        candidateIndex => parser.parseSegmentStates(sourceIndex, candidateIndex),
    );
    return { markdown, session };
}

describe('markdownParseSession', () => {
    it('starts sequentially and completes with the authoritative parser state', () => {
        const { markdown, session } = createSession();

        const first = session.parseNext(3);

        expect(first.task).toMatchObject({
            start: 0,
            end: 3,
            priority: MarkdownParsePriority.Sequential,
        });
        expect(session.segments.completePrefix).toBe(3);
        expect(session.parseAll()).toEqual(new MarkdownToState(OPTIONS).generate(markdown));
    });

    it('preempts background work for a viewport and then resumes the prefix', () => {
        const { session } = createSession(100);
        session.parseNext(2);

        const range = session.prioritizeProgress(0.8, 0.9);
        const viewport = session.parseNext(4);

        expect(viewport.task).toMatchObject({
            start: range.start,
            priority: MarkdownParsePriority.Viewport,
        });
        expect(session.segments.completePrefix).toBe(2);
        expect(session.segments.isParsed(range.start)).toBe(true);

        const state = session.parseAll();
        expect(state).toHaveLength(100);
        expect(session.segments.completePrefix).toBe(100);
        expect(session.hasPendingTasks).toBe(false);
    });

    it('parses a backward viewport from its visible end', () => {
        const { session } = createSession(10);
        session.prioritizeViewport(5, 9, -1);

        const batch = session.parseNext(2);

        expect(batch.task).toMatchObject({ start: 7, end: 9, direction: -1 });
        expect(session.segments.isParsed(8)).toBe(true);
        expect(session.segments.isParsed(7)).toBe(true);
        expect(session.segments.isParsed(6)).toBe(false);
    });
});
