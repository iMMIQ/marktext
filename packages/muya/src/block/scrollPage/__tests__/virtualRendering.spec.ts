// @vitest-environment happy-dom

import type { TState } from '../../../state/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Muya } from '../../../muya';

const hosts: HTMLElement[] = [];

afterEach(() => {
    while (hosts.length)
        hosts.pop()!.remove();
});

function boot(states: TState[]) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new Muya(host, { json: states });
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
});
