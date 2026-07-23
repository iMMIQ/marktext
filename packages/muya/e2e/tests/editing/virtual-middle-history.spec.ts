import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/muya';

const PARAGRAPH_COUNT = 5_000;
const EDIT_MARKER = 'MIDEDIT2026';

async function readState(page: Page) {
    return page.evaluate((marker) => {
        const muya = window.muya!;
        muya.flush();
        const markdown = muya.getMarkdown();
        const selection = muya.editor.selection.getSelection();
        const virtualization = muya.editor.scrollPage!.getVirtualizationStats();
        return {
            logicalBlocks: virtualization.logicalBlocks,
            mountedBlocks: virtualization.mountedBlocks,
            markerOffset: markdown.indexOf(marker),
            markerPrefixOffset: markdown.indexOf(marker.slice(0, -1)),
            markdownLength: markdown.length,
            sourceBacked: muya.editor.jsonState.getSourceIndex() !== null,
            semanticComplete: muya.editor.jsonState.isSemanticComplete,
            selectionConnected: selection?.anchor.block?.domNode?.isConnected ?? false,
        };
    }, EDIT_MARKER);
}

test('editing a virtualized middle block survives undo, redo, deletion, and Enter', async ({ page }) => {
    const markdown = Array.from(
        { length: PARAGRAPH_COUNT },
        (_, index) => `paragraph ${String(index).padStart(5, '0')} with deterministic editable content`,
    ).join('\n\n');
    await page.evaluate(content => window.muya!.setContent(content), markdown);

    const target = await page.evaluate(() => {
        const muya = window.muya!;
        const scrollPage = muya.editor.scrollPage!;
        const block = scrollPage.ensureProgressVisible(0.5);
        const content = block?.firstContentInDescendant();
        if (!block?.domNode || !content)
            throw new Error('Unable to mount the middle editable block');
        block.domNode.scrollIntoView({ block: 'center' });
        content.setCursor(content.text.length, content.text.length, true);
        content.domNode!.focus({ preventScroll: true });
        muya.editor.history.cutoff();
        return {
            index: scrollPage.offset(block),
            logicalBlocks: scrollPage.getVirtualizationStats().logicalBlocks,
        };
    });
    expect(target.index).toBeGreaterThan(PARAGRAPH_COUNT * 0.45);
    expect(target.index).toBeLessThan(PARAGRAPH_COUNT * 0.55);

    await page.keyboard.insertText(EDIT_MARKER);
    await expect.poll(async () => (await readState(page)).markerOffset).toBeGreaterThan(0);
    const inserted = await readState(page);
    expect(inserted.markerOffset / inserted.markdownLength).toBeGreaterThan(0.45);
    expect(inserted.markerOffset / inserted.markdownLength).toBeLessThan(0.55);
    expect(inserted).toMatchObject({
        logicalBlocks: target.logicalBlocks,
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });

    await page.evaluate(() => window.muya!.undo());
    await expect.poll(async () => (await readState(page)).markerOffset).toBe(-1);
    expect(await readState(page)).toMatchObject({
        logicalBlocks: target.logicalBlocks,
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });

    await page.evaluate(() => window.muya!.redo());
    await expect.poll(async () => (await readState(page)).markerOffset).toBeGreaterThan(0);

    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Backspace');
    await expect.poll(async () => (await readState(page)).markerOffset).toBe(-1);
    expect((await readState(page)).markerPrefixOffset).toBeGreaterThan(0);

    await page.evaluate(() => window.muya!.undo());
    await expect.poll(async () => (await readState(page)).markerOffset).toBeGreaterThan(0);

    await page.evaluate(() => window.muya!.editor.history.cutoff());
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await readState(page)).logicalBlocks).toBe(target.logicalBlocks + 1);
    expect(await readState(page)).toMatchObject({
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });

    await page.evaluate(() => window.muya!.undo());
    await expect.poll(async () => (await readState(page)).logicalBlocks).toBe(target.logicalBlocks);
    await page.evaluate(() => window.muya!.redo());
    await expect.poll(async () => (await readState(page)).logicalBlocks).toBe(target.logicalBlocks + 1);
    expect((await readState(page)).markerOffset).toBeGreaterThan(0);
});
