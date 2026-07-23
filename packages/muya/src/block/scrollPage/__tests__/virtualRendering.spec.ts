// @vitest-environment happy-dom

import type { TState } from '../../../state/types';
import * as json1 from 'ot-json1';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';

const hosts: HTMLElement[] = [];

afterEach(() => {
    while (hosts.length)
        hosts.pop()!.remove();
    vi.unstubAllGlobals();
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
    return { muya, page };
}

describe('scrollPage virtual rendering', () => {
    it('uses the indexed viewport path for a tiny document', () => {
        const { page } = boot([{ name: 'paragraph', text: 'small' }]);

        expect(page.getVirtualizationStats()).toMatchObject({
            logicalBlocks: 1,
            mountedBlocks: 1,
            firstMountedIndex: 0,
            lastMountedIndex: 0,
        });
        expect(page.queryProgressRange(0, 1)).toMatchObject({ start: 0, end: 1 });
    });

    it.each([1, 1_000])('uses the same indexed blank-area interaction for %i logical blocks', (count) => {
        const states: TState[] = Array.from({ length: count }, (_, index) => ({
            name: 'paragraph',
            text: `paragraph ${index}`,
        }));
        const { muya, page } = boot(states);

        const event = new MouseEvent('click', { bubbles: true });
        Object.defineProperty(event, 'clientY', { value: 1_000 });
        Object.defineProperty(event, 'x', { value: 0 });
        page.domNode!.dispatchEvent(event);
        muya.flush();

        expect(page.length()).toBe(count + 1);
        expect(page.lastContentInDescendant()?.text).toBe('');
    });

    it('keeps a bounded DOM and preempts rendering for a distant viewport', async () => {
        const states: TState[] = Array.from({ length: 1_000 }, (_, index) => ({
            name: 'paragraph',
            text: `paragraph ${index}`,
        }));
        const { muya, page } = boot(states);
        const initial = page.getVirtualizationStats();

        expect(initial.logicalBlocks).toBe(1_000);
        expect(initial.mountedBlocks).toBeLessThan(50);
        expect(page.queryProgressRange(0.5, 0.51).start).toBeGreaterThan(400);

        muya.domNode.scrollTop = initial.totalHeight * 0.75;
        muya.domNode.dispatchEvent(new Event('scroll'));

        await vi.waitFor(() => {
            const current = page.getVirtualizationStats();
            expect(current.lastMountedIndex).toBeGreaterThan(650);
            expect(current.mountedBlocks).toBeLessThan(80);
        });

        expect(page.firstContentInDescendant()).not.toBeNull();
        expect(page.getVirtualizationStats().firstMountedIndex).toBe(0);
    });

    it('invalidates idle semantic work when setContent replaces the document', () => {
        const callbacks = new Map<number, IdleRequestCallback>();
        const cancelled: number[] = [];
        let nextId = 1;
        vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
            const id = nextId++;
            callbacks.set(id, callback);
            return id;
        });
        vi.stubGlobal('cancelIdleCallback', (id: number) => {
            cancelled.push(id);
            callbacks.delete(id);
        });
        const markdown = Array.from({ length: 100 }, (_, index) => `old ${index}`).join('\n\n');
        const { muya } = boot(markdown);
        const staleCallbacks = [...callbacks.values()];

        muya.editor.setContent('replacement\n');
        for (const callback of staleCallbacks) {
            callback({
                didTimeout: false,
                timeRemaining: () => 50,
            });
        }

        expect(cancelled.length).toBeGreaterThan(0);
        expect(muya.editor.jsonState.getMarkdown()).toBe('replacement\n');
        expect(muya.editor.jsonState.semanticLength).toBe(1);
    });

    it('preempts semantic parsing for a distant viewport and keeps it editable', () => {
        vi.stubGlobal('requestIdleCallback', () => 1);
        vi.stubGlobal('cancelIdleCallback', () => {});
        const markdown = Array.from({ length: 1_000 }, (_, index) => `paragraph ${index}`).join('\n\n');
        const { muya, page } = boot(markdown);

        const distant = page.queryProgressRange(0.8, 0.81);
        const state = distant.states[0];
        expect(state).toMatchObject({ name: 'paragraph' });
        if (!state || !('text' in state))
            throw new Error('Expected a parsed paragraph in the distant viewport.');

        muya.editor.jsonState.dispatch(
            // Appending does not depend on UTF-16/code-point differences.
            json1.editOp(
                [distant.start, 'text'],
                'text-unicode',
                [state.text.length, '!'],
            ),
            'test',
        );

        expect(muya.editor.jsonState.stateAt(distant.start)).toMatchObject({ text: `${state.text}!` });
        expect(muya.editor.jsonState.getMarkdown()).toContain(`${state.text}!`);
        expect(muya.editor.jsonState.isSemanticComplete).toBe(false);
    });

    it('preserves a mounted virtual-block selection across sparse DOM rebuilds', () => {
        const states: TState[] = Array.from({ length: 100 }, (_, index) => ({
            name: 'paragraph',
            text: `paragraph ${index}`,
        }));
        const { muya, page } = boot(states);
        const block = page.ensureProgressVisible(0.5)?.firstContentInDescendant();
        if (!block)
            throw new Error('Expected the middle virtual block to be mounted.');
        const offset = block.text.length;
        const selection = {
            anchor: { block, offset, path: block.path },
            focus: { block, offset, path: block.path },
            isCollapsed: true,
            isSelectionInSameBlock: true,
        } as NonNullable<ReturnType<typeof muya.editor.selection.getSelection>>;
        vi.spyOn(muya.editor.selection, 'getSelection').mockReturnValue(selection);
        const restoreSelection = vi
            .spyOn(muya.editor.selection, 'setSelection')
            .mockImplementation(() => {});

        (page as unknown as { _rebuildSparseDom: () => void })._rebuildSparseDom();

        expect(restoreSelection).toHaveBeenCalledWith(selection.anchor, selection.focus);
    });
});
