import { expect, test } from '../fixtures/muya';

function searchDocument(count = 1_200) {
    return Array.from({ length: count }, (_, index) => {
        return [0, Math.floor(count / 2), count - 1].includes(index)
            ? `needle-${index}`
            : `paragraph ${index}`;
    }).join('\n\n');
}

test.describe('virtualized whole-document search and replace', () => {
    test('navigates, replaces, and restores distant matches with bounded DOM', async ({ page }, testInfo) => {
        const rendererErrors: string[] = [];
        page.on('pageerror', error => rendererErrors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error')
                rendererErrors.push(message.text());
        });
        const original = searchDocument();
        const searched = await page.evaluate((markdown) => {
            window.muya!.setContent(markdown);
            const { editor } = window.muya!;
            const before = editor.scrollPage!.getVirtualizationStats();
            const undoBefore = editor.history.getHistory().stack.undo.length;
            editor.searchModule.search('needle-(\\d+)', { isRegexp: true });
            return {
                before,
                after: editor.scrollPage!.getVirtualizationStats(),
                paths: editor.searchModule.matches.map(match => match.path),
                undoBefore,
                sourceBacked: editor.jsonState.isSourceBacked,
            };
        }, original);

        expect(searched.paths).toEqual([
            [0, 'text'],
            [600, 'text'],
            [1_199, 'text'],
        ]);
        expect(searched.after.mountedBlocks).toBe(searched.before.mountedBlocks);
        expect(searched.after.mountedBlocks).toBeLessThan(100);
        expect(searched.sourceBacked).toBe(true);
        await testInfo.attach('virtual-search-00-top.png', {
            body: await page.screenshot(),
            contentType: 'image/png',
        });

        await page.evaluate(() => window.muya!.editor.searchModule.find('next'));
        const middle = page.locator('[data-virtual-index="600"]');
        await expect(middle).toBeInViewport();
        await expect(middle.locator('.mu-highlight')).toContainText('needle-600');
        const middleStats = await page.evaluate(() =>
            window.muya!.editor.scrollPage!.getVirtualizationStats(),
        );
        expect(middleStats.mountedBlocks).toBeLessThan(100);
        expect(middleStats.mountedIndexes).toContain(600);
        await testInfo.attach('virtual-search-01-middle.png', {
            body: await page.screenshot(),
            contentType: 'image/png',
        });

        const replaced = await page.evaluate(() => {
            const { editor } = window.muya!;
            editor.searchModule.replace('found-$1', { isSingle: false, isRegexp: true });
            return {
                markdown: window.muya!.getMarkdown(),
                stats: editor.scrollPage!.getVirtualizationStats(),
                undoCount: editor.history.getHistory().stack.undo.length,
                sourceBacked: editor.jsonState.isSourceBacked,
            };
        });
        expect(replaced.markdown).toContain('found-0');
        expect(replaced.markdown).toContain('found-600');
        expect(replaced.markdown).toContain('found-1199');
        expect(replaced.markdown).not.toContain('needle-');
        expect(replaced.stats.mountedBlocks).toBeLessThan(100);
        expect(replaced.undoCount).toBe(searched.undoBefore + 1);
        expect(replaced.sourceBacked).toBe(true);
        await testInfo.attach('virtual-search-02-replaced.png', {
            body: await page.screenshot(),
            contentType: 'image/png',
        });

        const restored = await page.evaluate(() => {
            window.muya!.undo();
            return {
                markdown: window.muya!.getMarkdown(),
                stats: window.muya!.editor.scrollPage!.getVirtualizationStats(),
                sourceBacked: window.muya!.editor.jsonState.isSourceBacked,
            };
        });
        expect(restored.markdown).toBe(`${original}\n`);
        expect(restored.stats.mountedBlocks).toBeLessThan(100);
        expect(restored.sourceBacked).toBe(true);

        const redone = await page.evaluate(() => {
            window.muya!.redo();
            return {
                markdown: window.muya!.getMarkdown(),
                stats: window.muya!.editor.scrollPage!.getVirtualizationStats(),
                sourceBacked: window.muya!.editor.jsonState.isSourceBacked,
            };
        });
        expect(redone.markdown).not.toContain('needle-');
        expect(redone.markdown).toContain('found-1199');
        expect(redone.stats.mountedBlocks).toBeLessThan(100);
        expect(redone.sourceBacked).toBe(true);
        expect(rendererErrors, `renderer errors: ${rendererErrors.join(' | ')}`).toEqual([]);
    });
});
