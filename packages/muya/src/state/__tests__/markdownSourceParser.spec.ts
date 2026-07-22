import type { IMarkdownToStateOptions } from '../markdownToState';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import gfmExamples from '../../../test/spec/fixtures/gfm-spec-0.29-gfm.json';
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

const fixturesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'test',
    'spec',
    'fixtures',
    'marktext-round-trip',
);

const fixtureFiles = [
    'common/BasicTextFormatting.md',
    'common/Blockquotes.md',
    'common/CodeBlocks.md',
    'common/Escapes.md',
    'common/Headings.md',
    'common/Images.md',
    'common/Links.md',
    'common/Lists.md',
    'gfm/BasicTextFormatting.md',
    'gfm/Lists.md',
    'gfm/Tables.md',
];

function parseBoth(markdown: string, options = OPTIONS) {
    const full = new MarkdownToState(options).generate(markdown);
    const index = MarkdownSourceIndex.fromText(markdown, {
        frontMatter: options.frontMatter,
        footnote: options.footnote,
        math: options.math,
    });
    const segmented = new MarkdownSourceParser(options).parseRange(index).states;
    return { full, index, segmented };
}

describe('markdownSourceParser', () => {
    it('matches whole-document parsing for all 672 GFM examples', () => {
        const failures: Array<{ number: number; section: string }> = [];
        const unsafeHints: Array<{ number: number; candidate: number }> = [];
        for (const example of gfmExamples) {
            const { full, index, segmented } = parseBoth(example.markdown);
            if (JSON.stringify(segmented) !== JSON.stringify(full))
                failures.push({ number: example.number, section: example.section });
            const parser = new MarkdownSourceParser(OPTIONS);
            for (let candidate = 0; candidate < index.length; candidate++) {
                if (
                    index.stateCountHintAt(candidate) === 1
                    && parser.parseSegmentStates(index, candidate).length !== 1
                ) {
                    unsafeHints.push({ number: example.number, candidate });
                }
            }
        }
        expect(failures).toEqual([]);
        expect(unsafeHints).toEqual([]);
    });

    it('matches whole-document parsing for MarkText round-trip fixtures', () => {
        const failures: string[] = [];
        const unsafeHints: Array<{ file: string; candidate: number }> = [];
        for (const file of fixtureFiles) {
            const markdown = fs.readFileSync(path.join(fixturesDir, file), 'utf8');
            const { full, index, segmented } = parseBoth(markdown);
            if (JSON.stringify(segmented) !== JSON.stringify(full))
                failures.push(file);
            const parser = new MarkdownSourceParser(OPTIONS);
            for (let candidate = 0; candidate < index.length; candidate++) {
                if (
                    index.stateCountHintAt(candidate) === 1
                    && parser.parseSegmentStates(index, candidate).length !== 1
                ) {
                    unsafeHints.push({ file, candidate });
                }
            }
        }
        expect(failures).toEqual([]);
        expect(unsafeHints).toEqual([]);
    });

    it('preserves frontmatter and multi-block footnotes', () => {
        const markdown = [
            '---',
            'title: Example',
            '---',
            '',
            'text[^n]',
            '',
            '[^n]: intro',
            '',
            '    - item a',
            '    - item b',
            '',
        ].join('\n');
        const options = { ...OPTIONS, frontMatter: true, footnote: true };
        const { full, segmented } = parseBoth(markdown, options);

        expect(segmented).toEqual(full);
        expect(segmented.map(state => state.name)).toEqual(['frontmatter', 'paragraph', 'footnote']);
    });

    it('tags parsed ranges with immutable source revisions', () => {
        const index = MarkdownSourceIndex.fromText('# one\n\ntwo\n');
        const parsed = new MarkdownSourceParser(OPTIONS).parseRange(index, 1, 2);

        expect(parsed).toMatchObject({ revision: index.revision, start: 1, end: 2 });
        expect(parsed.segments[0]).toMatchObject({
            revision: index.revision,
            candidateIndex: 1,
            states: [{ name: 'paragraph', text: 'two' }],
        });
        expect(() => new MarkdownSourceParser(OPTIONS).parseRange(index, -1, 2)).toThrow(/Invalid source candidate range/);
    });

    it('maps variable state counts through stable source segments', () => {
        const markdown = '---\nFoo\n---\nBar\n---\nBaz\n';
        const full = new MarkdownToState(OPTIONS).generate(markdown);
        // The scanner conservatively keeps the opening region together while
        // the semantic parser interprets it with frontmatter disabled.
        const index = MarkdownSourceIndex.fromText(markdown);
        const segments = new MarkdownSourceParser(OPTIONS).parseAll(index);

        expect(segments.requireCompleteStateSnapshot()).toEqual(full);
        expect(segments.statesForSegment(0)?.map(state => state.name)).toEqual([
            'thematic-break',
            'setext-heading',
        ]);
        expect(segments.stateRangeForSegment(0)).toEqual({ start: 0, end: 2 });
        expect(segments.locationAtStateIndex(1)).toEqual({
            segmentIndex: 0,
            localStateIndex: 1,
        });
    });
});
