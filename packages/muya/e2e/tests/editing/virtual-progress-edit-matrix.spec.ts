import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/muya';

const GROUP_COUNT = 600;
const PROGRESS_POINTS = [0.02, 0.25, 0.5, 0.75, 0.98];

function buildMarkdown() {
    return Array.from({ length: GROUP_COUNT }, (_, index) => [
        `# Matrix heading ${String(index).padStart(4, '0')}`,
        `paragraph ${index} with deterministic editable content`,
        `- first item ${index}\n- second item ${index}`,
        `> quoted content ${index}`,
        `\`\`\`ts\nconst matrix${index} = ${index};\n\`\`\``,
    ].join('\n\n')).join('\n\n');
}

async function mountAtProgress(page: Page, progress: number) {
    return page.evaluate((targetProgress) => {
        const muya = window.muya!;
        const scrollPage = muya.editor.scrollPage!;
        const block = scrollPage.ensureProgressVisible(targetProgress);
        const content = block?.firstContentInDescendant();
        if (!block?.domNode || !content?.domNode)
            throw new Error(`Unable to mount editable content at progress ${targetProgress}.`);
        block.domNode.scrollIntoView({ block: 'center' });
        content.setCursor(content.text.length, content.text.length, true);
        content.domNode.focus({ preventScroll: true });
        muya.editor.history.cutoff();
        return {
            index: scrollPage.offset(block),
            logicalBlocks: scrollPage.getVirtualizationStats().logicalBlocks,
            totalHeight: scrollPage.getVirtualizationStats().totalHeight,
        };
    }, progress);
}

async function readEditorState(page: Page, marker: string) {
    return page.evaluate((expectedMarker) => {
        const muya = window.muya!;
        muya.flush();
        const markdown = muya.getMarkdown();
        const selection = muya.editor.selection.getSelection();
        const virtualization = muya.editor.scrollPage!.getVirtualizationStats();
        return {
            hasMarker: markdown.includes(expectedMarker),
            hasMarkerPrefix: markdown.includes(expectedMarker.slice(0, -1)),
            sourceBacked: muya.editor.jsonState.getSourceIndex() !== null,
            selectionConnected: selection?.anchor.block?.domNode?.isConnected ?? false,
            logicalBlocks: virtualization.logicalBlocks,
            mountedBlocks: virtualization.mountedBlocks,
        };
    }, marker);
}

async function placeCursorAfterMarker(page: Page, blockIndex: number, marker: string) {
    await page.evaluate(({ index, expectedMarker }) => {
        const block = window.muya!.editor.scrollPage!.find(index);
        const content = block?.firstContentInDescendant();
        const markerOffset = content?.text.indexOf(expectedMarker) ?? -1;
        if (!content?.domNode || markerOffset < 0)
            throw new Error(`Unable to restore the marker selection in block ${index}.`);
        const cursorOffset = markerOffset + expectedMarker.length;
        content.setCursor(cursorOffset, cursorOffset, true);
        content.domNode.focus({ preventScroll: true });
    }, { index: blockIndex, expectedMarker: marker });
}

test('virtualized edits remain correct across document progress points', async ({ page }) => {
    const markdown = buildMarkdown();
    await page.evaluate(content => window.muya!.setContent(content), markdown);
    const markers: string[] = [];
    let previousTargetIndex = -1;

    for (let point = 0; point < PROGRESS_POINTS.length; point++) {
        const marker = `MATRIX_EDIT_${point}_END`;
        markers.push(marker);
        const target = await mountAtProgress(page, PROGRESS_POINTS[point]);
        expect(Number.isFinite(target.totalHeight), JSON.stringify(target)).toBe(true);
        expect(target.totalHeight).toBeGreaterThan(0);
        expect(target.index).toBeGreaterThan(previousTargetIndex);
        expect(target.index / target.logicalBlocks).toBeGreaterThan(PROGRESS_POINTS[point] - 0.08);
        expect(target.index / target.logicalBlocks).toBeLessThan(PROGRESS_POINTS[point] + 0.08);
        previousTargetIndex = target.index;

        await page.keyboard.insertText(marker);
        await expect.poll(async () => (await readEditorState(page, marker)).hasMarker).toBe(true);
        expect(await readEditorState(page, marker)).toMatchObject({
            sourceBacked: true,
            selectionConnected: true,
            logicalBlocks: target.logicalBlocks,
        });

        await page.evaluate(() => window.muya!.undo());
        await expect.poll(async () => (await readEditorState(page, marker)).hasMarker).toBe(false);
        await page.evaluate(() => window.muya!.redo());
        await expect.poll(async () => (await readEditorState(page, marker)).hasMarker).toBe(true);

        await placeCursorAfterMarker(page, target.index, marker);
        await page.keyboard.press('Backspace');
        await expect.poll(async () => (await readEditorState(page, marker)).hasMarker).toBe(false);
        expect((await readEditorState(page, marker)).hasMarkerPrefix).toBe(true);
        await page.evaluate(() => window.muya!.undo());
        await expect.poll(async () => (await readEditorState(page, marker)).hasMarker).toBe(true);

        const state = await readEditorState(page, marker);
        expect(state.sourceBacked).toBe(true);
        expect(state.selectionConnected).toBe(true);
        expect(state.mountedBlocks).toBeLessThan(state.logicalBlocks);
    }

    const final = await page.evaluate(expectedMarkers => ({
        markdown: window.muya!.getMarkdown(),
        virtualization: window.muya!.editor.scrollPage!.getVirtualizationStats(),
        expectedMarkers,
    }), markers);
    for (const marker of final.expectedMarkers)
        expect(final.markdown).toContain(marker);
    expect(final.virtualization.mountedBlocks).toBeLessThan(final.virtualization.logicalBlocks);
});
