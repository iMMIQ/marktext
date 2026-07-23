import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { expect, test, type ConsoleMessage, type Page, type Request } from '@playwright/test';

const KIB = 1024;
const MIB = 1024 * KIB;
const STANDARD_BYTES = 800 * KIB;
const STRESS_BYTES = 128 * MIB;
const DEFAULT_OUTPUT = 'test-results/large-document-benchmark.json';
const INPUT_MARKER = 'X';
const MIDDLE_EDIT_MARKER = 'MIDEDIT2026';

// ASCII makes UTF-8 byte length equal to JavaScript string length without
// allocating a second 128 MiB TextEncoder buffer in the stress profile.
const FIXTURE_UNIT = [
    '## Benchmark section',
    '',
    'A realistic paragraph with **bold**, *italic*, `code`, and a [link](https://example.com).',
    '',
    '- first list item with enough text to exercise inline parsing',
    '- second list item with a nested-looking `code` token',
    '',
    '> A quoted paragraph used to vary the top-level block structure.',
    '',
    '',
].join('\n');

type TProfile = 'standard' | 'stress';

interface IBenchmarkOptions {
    profile: TProfile;
    targetBytes: number;
    runs: number;
    directJumps: boolean;
    outputPath: string;
}

interface IHeapSnapshot {
    usedJSHeapBytes: number | null;
    totalJSHeapBytes: number | null;
}

interface ILoadStartResult {
    exactBytes: number;
    logicalBlocks: number;
    sourceCandidates: number;
    initialMountedBlocks: number;
    initialDomNodes: number;
    firstPaintMountedBlocks: number;
    firstPaintDomNodes: number;
    sourceStoreMs: number;
    sourceIndexMs: number;
    sourceIndexBytes: number;
    segmentIndexBytes: number;
    layoutIndexBytes: number;
    stateCountResolveMs: number;
    stateCountPreparsedSegments: number;
    semanticSlots: number;
    parsedLogicalBlocks: number;
    semanticComplete: boolean;
    fullParseMs: number;
    setContentCallMs: number;
    firstPaintOpportunityMs: number;
    baselineHeap: IHeapSnapshot;
    firstPaintHeap: IHeapSnapshot;
}

interface IInputResult {
    inputToPaintMs: number;
    markdownContainsMarker: boolean;
}

interface IRuntimeResult {
    mountedBlocks: number;
    logicalBlocks: number;
    domNodes: number;
    heap: IHeapSnapshot;
    longTaskCount: number;
    longTaskTotalMs: number;
    longestLongTaskMs: number;
}

interface ILoadRun extends ILoadStartResult, IInputResult {
    run: number;
    settled: IRuntimeResult;
}

interface IJumpResult {
    index: number;
    jumpToPaintMs: number;
    mountedBlocks: number;
    domNodes: number;
    scrollTop: number;
    scrollHeight: number;
    viewportHeight: number;
    blockTop: number;
    blockBottom: number;
    connected: boolean;
    inViewport: boolean;
}

interface IMiddleEditSnapshot {
    markerOffset: number;
    markerPrefixOffset: number;
    markdownLength: number;
    logicalBlocks: number;
    mountedBlocks: number;
    domNodes: number;
    parsedLogicalBlocks: number;
    sourceBacked: boolean;
    semanticComplete: boolean;
    selectionConnected: boolean;
}

interface IMiddleEditResult {
    index: number;
    markerSourceOffset: number;
    markerSourceProgress: number;
    logicalBlocksBefore: number;
    logicalBlocksAfterRedoEnter: number;
    insertToPaintMs: number;
    undoToPaintMs: number;
    redoToPaintMs: number;
    cursorLeftToPaintMs: number;
    cursorRightToPaintMs: number;
    backspaceToPaintMs: number;
    undoBackspaceToPaintMs: number;
    enterToPaintMs: number;
    undoEnterToPaintMs: number;
    redoEnterToPaintMs: number;
    mountedBlocks: number;
    domNodes: number;
    parsedLogicalBlocks: number;
    sourceBacked: boolean;
    semanticComplete: boolean;
    selectionConnected: boolean;
}

interface IJumpRun {
    run: number;
    exactBytes: number;
    logicalBlocks: number;
    sourceCandidates: number;
    sourceStoreMs: number;
    sourceIndexMs: number;
    sourceIndexBytes: number;
    segmentIndexBytes: number;
    layoutIndexBytes: number;
    stateCountResolveMs: number;
    stateCountPreparsedSegments: number;
    semanticSlots: number;
    parsedLogicalBlocks: number;
    semanticComplete: boolean;
    fullParseMs: number;
    setContentCallMs: number;
    firstPaintOpportunityMs: number;
    middle: IJumpResult;
    middleEdit: IMiddleEditResult;
    bottom: IJumpResult;
    bottomSettled: IJumpResult;
    runtime: IRuntimeResult;
}

interface IStats {
    min: number;
    p50: number;
    p95: number;
    max: number;
}

interface ILongTaskRuntime {
    startedAt: number;
    durations: number[];
    observer: PerformanceObserver | null;
}

interface IPerformanceMemory {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
}

interface IBenchmarkWindow extends Window {
    __muyaBenchmark?: ILongTaskRuntime;
}

function readPositiveInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined)
        return fallback;

    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new Error(`${name} must be a positive safe integer, received ${raw}`);
    return value;
}

function readBoolean(name: string, fallback: boolean): boolean {
    const raw = process.env[name];
    if (raw === undefined)
        return fallback;
    if (raw === '1' || raw === 'true')
        return true;
    if (raw === '0' || raw === 'false')
        return false;
    throw new Error(`${name} must be 0, 1, true, or false, received ${raw}`);
}

function readOptions(): IBenchmarkOptions {
    const profile = process.env.MUYA_BENCHMARK_PROFILE ?? 'standard';
    if (profile !== 'standard' && profile !== 'stress')
        throw new Error(`MUYA_BENCHMARK_PROFILE must be standard or stress, received ${profile}`);

    const stress = profile === 'stress';
    return {
        profile,
        targetBytes: readPositiveInteger('MUYA_BENCHMARK_BYTES', stress ? STRESS_BYTES : STANDARD_BYTES),
        runs: readPositiveInteger('MUYA_BENCHMARK_RUNS', stress ? 1 : 3),
        directJumps: readBoolean('MUYA_BENCHMARK_DIRECT_JUMPS', true),
        outputPath: process.env.MUYA_BENCHMARK_OUTPUT ?? DEFAULT_OUTPUT,
    };
}

function percentile(values: number[], ratio: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    const position = (sorted.length - 1) * ratio;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper)
        return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function stats(values: Array<number | null>): IStats | null {
    const finite = values.filter((value): value is number => value !== null && Number.isFinite(value));
    if (finite.length === 0)
        return null;
    return {
        min: Math.min(...finite),
        p50: percentile(finite, 0.5),
        p95: percentile(finite, 0.95),
        max: Math.max(...finite),
    };
}

function heapDelta(end: IHeapSnapshot, start: IHeapSnapshot): number | null {
    if (end.usedJSHeapBytes === null || start.usedJSHeapBytes === null)
        return null;
    return end.usedJSHeapBytes - start.usedJSHeapBytes;
}

function readGit(args: string[]): string | null {
    try {
        return execFileSync('git', args, { encoding: 'utf8' }).trim();
    }
    catch {
        return null;
    }
}

async function openBenchmarkHost(page: Page): Promise<void> {
    const startupErrors: string[] = [];
    const onConsole = (message: ConsoleMessage) => {
        if (message.type() === 'error')
            startupErrors.push(`console: ${message.text()}`);
    };
    const onPageError = (error: Error) => startupErrors.push(`pageerror: ${error.message}`);
    const onRequestFailed = (request: Request) => {
        startupErrors.push(`request: ${request.url()} (${request.failure()?.errorText ?? 'unknown failure'})`);
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('requestfailed', onRequestFailed);

    try {
        await page.goto('/');
        await page.waitForFunction(
            () => window.muya?.editor?.scrollPage != null,
            undefined,
            { timeout: 60_000 },
        );
        await page.requestGC();
    }
    catch (error) {
        const detail = startupErrors.length > 0 ? `\n${startupErrors.join('\n')}` : '';
        throw new Error(`Muya benchmark host did not initialize${detail}\n${String(error)}`);
    }
    finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
        page.off('requestfailed', onRequestFailed);
    }
}

async function startDocument(page: Page, targetBytes: number): Promise<ILoadStartResult> {
    return page.evaluate(async ({ fixtureUnit, targetBytes }) => {
        const afterPaintOpportunity = () => new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        const heapSnapshot = (): IHeapSnapshot => {
            const memory = (performance as Performance & { memory?: IPerformanceMemory }).memory;
            return {
                usedJSHeapBytes: memory?.usedJSHeapSize ?? null,
                totalJSHeapBytes: memory?.totalJSHeapSize ?? null,
            };
        };
        const createMarkdown = (): string => {
            const repetitions = Math.floor(targetBytes / fixtureUnit.length);
            let markdown = fixtureUnit.repeat(repetitions);
            const remaining = targetBytes - markdown.length;
            if (remaining > 0)
                markdown += 'x'.repeat(remaining);
            return markdown;
        };

        const benchmarkWindow = window as IBenchmarkWindow;
        const durations: number[] = [];
        let observer: PerformanceObserver | null = null;
        if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
            observer = new PerformanceObserver((list) => {
                durations.push(...list.getEntries().map(entry => entry.duration));
            });
            observer.observe({ type: 'longtask', buffered: true });
        }

        const muya = window.muya!;
        const markdown = createMarkdown();
        const baselineHeap = heapSnapshot();
        const startedAt = performance.now();
        const runtime: ILongTaskRuntime = {
            startedAt,
            durations,
            observer,
        };
        benchmarkWindow.__muyaBenchmark = runtime;
        const setContentStartedAt = performance.now();
        muya.setContent(markdown);
        const setContentCompletedAt = performance.now();
        const loadMetrics = muya.editor.jsonState.getDocumentLoadMetrics();
        if (loadMetrics.inputType !== 'markdown')
            throw new Error('Benchmark markdown did not use the source-indexed load path');
        const virtualization = muya.editor.scrollPage!.getVirtualizationStats();
        const logicalBlocks = virtualization.logicalBlocks;
        const initialMountedBlocks = virtualization.mountedBlocks;
        const initialDomNodes = muya.domNode.querySelectorAll('*').length;

        await afterPaintOpportunity();
        return {
            exactBytes: markdown.length,
            logicalBlocks,
            sourceCandidates: loadMetrics.sourceCandidates,
            initialMountedBlocks,
            initialDomNodes,
            firstPaintMountedBlocks: muya.editor.scrollPage!.getVirtualizationStats().mountedBlocks,
            firstPaintDomNodes: muya.domNode.querySelectorAll('*').length,
            sourceStoreMs: loadMetrics.sourceStoreMs,
            sourceIndexMs: loadMetrics.sourceIndexMs,
            sourceIndexBytes: loadMetrics.sourceIndexBytes,
            segmentIndexBytes: loadMetrics.segmentIndexBytes,
            layoutIndexBytes: virtualization.layoutIndexBytes,
            stateCountResolveMs: loadMetrics.stateCountResolveMs,
            stateCountPreparsedSegments: loadMetrics.stateCountPreparsedSegments,
            semanticSlots: loadMetrics.semanticSlots,
            parsedLogicalBlocks: loadMetrics.parsedLogicalBlocks,
            semanticComplete: loadMetrics.semanticComplete,
            fullParseMs: loadMetrics.fullParseMs,
            setContentCallMs: setContentCompletedAt - setContentStartedAt,
            firstPaintOpportunityMs: performance.now() - startedAt,
            baselineHeap,
            firstPaintHeap: heapSnapshot(),
        };
    }, { fixtureUnit: FIXTURE_UNIT, targetBytes });
}

async function measureInput(page: Page): Promise<IInputResult> {
    await page.evaluate(() => {
        const muya = window.muya!;
        const content = muya.editor.scrollPage!.firstContentInDescendant();
        if (!content)
            throw new Error('Unable to resolve the first editable block');
        content.setCursor(content.text.length, content.text.length, true);
        content.domNode!.focus({ preventScroll: true });

        muya.domNode.addEventListener('beforeinput', () => {
            performance.clearMarks('muya-benchmark-input');
            performance.mark('muya-benchmark-input');
        }, { capture: true, once: true });
    });

    await page.keyboard.insertText(INPUT_MARKER);
    return page.evaluate(async (marker) => {
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        window.muya!.flush();
        const inputMarks = performance.getEntriesByName('muya-benchmark-input', 'mark');
        const inputMark = inputMarks[inputMarks.length - 1];
        if (!inputMark)
            throw new Error('The benchmark input did not produce a beforeinput event');
        return {
            inputToPaintMs: performance.now() - inputMark.startTime,
            markdownContainsMarker: window.muya!.getMarkdown().includes(marker),
        };
    }, INPUT_MARKER);
}

async function finishRuntime(page: Page): Promise<IRuntimeResult> {
    return page.evaluate(async () => {
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        const benchmarkWindow = window as IBenchmarkWindow;
        const runtime = benchmarkWindow.__muyaBenchmark;
        if (!runtime)
            throw new Error('Benchmark runtime was not initialized');

        if (runtime.observer) {
            runtime.durations.push(...runtime.observer.takeRecords().map(entry => entry.duration));
            runtime.observer.disconnect();
        }
        const memory = (performance as Performance & { memory?: IPerformanceMemory }).memory;
        const muya = window.muya!;
        return {
            mountedBlocks: muya.editor.scrollPage!.getVirtualizationStats().mountedBlocks,
            logicalBlocks: muya.editor.scrollPage!.getVirtualizationStats().logicalBlocks,
            domNodes: muya.domNode.querySelectorAll('*').length,
            heap: {
                usedJSHeapBytes: memory?.usedJSHeapSize ?? null,
                totalJSHeapBytes: memory?.totalJSHeapSize ?? null,
            },
            longTaskCount: runtime.durations.length,
            longTaskTotalMs: runtime.durations.reduce((sum, duration) => sum + duration, 0),
            longestLongTaskMs: Math.max(0, ...runtime.durations),
        };
    });
}

async function measureJump(page: Page, ratio: number): Promise<IJumpResult> {
    return page.evaluate(async (ratio) => {
        const muya = window.muya!;
        const scrollPage = muya.editor.scrollPage!;
        const logicalBlocks = scrollPage.getVirtualizationStats().logicalBlocks;
        const index = Math.floor((logicalBlocks - 1) * ratio);
        const startedAt = performance.now();
        const initialBlock = scrollPage.ensureProgressVisible(ratio);
        if (!initialBlock?.domNode)
            throw new Error(`Unable to resolve mounted block ${index}`);
        initialBlock.domNode.scrollIntoView({ block: 'center' });
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        const block = scrollPage.find(index);
        if (!block?.domNode)
            throw new Error(`Block ${index} was not mounted after the viewport settled`);
        const blockBounds = block.domNode.getBoundingClientRect();
        const scrollingElement = document.scrollingElement!;
        return {
            index,
            jumpToPaintMs: performance.now() - startedAt,
            mountedBlocks: scrollPage.getVirtualizationStats().mountedBlocks,
            domNodes: muya.domNode.querySelectorAll('*').length,
            scrollTop: scrollingElement.scrollTop,
            scrollHeight: scrollingElement.scrollHeight,
            viewportHeight: scrollingElement.clientHeight,
            blockTop: blockBounds.top,
            blockBottom: blockBounds.bottom,
            connected: block.domNode.isConnected,
            inViewport: blockBounds.bottom > 0 && blockBounds.top < scrollingElement.clientHeight,
        };
    }, ratio);
}

async function readMountedJump(page: Page, index: number): Promise<IJumpResult> {
    return page.evaluate((index) => {
        const muya = window.muya!;
        const scrollPage = muya.editor.scrollPage!;
        const virtualization = scrollPage.getVirtualizationStats();
        const block = virtualization.mountedIndexes.includes(index)
            ? scrollPage.find(index)
            : null;
        if (!block?.domNode)
            throw new Error(`Block ${index} is not mounted in the settled viewport: ${JSON.stringify(virtualization)}`);
        const blockBounds = block.domNode.getBoundingClientRect();
        const scrollingElement = document.scrollingElement!;
        return {
            index,
            jumpToPaintMs: 0,
            mountedBlocks: virtualization.mountedBlocks,
            domNodes: muya.domNode.querySelectorAll('*').length,
            scrollTop: scrollingElement.scrollTop,
            scrollHeight: scrollingElement.scrollHeight,
            viewportHeight: scrollingElement.clientHeight,
            blockTop: blockBounds.top,
            blockBottom: blockBounds.bottom,
            connected: block.domNode.isConnected,
            inViewport: blockBounds.bottom > 0 && blockBounds.top < scrollingElement.clientHeight,
        };
    }, index);
}

async function measureInputAction(
    page: Page,
    action: { type: 'text'; value: string } | { type: 'key'; value: string },
): Promise<number> {
    await page.evaluate(() => {
        const muya = window.muya!;
        muya.domNode.addEventListener('beforeinput', () => {
            performance.clearMarks('muya-benchmark-edit');
            performance.mark('muya-benchmark-edit');
        }, { capture: true, once: true });
    });
    if (action.type === 'text')
        await page.keyboard.insertText(action.value);
    else
        await page.keyboard.press(action.value);
    return page.evaluate(async () => {
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        window.muya!.flush();
        const marks = performance.getEntriesByName('muya-benchmark-edit', 'mark');
        const mark = marks[marks.length - 1];
        if (!mark)
            throw new Error('The benchmark editing action did not produce a beforeinput event');
        return performance.now() - mark.startTime;
    });
}

async function measureCursorAction(page: Page, key: 'ArrowLeft' | 'ArrowRight'): Promise<number> {
    const startedAt = await page.evaluate(() => performance.now());
    await page.keyboard.press(key);
    return page.evaluate(async (start) => {
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        return performance.now() - start;
    }, startedAt);
}

async function measureHistoryAction(page: Page, action: 'undo' | 'redo'): Promise<number> {
    return page.evaluate(async (action) => {
        const muya = window.muya!;
        muya.flush();
        const startedAt = performance.now();
        muya[action]();
        await new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        muya.flush();
        return performance.now() - startedAt;
    }, action);
}

async function readMiddleEditSnapshot(page: Page): Promise<IMiddleEditSnapshot> {
    return page.evaluate((marker) => {
        const muya = window.muya!;
        muya.flush();
        const markdown = muya.getMarkdown();
        const selection = muya.editor.selection.getSelection();
        const virtualization = muya.editor.scrollPage!.getVirtualizationStats();
        return {
            markerOffset: markdown.indexOf(marker),
            markerPrefixOffset: markdown.indexOf(marker.slice(0, -1)),
            markdownLength: markdown.length,
            logicalBlocks: virtualization.logicalBlocks,
            mountedBlocks: virtualization.mountedBlocks,
            domNodes: muya.domNode.querySelectorAll('*').length,
            parsedLogicalBlocks: muya.editor.jsonState.getDocumentLoadMetrics().parsedLogicalBlocks,
            sourceBacked: muya.editor.jsonState.getSourceIndex() !== null,
            semanticComplete: muya.editor.jsonState.isSemanticComplete,
            selectionConnected: selection?.anchor.block?.domNode?.isConnected ?? false,
        };
    }, MIDDLE_EDIT_MARKER);
}

async function measureMiddleEdit(
    page: Page,
    index: number,
    capture?: (phase: string) => Promise<void>,
): Promise<IMiddleEditResult> {
    const initial = await page.evaluate((index) => {
        const muya = window.muya!;
        const scrollPage = muya.editor.scrollPage!;
        const block = scrollPage.find(index);
        const content = block?.firstContentInDescendant();
        if (!block?.domNode || !content)
            throw new Error(`Unable to edit mounted middle block ${index}`);
        block.domNode.scrollIntoView({ block: 'center' });
        content.setCursor(content.text.length, content.text.length, true);
        content.domNode!.focus({ preventScroll: true });
        muya.editor.history.cutoff();
        return scrollPage.getVirtualizationStats();
    }, index);

    const insertToPaintMs = await measureInputAction(page, { type: 'text', value: MIDDLE_EDIT_MARKER });
    const inserted = await readMiddleEditSnapshot(page);
    expect(inserted.markerOffset).toBeGreaterThan(0);
    expect(inserted.markerOffset / inserted.markdownLength).toBeGreaterThan(0.4);
    expect(inserted.markerOffset / inserted.markdownLength).toBeLessThan(0.6);
    expect(inserted).toMatchObject({
        logicalBlocks: initial.logicalBlocks,
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });
    await capture?.('middle-edit');

    const undoToPaintMs = await measureHistoryAction(page, 'undo');
    const undone = await readMiddleEditSnapshot(page);
    expect(undone).toMatchObject({
        markerOffset: -1,
        logicalBlocks: initial.logicalBlocks,
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });
    await capture?.('middle-undo');

    const redoToPaintMs = await measureHistoryAction(page, 'redo');
    const redone = await readMiddleEditSnapshot(page);
    expect(redone.markerOffset).toBe(inserted.markerOffset);
    expect(redone).toMatchObject({
        logicalBlocks: initial.logicalBlocks,
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });
    await capture?.('middle-redo');

    const cursorLeftToPaintMs = await measureCursorAction(page, 'ArrowLeft');
    const cursorRightToPaintMs = await measureCursorAction(page, 'ArrowRight');
    const afterCursor = await readMiddleEditSnapshot(page);
    expect(afterCursor).toMatchObject({
        markerOffset: inserted.markerOffset,
        selectionConnected: true,
    });

    const backspaceToPaintMs = await measureInputAction(page, { type: 'key', value: 'Backspace' });
    const deleted = await readMiddleEditSnapshot(page);
    expect(deleted.markerOffset).toBe(-1);
    expect(deleted.markerPrefixOffset).toBe(inserted.markerOffset);
    expect(deleted).toMatchObject({
        logicalBlocks: initial.logicalBlocks,
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });

    const undoBackspaceToPaintMs = await measureHistoryAction(page, 'undo');
    const deletionUndone = await readMiddleEditSnapshot(page);
    expect(deletionUndone.markerOffset).toBe(inserted.markerOffset);

    await page.evaluate(() => window.muya!.editor.history.cutoff());
    const enterToPaintMs = await measureInputAction(page, { type: 'key', value: 'Enter' });
    const entered = await readMiddleEditSnapshot(page);
    expect(entered).toMatchObject({
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });
    expect(entered.markerOffset).toBe(inserted.markerOffset);
    expect(entered.markdownLength).toBeGreaterThan(deletionUndone.markdownLength);

    const undoEnterToPaintMs = await measureHistoryAction(page, 'undo');
    const enterUndone = await readMiddleEditSnapshot(page);
    expect(enterUndone).toMatchObject({
        logicalBlocks: initial.logicalBlocks,
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });
    expect(enterUndone.markerOffset).toBe(inserted.markerOffset);
    expect(enterUndone.markdownLength).toBe(deletionUndone.markdownLength);

    const redoEnterToPaintMs = await measureHistoryAction(page, 'redo');
    const final = await readMiddleEditSnapshot(page);
    expect(final).toMatchObject({
        logicalBlocks: entered.logicalBlocks,
        sourceBacked: true,
        semanticComplete: false,
        selectionConnected: true,
    });
    expect(final.markerOffset).toBe(inserted.markerOffset);
    expect(final.markdownLength).toBe(entered.markdownLength);
    expect(final.mountedBlocks).toBeLessThan(final.logicalBlocks);

    return {
        index,
        markerSourceOffset: inserted.markerOffset,
        markerSourceProgress: inserted.markerOffset / inserted.markdownLength,
        logicalBlocksBefore: initial.logicalBlocks,
        logicalBlocksAfterRedoEnter: final.logicalBlocks,
        insertToPaintMs,
        undoToPaintMs,
        redoToPaintMs,
        cursorLeftToPaintMs,
        cursorRightToPaintMs,
        backspaceToPaintMs,
        undoBackspaceToPaintMs,
        enterToPaintMs,
        undoEnterToPaintMs,
        redoEnterToPaintMs,
        mountedBlocks: final.mountedBlocks,
        domNodes: final.domNodes,
        parsedLogicalBlocks: final.parsedLogicalBlocks,
        sourceBacked: final.sourceBacked,
        semanticComplete: final.semanticComplete,
        selectionConnected: final.selectionConnected,
    };
}

const options = readOptions();

test('large document benchmark @benchmark', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'The benchmark baseline is Chromium-only');
    expect(Buffer.byteLength(FIXTURE_UNIT, 'utf8')).toBe(FIXTURE_UNIT.length);

    const loadRuns: ILoadRun[] = [];
    const jumpRuns: IJumpRun[] = [];

    for (let run = 1; run <= options.runs; run++) {
        console.log(`[benchmark] load/input run ${run}/${options.runs}`);
        await openBenchmarkHost(page);
        const load = await startDocument(page, options.targetBytes);
        expect(load.exactBytes).toBe(options.targetBytes);
        expect(load.initialMountedBlocks).toBeLessThanOrEqual(load.logicalBlocks);

        const input = await measureInput(page);
        expect(input.markdownContainsMarker).toBe(true);

        const settled = await finishRuntime(page);
        expect(settled.mountedBlocks).toBeLessThan(settled.logicalBlocks);

        loadRuns.push({ run, ...load, ...input, settled });

        if (run === 1) {
            await testInfo.attach('first-load.png', {
                body: await page.screenshot(),
                contentType: 'image/png',
            });
        }

        if (!options.directJumps)
            continue;

        console.log(`[benchmark] direct-jump run ${run}/${options.runs}`);
        await openBenchmarkHost(page);
        const jumpLoad = await startDocument(page, options.targetBytes);
        const middle = await measureJump(page, 0.5);
        expect(middle, JSON.stringify(middle)).toMatchObject({ connected: true, inViewport: true });
        const middleEdit = await measureMiddleEdit(
            page,
            middle.index,
            run === 1
                ? async (phase) => testInfo.attach(`${phase}.png`, {
                    body: await page.screenshot(),
                    contentType: 'image/png',
                })
                : undefined,
        );
        const bottom = await measureJump(page, 1);
        expect(bottom, JSON.stringify(bottom)).toMatchObject({ connected: true, inViewport: true });

        if (run === 1) {
            await testInfo.attach('bottom-jump-immediate.png', {
                body: await page.screenshot(),
                contentType: 'image/png',
            });
            await page.waitForTimeout(500);
        }
        else {
            await page.waitForTimeout(500);
        }

        const bottomSettled = await readMountedJump(page, bottom.index);
        expect(bottomSettled).toMatchObject({ connected: true, inViewport: true });
        await expect(page.locator(`[data-virtual-index="${bottom.index}"]`)).toBeInViewport();

        if (run === 1) {
            await testInfo.attach('bottom-jump-settled.png', {
                body: await page.screenshot(),
                contentType: 'image/png',
            });
        }

        const runtime = await finishRuntime(page);
        expect(runtime.mountedBlocks).toBeLessThan(runtime.logicalBlocks);
        jumpRuns.push({
            run,
            exactBytes: jumpLoad.exactBytes,
            logicalBlocks: jumpLoad.logicalBlocks,
            sourceCandidates: jumpLoad.sourceCandidates,
            sourceStoreMs: jumpLoad.sourceStoreMs,
            sourceIndexMs: jumpLoad.sourceIndexMs,
            sourceIndexBytes: jumpLoad.sourceIndexBytes,
            segmentIndexBytes: jumpLoad.segmentIndexBytes,
            layoutIndexBytes: jumpLoad.layoutIndexBytes,
            stateCountResolveMs: jumpLoad.stateCountResolveMs,
            stateCountPreparsedSegments: jumpLoad.stateCountPreparsedSegments,
            semanticSlots: jumpLoad.semanticSlots,
            parsedLogicalBlocks: jumpLoad.parsedLogicalBlocks,
            semanticComplete: jumpLoad.semanticComplete,
            fullParseMs: jumpLoad.fullParseMs,
            setContentCallMs: jumpLoad.setContentCallMs,
            firstPaintOpportunityMs: jumpLoad.firstPaintOpportunityMs,
            middle,
            middleEdit,
            bottom,
            bottomSettled,
            runtime,
        });
    }

    const firstPageEnvironment = await page.evaluate(() => {
        const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemoryGiB: navigatorWithMemory.deviceMemory ?? null,
            viewport: { width: window.innerWidth, height: window.innerHeight },
        };
    });

    const report = {
        schemaVersion: 3,
        generatedAt: new Date().toISOString(),
        sourceRevision: process.env.GITHUB_SHA ?? readGit(['rev-parse', 'HEAD']),
        sourceDirty: (readGit(['status', '--porcelain']) ?? '').length > 0,
        profile: options.profile,
        fixture: {
            targetBytes: options.targetBytes,
            encoding: 'ASCII (UTF-8 byte length equals string length)',
            unitBytes: FIXTURE_UNIT.length,
        },
        settings: {
            runs: options.runs,
            directJumps: options.directJumps,
        },
        environment: {
            browserName,
            hostBuild: 'vite-production',
            node: process.version,
            hostPlatform: process.platform,
            ci: !!process.env.CI,
            ...firstPageEnvironment,
        },
        summary: {
            sourceStoreMs: stats(loadRuns.map(run => run.sourceStoreMs)),
            sourceIndexMs: stats(loadRuns.map(run => run.sourceIndexMs)),
            sourceIndexBytes: stats(loadRuns.map(run => run.sourceIndexBytes)),
            segmentIndexBytes: stats(loadRuns.map(run => run.segmentIndexBytes)),
            layoutIndexBytes: stats(loadRuns.map(run => run.layoutIndexBytes)),
            stateCountResolveMs: stats(loadRuns.map(run => run.stateCountResolveMs)),
            stateCountPreparsedSegments: stats(loadRuns.map(run => run.stateCountPreparsedSegments)),
            semanticSlots: stats(loadRuns.map(run => run.semanticSlots)),
            fullParseMs: stats(loadRuns.map(run => run.fullParseMs)),
            setContentCallMs: stats(loadRuns.map(run => run.setContentCallMs)),
            sourceCandidates: stats(loadRuns.map(run => run.sourceCandidates)),
            parsedLogicalBlocks: stats(loadRuns.map(run => run.parsedLogicalBlocks)),
            firstPaintOpportunityMs: stats(loadRuns.map(run => run.firstPaintOpportunityMs)),
            inputToPaintMs: stats(loadRuns.map(run => run.inputToPaintMs)),
            initialMountedBlocks: stats(loadRuns.map(run => run.initialMountedBlocks)),
            firstPaintMountedBlocks: stats(loadRuns.map(run => run.firstPaintMountedBlocks)),
            initialDomNodes: stats(loadRuns.map(run => run.initialDomNodes)),
            firstPaintDomNodes: stats(loadRuns.map(run => run.firstPaintDomNodes)),
            settledDomNodes: stats(loadRuns.map(run => run.settled.domNodes)),
            firstPaintUsedJSHeapDeltaBytes: stats(loadRuns.map(run => heapDelta(run.firstPaintHeap, run.baselineHeap))),
            settledUsedJSHeapDeltaBytes: stats(loadRuns.map(run => heapDelta(run.settled.heap, run.baselineHeap))),
            longTaskTotalMs: stats(loadRuns.map(run => run.settled.longTaskTotalMs)),
            longestLongTaskMs: stats(loadRuns.map(run => run.settled.longestLongTaskMs)),
            middleJumpToPaintMs: stats(jumpRuns.map(run => run.middle.jumpToPaintMs)),
            middleEditInsertToPaintMs: stats(jumpRuns.map(run => run.middleEdit.insertToPaintMs)),
            middleEditUndoToPaintMs: stats(jumpRuns.map(run => run.middleEdit.undoToPaintMs)),
            middleEditRedoToPaintMs: stats(jumpRuns.map(run => run.middleEdit.redoToPaintMs)),
            middleEditCursorLeftToPaintMs: stats(jumpRuns.map(run => run.middleEdit.cursorLeftToPaintMs)),
            middleEditCursorRightToPaintMs: stats(jumpRuns.map(run => run.middleEdit.cursorRightToPaintMs)),
            middleEditBackspaceToPaintMs: stats(jumpRuns.map(run => run.middleEdit.backspaceToPaintMs)),
            middleEditUndoBackspaceToPaintMs: stats(jumpRuns.map(run => run.middleEdit.undoBackspaceToPaintMs)),
            middleEditEnterToPaintMs: stats(jumpRuns.map(run => run.middleEdit.enterToPaintMs)),
            middleEditUndoEnterToPaintMs: stats(jumpRuns.map(run => run.middleEdit.undoEnterToPaintMs)),
            middleEditRedoEnterToPaintMs: stats(jumpRuns.map(run => run.middleEdit.redoEnterToPaintMs)),
            middleEditMarkerSourceProgress: stats(jumpRuns.map(run => run.middleEdit.markerSourceProgress)),
            middleEditDomNodes: stats(jumpRuns.map(run => run.middleEdit.domNodes)),
            middleEditParsedLogicalBlocks: stats(jumpRuns.map(run => run.middleEdit.parsedLogicalBlocks)),
            bottomJumpToPaintMs: stats(jumpRuns.map(run => run.bottom.jumpToPaintMs)),
        },
        loadRuns,
        jumpRuns,
    };

    const reportJson = `${JSON.stringify(report, null, 2)}\n`;
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, reportJson, 'utf8');
    await testInfo.attach('large-document-benchmark.json', {
        body: Buffer.from(reportJson),
        contentType: 'application/json',
    });

    console.log(`Large-document benchmark written to ${options.outputPath}`);
    console.log(JSON.stringify(report.summary, null, 2));
});
