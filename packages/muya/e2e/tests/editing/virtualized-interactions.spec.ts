import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/muya';

const LARGE_PARAGRAPH_COUNT = 4_000;

function paragraphDocument(count = LARGE_PARAGRAPH_COUNT) {
    return Array.from(
        { length: count },
        (_, index) => `row-${String(index).padStart(4, '0')}-persistent-editable-tail`,
    ).join('\n\n');
}

async function viewportSnapshot(page: Page) {
    return page.evaluate(() => {
        const stats = window.muya!.editor.scrollPage!.getVirtualizationStats();
        const visibleIndexes = [...document.querySelectorAll<HTMLElement>('[data-virtual-index]')]
            .filter((node) => {
                const bounds = node.getBoundingClientRect();
                return bounds.bottom > 0 && bounds.top < window.innerHeight;
            })
            .map(node => Number(node.dataset.virtualIndex))
            .filter(Number.isFinite)
            .sort((a, b) => a - b);
        return {
            scrollY: window.scrollY,
            logicalBlocks: stats.logicalBlocks,
            mountedBlocks: stats.mountedBlocks,
            mountedIndexes: stats.mountedIndexes,
            visibleIndexes,
            pageHeight: document.documentElement.scrollHeight,
            viewportHeight: window.innerHeight,
        };
    });
}

async function attachViewport(page: Page, testInfo: TestInfo, name: string) {
    await testInfo.attach(`${name}.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
    });
}

function trackRendererErrors(page: Page) {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error')
            errors.push(message.text());
    });
    return errors;
}

test.describe('virtualized user interactions', () => {
    test('rapid real-wheel reversals preempt stale viewports without leaving a blank frame', async ({ page }, testInfo) => {
        test.setTimeout(60_000);
        const rendererErrors = trackRendererErrors(page);
        await page.evaluate(content => window.muya!.setContent(content), paragraphDocument());
        await page.locator('.mu-container').hover();
        const initial = await viewportSnapshot(page);
        await attachViewport(page, testInfo, 'virtual-scroll-00-top');

        await page.mouse.wheel(0, 90_000);
        await page.mouse.wheel(0, -35_000);
        await page.mouse.wheel(0, 70_000);
        await expect.poll(async () => (await viewportSnapshot(page)).scrollY).toBeGreaterThan(initial.scrollY);
        await expect.poll(async () => (await viewportSnapshot(page)).visibleIndexes[0] ?? -1)
            .toBeGreaterThan(initial.visibleIndexes[0]);
        const lower = await viewportSnapshot(page);
        await attachViewport(page, testInfo, 'virtual-scroll-01-lower');

        await page.mouse.wheel(0, -80_000);
        await expect.poll(async () => (await viewportSnapshot(page)).scrollY).toBeLessThan(lower.scrollY);
        await expect.poll(async () => (await viewportSnapshot(page)).visibleIndexes[0] ?? Number.MAX_SAFE_INTEGER)
            .toBeLessThan(lower.visibleIndexes[0]);
        const reversed = await viewportSnapshot(page);
        await attachViewport(page, testInfo, 'virtual-scroll-02-reversed');

        await page.mouse.wheel(0, 20_000);
        await expect.poll(async () => (await viewportSnapshot(page)).scrollY).toBeGreaterThan(reversed.scrollY);
        const finalPreemption = await viewportSnapshot(page);

        expect(initial.logicalBlocks).toBe(LARGE_PARAGRAPH_COUNT);
        expect(lower.scrollY).toBeGreaterThan(initial.scrollY);
        expect(lower.visibleIndexes[0]).toBeGreaterThan(initial.visibleIndexes[0]);
        expect(reversed.scrollY).toBeLessThan(lower.scrollY);
        expect(reversed.visibleIndexes[0]).toBeLessThan(lower.visibleIndexes[0]);
        for (const snapshot of [initial, lower, reversed, finalPreemption]) {
            expect(snapshot.pageHeight).toBeGreaterThan(snapshot.viewportHeight);
            expect(snapshot.mountedBlocks).toBeLessThan(100);
            expect(snapshot.visibleIndexes.length).toBeGreaterThan(0);
            expect(snapshot.visibleIndexes.every(index => snapshot.mountedIndexes.includes(index))).toBe(true);
        }
        expect(rendererErrors, `renderer errors: ${rendererErrors.join(' | ')}`).toEqual([]);
    });

    test('a distant cross-block deletion remains invertible across virtual boundaries', async ({ page }) => {
        const rendererErrors = trackRendererErrors(page);
        await page.evaluate(content => window.muya!.setContent(content), paragraphDocument(2_000));
        const selection = await page.evaluate(() => {
            const scrollPage = window.muya!.editor.scrollPage!;
            const firstRoot = scrollPage.ensureProgressVisible(0.5);
            const firstIndex = firstRoot ? scrollPage.offset(firstRoot) : -1;
            const first = firstRoot?.firstContentInDescendant();
            const second = scrollPage.find(firstIndex + 1)?.firstContentInDescendant();
            if (!first?.domNode || !second?.domNode)
                throw new Error('Unable to mount adjacent editable blocks around the middle.');
            const textNode = (node: HTMLElement) => {
                const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
                const text = walker.nextNode();
                if (!(text instanceof Text))
                    throw new Error('Editable block has no text node.');
                return text;
            };
            first.domNode.focus({ preventScroll: true });
            const range = document.createRange();
            range.setStart(textNode(first.domNode), first.text.length - 5);
            range.setEnd(textNode(second.domNode), 5);
            const domSelection = document.getSelection()!;
            domSelection.removeAllRanges();
            domSelection.addRange(range);
            document.dispatchEvent(new Event('selectionchange'));
            return {
                firstIndex,
                firstText: first.text,
                secondText: second.text,
                logicalBlocks: scrollPage.getVirtualizationStats().logicalBlocks,
            };
        });
        const merged = `${selection.firstText.slice(0, -5)}${selection.secondText.slice(5)}`;

        await page.keyboard.press('Backspace');
        await expect.poll(async () => page.evaluate(text => window.muya!.getMarkdown().includes(text), merged)).toBe(true);
        const deleted = await page.evaluate(() => ({
            markdown: window.muya!.getMarkdown(),
            stats: window.muya!.editor.scrollPage!.getVirtualizationStats(),
        }));
        expect(deleted.stats.logicalBlocks).toBe(selection.logicalBlocks - 1);
        expect(deleted.stats.mountedBlocks).toBeLessThan(100);
        expect(deleted.markdown).not.toContain(selection.firstText);
        expect(deleted.markdown).not.toContain(selection.secondText);

        await page.evaluate(() => window.muya!.undo());
        await expect.poll(async () => page.evaluate(text => window.muya!.getMarkdown().includes(text), selection.firstText)).toBe(true);
        expect(await page.evaluate(() => window.muya!.getMarkdown())).toContain(selection.secondText);
        expect(await page.evaluate(() => window.muya!.editor.scrollPage!.getVirtualizationStats().logicalBlocks))
            .toBe(selection.logicalBlocks);

        await page.evaluate(() => window.muya!.redo());
        await expect.poll(async () => page.evaluate(text => window.muya!.getMarkdown().includes(text), merged)).toBe(true);
        expect(await page.evaluate(() => window.muya!.editor.scrollPage!.getVirtualizationStats().logicalBlocks))
            .toBe(selection.logicalBlocks - 1);
        expect(rendererErrors, `renderer errors: ${rendererErrors.join(' | ')}`).toEqual([]);
    });

    test('CJK composition commits and round-trips in a distant lazily parsed block', async ({ browserName, page }) => {
        test.skip(browserName === 'webkit', 'Synthetic IME is unreliable on WebKit.');
        const rendererErrors = trackRendererErrors(page);
        const marker = '远端输入';
        await page.evaluate(content => window.muya!.setContent(content), paragraphDocument(3_000));
        const target = await page.evaluate(() => {
            const muya = window.muya!;
            const scrollPage = muya.editor.scrollPage!;
            const root = scrollPage.ensureProgressVisible(0.75);
            const content = root?.firstContentInDescendant();
            if (!root?.domNode || !content?.domNode)
                throw new Error('Unable to mount a distant editable block.');
            root.domNode.scrollIntoView({ block: 'center' });
            content.setCursor(content.text.length, content.text.length, true);
            content.domNode.focus({ preventScroll: true });
            muya.editor.history.cutoff();
            return {
                index: scrollPage.offset(root),
                original: content.text,
                logicalBlocks: scrollPage.getVirtualizationStats().logicalBlocks,
            };
        });

        const midComposition = await page.evaluate(() => {
            const block = window.muya!.editor.activeContentBlock!;
            const node = block.domNode as HTMLElement;
            const original = block.text;
            node.dispatchEvent(new CompositionEvent('compositionstart', {
                bubbles: true,
                cancelable: true,
                data: '',
            }));
            node.textContent = `${original}yuanduan`;
            node.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: 'yuanduan',
                inputType: 'insertCompositionText',
                isComposing: true,
            }));
            return {
                isComposed: (block as unknown as { isComposed: boolean }).isComposed,
                text: block.text,
            };
        });
        expect(midComposition).toEqual({ isComposed: true, text: target.original });

        await page.evaluate((committed) => {
            const block = window.muya!.editor.activeContentBlock!;
            const node = block.domNode as HTMLElement;
            const finalText = `${block.text}${committed}`;
            node.replaceChildren(document.createTextNode(finalText));
            const range = document.createRange();
            range.selectNodeContents(node);
            range.collapse(false);
            const selection = document.getSelection()!;
            selection.removeAllRanges();
            selection.addRange(range);
            node.dispatchEvent(new CompositionEvent('compositionend', {
                bubbles: true,
                cancelable: true,
                data: committed,
            }));
            node.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: true,
                data: committed,
                inputType: 'insertCompositionText',
                isComposing: false,
            }));
        }, marker);

        await expect.poll(async () => page.evaluate(text => window.muya!.getMarkdown().includes(text), marker)).toBe(true);
        const committed = await page.evaluate(() => {
            const muya = window.muya!;
            const selection = muya.editor.selection.getSelection();
            return {
                sourceBacked: muya.editor.jsonState.isSourceBacked,
                semanticComplete: muya.editor.jsonState.isSemanticComplete,
                selectionConnected: selection?.anchor.block.domNode?.isConnected ?? false,
                stats: muya.editor.scrollPage!.getVirtualizationStats(),
            };
        });
        expect(target.index / target.logicalBlocks).toBeGreaterThan(0.68);
        expect(target.index / target.logicalBlocks).toBeLessThan(0.82);
        expect(committed).toMatchObject({
            sourceBacked: true,
            semanticComplete: false,
            selectionConnected: true,
        });
        expect(committed.stats.mountedBlocks).toBeLessThan(100);

        await page.evaluate(() => window.muya!.undo());
        await expect.poll(async () => page.evaluate(text => window.muya!.getMarkdown().includes(text), marker)).toBe(false);
        await page.evaluate(() => window.muya!.redo());
        await expect.poll(async () => page.evaluate(text => window.muya!.getMarkdown().includes(text), marker)).toBe(true);
        expect(rendererErrors, `renderer errors: ${rendererErrors.join(' | ')}`).toEqual([]);
    });
});
