// @vitest-environment happy-dom

import type { TState } from '../../state/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Muya } from '../../muya';

const hosts: HTMLElement[] = [];
let originalVersion: string | undefined;
let hadVersion = false;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (hosts.length)
        hosts.pop()!.remove();
    document.getSelection()?.removeAllRanges();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function boot(content: TState[] | string) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, typeof content === 'string'
        ? { markdown: content }
        : { json: content });
    Object.defineProperty(muya.domNode, 'clientHeight', { configurable: true, value: 240 });
    Object.defineProperty(muya.domNode, 'clientWidth', { configurable: true, value: 800 });
    muya.domNode.style.overflowY = 'auto';
    muya.domNode.getBoundingClientRect = () => new DOMRect(0, 0, 800, 240);
    muya.init();
    const page = muya.editor.scrollPage!;
    page.domNode!.getBoundingClientRect = () => new DOMRect(
        0,
        -muya.domNode.scrollTop,
        800,
        page.getVirtualizationStats().totalHeight,
    );
    hosts.push(muya.domNode);
    return { muya, page, search: muya.editor.searchModule };
}

describe('virtualized whole-document search', () => {
    it('finds beginning, middle, and end matches without mounting the document', () => {
        const states: TState[] = Array.from({ length: 1_000 }, (_, index) => ({
            name: 'paragraph',
            text: [0, 500, 999].includes(index) ? `needle ${index}` : `paragraph ${index}`,
        }));
        const { page, search } = boot(states);
        const mountedBefore = page.getVirtualizationStats().mountedBlocks;

        search.search('needle');

        expect(search.matches.map(match => match.path)).toEqual([
            [0, 'text'],
            [500, 'text'],
            [999, 'text'],
        ]);
        expect(page.getVirtualizationStats().mountedBlocks).toBe(mountedBefore);
        expect(page.getVirtualizationStats().mountedBlocks).toBeLessThan(50);
    });

    it('mounts only a distant find target and restores its highlights', () => {
        const states: TState[] = Array.from({ length: 1_000 }, (_, index) => ({
            name: 'paragraph',
            text: [0, 500, 999].includes(index) ? `needle ${index}` : `paragraph ${index}`,
        }));
        const { page, search } = boot(states);
        search.search('needle');

        search.find('next');

        const stats = page.getVirtualizationStats();
        expect(search.index).toBe(1);
        expect(stats.mountedIndexes).toContain(500);
        expect(stats.mountedBlocks).toBeLessThan(50);
        const target = page.queryMountedBlock([500, 'text']);
        expect(target?.domNode?.querySelector('.mu-highlight')).not.toBeNull();

        page.queryBlock([999, 'text']);
        const last = page.queryMountedBlock([999, 'text']);
        expect(last?.domNode?.querySelector('.mu-selection')).not.toBeNull();
        expect(page.getVirtualizationStats().mountedBlocks).toBeLessThan(50);
    });

    it('applies case-sensitive and whole-word options to unmounted text', () => {
        const states: TState[] = Array.from({ length: 1_000 }, (_, index) => ({
            name: 'paragraph',
            text: index === 900 ? 'Needle needle hayneedle' : `paragraph ${index}`,
        }));
        const { page, search } = boot(states);

        search.search('needle', { isCaseSensitive: true, isWholeWord: true });

        expect(search.matches).toHaveLength(1);
        expect(search.matches[0]).toMatchObject({ path: [900, 'text'], start: 7 });
        expect(page.queryMountedBlock([900, 'text'])).toBeUndefined();
        expect(page.getVirtualizationStats().mountedBlocks).toBeLessThan(50);
    });

    it('preserves document order and paths through nested lists and tables', () => {
        const states: TState[] = [
            {
                name: 'bullet-list',
                meta: { marker: '-', loose: false },
                children: [{
                    name: 'list-item',
                    children: [{ name: 'paragraph', text: 'needle list' }],
                }],
            },
            {
                name: 'table',
                children: [{
                    name: 'table.row',
                    children: [
                        { name: 'table.cell', meta: { align: 'none' }, text: 'needle cell' },
                    ],
                }],
            },
        ];
        const { search } = boot(states);

        search.search('needle');

        expect(search.matches.map(match => match.path)).toEqual([
            [0, 'children', 0, 'children', 0, 'text'],
            [1, 'children', 0, 'children', 0, 'text'],
        ]);
    });

    it('preserves code language-input search and replacement behavior', () => {
        const { muya, search } = boot('```javascript title="demo"\ncode body\n```\n');

        search.search('javascript');
        expect(search.matches.map(match => match.path)).toEqual([
            [0, 'meta', 'lang'],
        ]);

        search.replace('typescript', { isSingle: true, isRegexp: false });
        expect(muya.getMarkdown()).toContain('```typescript title="demo"');
        expect(muya.getMarkdown()).toContain('code body');
        const codeBlock = muya.editor.scrollPage!.find(0);
        expect(codeBlock && 'lang' in codeBlock ? codeBlock.lang : null)
            .toBe('typescript title="demo"');
    });
});

describe('virtualized whole-document replace', () => {
    it('replaces an unmounted match without mounting unrelated blocks', () => {
        const states: TState[] = Array.from({ length: 1_000 }, (_, index) => ({
            name: 'paragraph',
            text: index === 900 ? 'distant needle' : `paragraph ${index}`,
        }));
        const { muya, page, search } = boot(states);
        search.search('needle');

        search.replace('replacement', { isSingle: true, isRegexp: false });

        expect(muya.getMarkdown()).toContain('distant replacement');
        expect(muya.getMarkdown()).not.toContain('distant needle');
        expect(page.getVirtualizationStats().mountedBlocks).toBeLessThan(50);
    });

    it('keeps replace-all across source segments in one undo boundary', () => {
        const original = Array.from({ length: 300 }, (_, index) => `foo ${index}`).join('\n\n');
        const { muya, page, search } = boot(original);
        const undoBefore = muya.editor.history.getHistory().stack.undo.length;

        search.search('foo');
        search.replace('bar', { isSingle: false, isRegexp: false });

        expect(muya.getMarkdown()).not.toContain('foo');
        expect(muya.getMarkdown().match(/bar/g)).toHaveLength(300);
        expect(muya.editor.jsonState.isSourceBacked).toBe(true);
        expect(page.getVirtualizationStats().mountedBlocks).toBeLessThan(50);
        expect(muya.editor.history.getHistory().stack.undo.length).toBe(undoBefore + 1);

        muya.undo();
        expect(muya.getMarkdown()).toBe(`${original}\n`);
        expect(muya.editor.jsonState.isSourceBacked).toBe(true);

        muya.redo();
        expect(muya.getMarkdown()).not.toContain('foo');
        expect(muya.getMarkdown().match(/bar/g)).toHaveLength(300);
        expect(muya.editor.jsonState.isSourceBacked).toBe(true);
    });

    it('expands regexp capture groups independently for every match', () => {
        const { muya, search } = boot('item-12\n\nitem-34\n');
        search.search('item-(\\d+)', { isRegexp: true });

        search.replace('value-$1', { isSingle: false, isRegexp: true });

        expect(muya.getMarkdown()).toContain('value-12');
        expect(muya.getMarkdown()).toContain('value-34');
    });
});
