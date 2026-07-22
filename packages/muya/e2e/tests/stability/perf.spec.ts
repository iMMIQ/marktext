import { expect, test } from '../fixtures/muya';
import { virtualBlock, virtualBlocks } from '../helpers/selectors';

interface IVirtualizationStats {
    logicalBlocks: number;
    mountedBlocks: number;
    mountedIndexes: number[];
}

test.describe('document viewport rendering @perf', () => {
    test.setTimeout(120_000);

    test('uses one indexed rendering path from a tiny document through a 10k-block document', async ({ page }, testInfo) => {
        const tiny = await page.evaluate(() => {
            window.muya!.setContent('tiny document');
            return window.muya!.editor.scrollPage!.getVirtualizationStats();
        }) as IVirtualizationStats;

        expect(tiny).toMatchObject({
            logicalBlocks: 1,
            mountedBlocks: 1,
            mountedIndexes: [0],
        });
        await expect(page.locator(virtualBlock(0))).toContainText('tiny document');

        const opened = await page.evaluate(() => {
            const blockCount = 10_000;
            const markdown = Array.from(
                { length: blockCount },
                (_, index) => `paragraph ${index}`,
            ).join('\n\n');
            const startedAt = performance.now();
            window.muya!.setContent(markdown);
            return {
                blockCount,
                setContentMs: performance.now() - startedAt,
                virtualization: window.muya!.editor.scrollPage!.getVirtualizationStats(),
            };
        });

        expect(opened.setContentMs, `setContent took ${opened.setContentMs.toFixed(0)}ms`).toBeLessThan(60_000);
        expect(opened.virtualization.logicalBlocks).toBe(opened.blockCount);
        expect(opened.virtualization.mountedBlocks).toBeLessThan(100);
        expect(await page.locator(virtualBlocks).count()).toBeLessThan(100);

        const lastIndex = opened.blockCount - 1;
        await page.evaluate(() => {
            const block = window.muya!.editor.scrollPage!.ensureProgressVisible(1);
            if (!block?.domNode)
                throw new Error('Unable to mount the last logical block');
            block.domNode.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(500);

        const lastBlock = page.locator(virtualBlock(lastIndex));
        await expect(lastBlock).toBeInViewport();
        await expect(lastBlock).toContainText(`paragraph ${lastIndex}`);
        await testInfo.attach('bottom-viewport-settled.png', {
            body: await page.screenshot(),
            contentType: 'image/png',
        });

        const bottom = await page.evaluate(() => {
            return window.muya!.editor.scrollPage!.getVirtualizationStats();
        }) as IVirtualizationStats;
        expect(bottom.mountedBlocks).toBeLessThan(100);
        expect(bottom.mountedIndexes).toContain(lastIndex);

        await page.evaluate(() => {
            const block = window.muya!.editor.scrollPage!.ensureProgressVisible(0);
            if (!block?.domNode)
                throw new Error('Unable to remount the first logical block');
            block.domNode.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(500);

        await expect(page.locator(virtualBlock(0))).toBeInViewport();
        const top = await page.evaluate(() => {
            return window.muya!.editor.scrollPage!.getVirtualizationStats();
        }) as IVirtualizationStats;
        expect(top.mountedBlocks).toBeLessThan(100);
        expect(top.mountedIndexes).toContain(0);
    });
});
