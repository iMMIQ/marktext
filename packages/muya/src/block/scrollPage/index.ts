import type { JSONOpList } from 'ot-json1';
import type { Muya } from '../../muya';
import type { IJSONChangePayload } from '../../state';
import type { TState } from '../../state/types';
import type { Nullable } from '../../types';
import type Content from '../base/content';
import type TreeNode from '../base/treeNode';
import type { IConstructor, TBlockPath } from '../types';
import { LinkedList } from '../../block/base/linkedList/linkedList';
import { BLOCK_DOM_PROPERTY } from '../../config';
import { deepClone, isHTMLElement, isMouseEvent } from '../../utils';
import { findScrollContainer } from '../../utils/dom';
import logger from '../../utils/logger';
import Parent from '../base/parent';
import { LayoutIndex } from './layoutIndex';
import { RenderPriority, RenderScheduler } from './renderScheduler';

const debug = logger('scrollpage:');

interface IBlurFocus {
    blur: Nullable<Content>;
    focus: Nullable<Content>;
}

export class ScrollPage extends Parent {
    private _blurFocus: IBlurFocus = { blur: null, focus: null };

    private _state: readonly TState[] = [];
    private readonly _layoutIndex = new LayoutIndex();
    private readonly _renderScheduler = new RenderScheduler();
    private readonly _mountedBlocks = new Map<number, Parent>();
    private readonly _blockIndexes = new WeakMap<TreeNode, number>();
    private _viewportIndexes = new Set<number>();
    private _revision = 0;
    private _onDemandMountSuspended = false;
    private _scrollContainer: HTMLElement | null = null;
    private _scrollEventTarget: HTMLElement | Document | null = null;
    private _lastScrollTop = 0;
    private _scrollFrame: number | null = null;
    private _drainHandle: { type: 'frame' | 'idle' | 'timeout'; id: number } | null = null;
    private _viewportResizeObserver: ResizeObserver | null = null;
    private _blockResizeObserver: ResizeObserver | null = null;

    static override blockName = 'scrollpage';

    // Registry of block constructors keyed by their static blockName.
    // Stored as Parent constructors — the overwhelming majority of
    // call sites do `loadBlock(...).create(...).append(child)`, which only
    // makes sense for Parent. Content leaves register themselves through
    // their containing Parent's create flow and don't go through
    // `loadBlock(...).create()` externally.
    private static _registeredBlocks = new Map<string, IConstructor<Parent>>();

    static register(Block: IConstructor<TreeNode>) {
        const { blockName } = Block;
        this._registeredBlocks.set(blockName, Block as IConstructor<Parent>);
    }

    // Returns the registered constructor. Asserts non-undefined for
    // callers (the registry is populated by `registerBlocks()` once at
    // `editor.init()` time, and `loadBlock` runs strictly after init.).
    // Mismatched names hit the warn branch and the caller crashes at
    // `.create()` — matches the original loose contract.
    static loadBlock(blockName: string): IConstructor<Parent> {
        const block = this._registeredBlocks.get(blockName);

        if (!block)
            debug.warn(`block:${blockName} is not existed.`);

        return block as IConstructor<Parent>;
    }

    static create(muya: Muya, state: readonly TState[]) {
        const scrollPage = new ScrollPage(muya);
        scrollPage.parent!.domNode!.appendChild(scrollPage.domNode!);
        scrollPage.updateState(state);

        return scrollPage;
    }

    override get path() {
        return [];
    }

    constructor(muya: Muya) {
        super(muya);
        // muya is not extends Parent, but it is the parent of scrollPage.
        // ScrollPage is the tree root; widening the base `TreeNode.parent`
        // declaration would ripple to every node, so spell out the boundary.
        // eslint-disable-next-line no-restricted-syntax
        this.parent = muya as unknown as Parent;
        this.tagName = 'div';
        this.classList = ['mu-container'];

        this.createDomNode();
        this._listenDomEvent();
        this.muya.eventCenter.on('json-change', this._handleJSONChange);
    }

    override getState() {
        debug.warn('You can never call `getState` in scrollPage');

        return {} as TState;
    }

    private _listenDomEvent() {
        const { eventCenter } = this.muya;
        const { domNode } = this;

        eventCenter.attachDOMEvent(domNode!, 'click', this._clickHandler.bind(this));
    }

    private _handleJSONChange = ({ stateSnapshot }: IJSONChangePayload) => {
        const structureChanged = stateSnapshot.length !== this._state.length;
        this._state = stateSnapshot;
        this._revision++;
        this._renderScheduler.reset(this._revision);
        if (structureChanged)
            this._layoutIndex.rebuild(stateSnapshot, this._getLayoutMetrics(), this._revision);
        this._scheduleOverscan();
    };

    updateState(state: readonly TState[]) {
        this._cancelScheduledWork();
        this._revision++;
        this._state = state;
        this._layoutIndex.rebuild(state, this._getLayoutMetrics(), this._revision);
        this._renderScheduler.reset(this._revision);
        this._mountedBlocks.clear();
        this._viewportIndexes.clear();
        this.empty();

        const scrollContainer = findScrollContainer(this.muya.domNode);
        const { overflowY } = getComputedStyle(scrollContainer);
        if (
            scrollContainer === this.muya.domNode
            && overflowY !== 'auto'
            && overflowY !== 'scroll'
            && document.scrollingElement instanceof HTMLElement
        ) {
            this._scrollContainer = document.scrollingElement;
            this._scrollEventTarget = document;
        }
        else {
            this._scrollContainer = scrollContainer;
            this._scrollEventTarget = scrollContainer;
        }
        this._listenToViewport();
        this._initializeViewport();
    }

    override length() {
        return this._state.length;
    }

    override offset(node: TreeNode) {
        return this._blockIndexes.get(node) ?? -1;
    }

    override find(offset: number) {
        if (offset < 0 || offset >= this._state.length)
            return null;
        if (!this._mountedBlocks.has(offset) && !this._onDemandMountSuspended)
            this._mountAroundIndex(offset);
        return this._mountedBlocks.get(offset) ?? null;
    }

    override append(...childrenAndSource: [...Parent[], string]): void;
    override append(...children: Parent[]): void;
    override append(...args: unknown[]) {
        const source = typeof args[args.length - 1] === 'string'
            ? args.pop() as string
            : 'api';
        for (const child of args as Parent[])
            this.insertBefore(child, null, source);
    }

    override insertBefore(
        newNode: Parent,
        refNode: Nullable<Parent> = null,
        source = 'user',
    ) {
        const refIndex = refNode ? this._blockIndexes.get(refNode) : undefined;
        const tailIndex = this.lastChild ? this._blockIndexes.get(this.lastChild) : undefined;
        const index = refIndex ?? (tailIndex === undefined ? 0 : tailIndex + 1);
        this._shiftMountedIndexes(index, 1);
        this._mountedBlocks.set(index, newNode);
        this._blockIndexes.set(newNode, index);
        this._viewportIndexes.add(index);
        return super.insertBefore(newNode, refNode, source);
    }

    override insertAfter(newNode: Parent, refNode: Nullable<Parent> = null, source = 'user') {
        if (!refNode)
            return this.insertBefore(newNode, null, source);
        const refIndex = this._blockIndexes.get(refNode);
        if (refIndex === undefined)
            return this.insertBefore(newNode, refNode.next, source);
        this.ensureAdjacentMounted(refNode, 1);
        return this.insertBefore(newNode, this._mountedBlocks.get(refIndex + 1) ?? null, source);
    }

    handleChildRemoved(node: TreeNode) {
        const index = this._blockIndexes.get(node);
        if (index === undefined)
            return;
        this._mountedBlocks.delete(index);
        this._viewportIndexes.delete(index);
        this._shiftMountedIndexes(index + 1, -1);
    }

    override firstContentInDescendant() {
        if (this._state.length > 0 && !this._mountedBlocks.has(0))
            this._addPinnedIndex(0);
        return super.firstContentInDescendant();
    }

    override lastContentInDescendant() {
        const lastIndex = this._state.length - 1;
        if (lastIndex >= 0 && !this._mountedBlocks.has(lastIndex))
            this._addPinnedIndex(lastIndex);
        return super.lastContentInDescendant();
    }

    ensureMountedForOperation(op: JSONOpList) {
        let maxIndex = -1;
        const scan = (component: unknown) => {
            if (!Array.isArray(component) || component.length === 0)
                return;
            const first: unknown = component[0];
            if (typeof first === 'number')
                maxIndex = Math.max(maxIndex, first);
            else if (Array.isArray(first))
                component.forEach(scan);
        };
        scan(op);
        if (maxIndex >= 0 && maxIndex < this._state.length) {
            this._addPinnedIndex(maxIndex);
            if (maxIndex + 1 < this._state.length)
                this._addPinnedIndex(maxIndex + 1);
        }
    }

    suspendOnDemandMount() {
        this._onDemandMountSuspended = true;
    }

    resumeOnDemandMount() {
        this._onDemandMountSuspended = false;
    }

    ensureAdjacentMounted(block: Parent, direction: 1 | -1) {
        const index = this._blockIndexes.get(block);
        if (index === undefined)
            return;
        const adjacent = index + direction;
        if (adjacent >= 0 && adjacent < this._state.length && !this._mountedBlocks.has(adjacent))
            this._addPinnedIndex(adjacent);
    }

    getVirtualizationStats() {
        const mountedIndexes = [...this._mountedBlocks.keys()].sort((a, b) => a - b);
        return {
            logicalBlocks: this._state.length,
            mountedBlocks: this._mountedBlocks.size,
            mountedIndexes,
            firstMountedIndex: mountedIndexes[0] ?? null,
            lastMountedIndex: mountedIndexes[mountedIndexes.length - 1] ?? null,
            totalHeight: this._layoutIndex.totalHeight,
            layoutIndexBytes: this._layoutIndex.storageBytes,
            revision: this._revision,
        };
    }

    queryProgressRange(from: number, to: number) {
        if (this._state.length === 0)
            return { start: 0, end: 0, states: [] as readonly TState[] };
        const start = this._layoutIndex.indexAtProgress(Math.min(from, to));
        const end = Math.min(
            this._state.length,
            this._layoutIndex.indexAtProgress(Math.max(from, to)) + 1,
        );
        return { start, end, states: this._state.slice(start, end) };
    }

    ensureProgressVisible(progress: number) {
        if (this._state.length === 0)
            return null;
        const index = this._layoutIndex.indexAtProgress(progress);
        this._mountAroundIndex(index);
        return this._mountedBlocks.get(index) ?? null;
    }

    private _getLayoutMetrics() {
        const { options } = this.muya;
        const containerWidth = this.domNode?.clientWidth || this.muya.domNode.clientWidth || 800;
        return {
            contentWidth: Math.max(160, Math.min(700, containerWidth - 100)),
            fontSize: options.fontSize,
            lineHeight: options.lineHeight,
            codeFontSize: options.codeFontSize ?? Math.max(12, options.fontSize - 2),
            wrapCodeBlocks: options.wrapCodeBlocks ?? false,
            tabSize: options.tabSize,
        };
    }

    private _listenToViewport() {
        if (!this._scrollContainer || !this._scrollEventTarget)
            return;
        this.muya.eventCenter.attachDOMEvent(
            this._scrollEventTarget,
            'scroll',
            this._handleScroll,
            { passive: true },
        );
        if (typeof ResizeObserver === 'function') {
            this._viewportResizeObserver ??= new ResizeObserver(this._handleResize);
            this._blockResizeObserver ??= new ResizeObserver(this._handleResizeEntries);
            this._viewportResizeObserver.observe(this._scrollContainer);
        }
    }

    private _initializeViewport() {
        const { scrollTop, viewportHeight } = this._getViewportMetrics();
        this._lastScrollTop = scrollTop;
        const visible = this._layoutIndex.rangeForViewport(scrollTop, viewportHeight, 0);
        this._viewportIndexes = this._rangeToSet(visible.start, visible.end);
        this._reconcileMountedBlocks();
        this._scheduleOverscan();
    }

    private _getViewportMetrics() {
        const container = this._scrollContainer ?? this.muya.domNode;
        const viewportHeight = Math.max(1, container.clientHeight || window.innerHeight || 800);
        const pageBounds = this.domNode!.getBoundingClientRect();
        if (container === document.scrollingElement) {
            return {
                scrollTop: Math.max(0, -pageBounds.top),
                viewportHeight,
            };
        }
        const containerBounds = container.getBoundingClientRect();
        const pageStart = container.scrollTop + pageBounds.top - containerBounds.top;
        return {
            scrollTop: Math.max(0, container.scrollTop - pageStart),
            viewportHeight,
        };
    }

    private _handleScroll = () => {
        if (this._scrollFrame !== null)
            return;
        this._scrollFrame = requestAnimationFrame(() => {
            this._scrollFrame = null;
            const { scrollTop, viewportHeight } = this._getViewportMetrics();
            const direction: 1 | -1 = scrollTop >= this._lastScrollTop ? 1 : -1;
            this._lastScrollTop = scrollTop;
            const visible = this._layoutIndex.rangeForViewport(scrollTop, viewportHeight, 0);
            this._viewportIndexes.clear();
            this._renderScheduler.preemptViewport(visible.start, visible.end, direction);
            this._scheduleDrain(true, this._scheduleOverscan);
        });
    };

    private _handleResize = () => {
        const { scrollTop, viewportHeight } = this._getViewportMetrics();
        this._layoutIndex.rebuild(this._state, this._getLayoutMetrics(), this._revision);
        const visible = this._layoutIndex.rangeForViewport(scrollTop, viewportHeight, 0);
        this._viewportIndexes = this._rangeToSet(visible.start, visible.end);
        this._reconcileMountedBlocks();
        this._scheduleOverscan();
    };

    private _scheduleOverscan = () => {
        const { scrollTop, viewportHeight } = this._getViewportMetrics();
        const overscan = this._layoutIndex.rangeForViewport(scrollTop, viewportHeight, viewportHeight);
        const missingBefore = this._firstMissingRange(overscan.start, overscan.end);
        if (!missingBefore)
            return;
        this._renderScheduler.enqueue(
            missingBefore.start,
            missingBefore.end,
            RenderPriority.Sequential,
            1,
        );
        this._scheduleDrain(false);
    };

    private _firstMissingRange(start: number, end: number) {
        let rangeStart = -1;
        for (let index = start; index < end; index++) {
            if (!this._viewportIndexes.has(index)) {
                if (rangeStart === -1)
                    rangeStart = index;
            }
            else if (rangeStart !== -1) {
                return { start: rangeStart, end: index };
            }
        }
        return rangeStart === -1 ? null : { start: rangeStart, end };
    }

    private _scheduleDrain(immediate: boolean, onDrained?: () => void) {
        if (this._drainHandle) {
            if (!immediate || this._drainHandle.type === 'frame')
                return;
            this._cancelDrainHandle();
        }
        const drain = () => {
            this._drainHandle = null;
            const task = this._renderScheduler.take(16);
            if (!task)
                return onDrained?.();
            for (let index = task.start; index < task.end; index++)
                this._viewportIndexes.add(index);
            this._reconcileMountedBlocks();
            if (this._renderScheduler.hasPendingTasks)
                this._scheduleDrain(task.priority <= RenderPriority.Viewport, onDrained);
            else
                onDrained?.();
        };

        if (immediate) {
            this._drainHandle = { type: 'frame', id: requestAnimationFrame(drain) };
        }
        else if (typeof requestIdleCallback === 'function') {
            this._drainHandle = {
                type: 'idle',
                id: requestIdleCallback(drain, { timeout: 250 }),
            };
        }
        else {
            this._drainHandle = { type: 'timeout', id: window.setTimeout(drain, 16) };
        }
    }

    private _cancelDrainHandle() {
        if (!this._drainHandle)
            return;
        if (this._drainHandle.type === 'frame')
            cancelAnimationFrame(this._drainHandle.id);
        else if (this._drainHandle.type === 'idle' && typeof cancelIdleCallback === 'function')
            cancelIdleCallback(this._drainHandle.id);
        else
            clearTimeout(this._drainHandle.id);
        this._drainHandle = null;
    }

    private _cancelScheduledWork() {
        if (this._scrollFrame !== null)
            cancelAnimationFrame(this._scrollFrame);
        this._scrollFrame = null;
        this._cancelDrainHandle();
        this._viewportResizeObserver?.disconnect();
        this._blockResizeObserver?.disconnect();
    }

    private _mountAroundIndex(index: number) {
        const height = this._layoutIndex.heightAt(index);
        const range = this._layoutIndex.rangeForViewport(
            this._layoutIndex.topAt(index),
            Math.max(height, this._getViewportMetrics().viewportHeight),
            0,
        );
        this._viewportIndexes = this._rangeToSet(range.start, range.end);
        this._viewportIndexes.add(index);
        this._reconcileMountedBlocks();
    }

    private _addPinnedIndex(index: number) {
        this._viewportIndexes.add(index);
        this._reconcileMountedBlocks();
    }

    private _rangeToSet(start: number, end: number) {
        const indexes = new Set<number>();
        for (let index = start; index < end; index++)
            indexes.add(index);
        return indexes;
    }

    private _shiftMountedIndexes(from: number, delta: number) {
        if (delta === 0)
            return;
        const shifted = [...this._mountedBlocks.entries()]
            .map(([index, block]) => [index >= from ? index + delta : index, block] as const)
            .filter(([index]) => index >= 0)
            .sort((a, b) => a[0] - b[0]);
        this._mountedBlocks.clear();
        for (const [index, block] of shifted) {
            this._mountedBlocks.set(index, block);
            this._blockIndexes.set(block, index);
        }
        this._viewportIndexes = new Set(
            [...this._viewportIndexes]
                .map(index => index >= from ? index + delta : index)
                .filter(index => index >= 0),
        );
    }

    private _pinnedIndexes() {
        const pinned = new Set<number>();
        const activeRoot = this.muya.editor.activeContentBlock?.outMostBlock;
        if (activeRoot) {
            const index = this._blockIndexes.get(activeRoot);
            if (index !== undefined)
                pinned.add(index);
        }
        return pinned;
    }

    private _reconcileMountedBlocks() {
        const desired = new Set([...this._viewportIndexes, ...this._pinnedIndexes()]);
        for (const [index, block] of this._mountedBlocks) {
            if (!desired.has(index)) {
                this._blockResizeObserver?.unobserve(block.domNode!);
                block.parent = null;
                this._mountedBlocks.delete(index);
            }
        }
        for (const index of desired) {
            if (!this._mountedBlocks.has(index) && this._state[index]) {
                const state = deepClone(this._state[index]);
                const block = ScrollPage.loadBlock(state.name).create(this.muya, state);
                block.parent = this;
                this._mountedBlocks.set(index, block);
                this._blockIndexes.set(block, index);
            }
        }
        this._rebuildSparseDom();
    }

    private _rebuildSparseDom() {
        const fragment = document.createDocumentFragment();
        const nextChildren = new LinkedList<TreeNode>();
        const entries = [...this._mountedBlocks.entries()].sort((a, b) => a[0] - b[0]);
        let cursor = 0;
        for (const [index, block] of entries) {
            this._appendSpacer(fragment, this._layoutIndex.topAt(index) - this._layoutIndex.topAt(cursor));
            block.prev = null;
            block.next = null;
            block.domNode!.dataset.virtualIndex = String(index);
            nextChildren.append(block);
            fragment.appendChild(block.domNode!);
            cursor = index + 1;
        }
        this._appendSpacer(
            fragment,
            this._layoutIndex.totalHeight - this._layoutIndex.topAt(cursor),
        );
        this.children = nextChildren;
        this.domNode!.replaceChildren(fragment);
        for (const [, block] of entries)
            this._blockResizeObserver?.observe(block.domNode!);
    }

    private _appendSpacer(fragment: DocumentFragment, height: number) {
        if (height <= 0)
            return;
        const spacer = document.createElement('div');
        spacer.className = 'mu-virtual-spacer';
        spacer.setAttribute('aria-hidden', 'true');
        spacer.style.height = `${height}px`;
        fragment.appendChild(spacer);
    }

    private _handleResizeEntries = (entries: ResizeObserverEntry[]) => {
        const { scrollTop } = this._getViewportMetrics();
        const viewportIndex = this._layoutIndex.indexAtOffset(scrollTop);
        let anchorDelta = 0;
        let changed = false;
        for (const entry of entries) {
            const block = [...this._mountedBlocks.entries()]
                .find(([, candidate]) => candidate.domNode === entry.target);
            if (!block)
                continue;
            const [index] = block;
            const style = getComputedStyle(entry.target);
            const marginTop = Number.parseFloat(style.marginTop) || 0;
            const marginBottom = Number.parseFloat(style.marginBottom) || 0;
            const height = (entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height)
                + marginTop
                + marginBottom;
            const delta = this._layoutIndex.updateMeasuredHeight(index, height);
            if (delta !== 0) {
                changed = true;
                if (index < viewportIndex)
                    anchorDelta += delta;
            }
        }
        if (!changed)
            return;
        if (anchorDelta !== 0 && this._scrollContainer)
            this._scrollContainer.scrollTop += anchorDelta;
        this._rebuildSparseDom();
    };

    /**
     * Find the content block by the path
     * @param {Array} path
     */
    queryBlock(path: TBlockPath) {
        if (path.length === 0)
            return this;

        const p = path.shift() as number;
        const block = this.find(p) as Parent & { queryBlock: (p: TBlockPath) => Parent | Content | undefined };
        return block && path.length ? block.queryBlock(path) : block;
    }

    updateRefLinkAndImage(label: string) {
        const REG = new RegExp(`\\[${label}\\](?!:)`);

        this.breadthFirstTraverse((node) => {
            if (node.isContent() && REG.test(node.text))
                node.update();
        });
    }

    handleBlurFromContent(block: Content) {
        this._blurFocus.blur = block;
        requestAnimationFrame(this._updateActiveStatus);
    }

    handleFocusFromContent(block: Content) {
        this._blurFocus.focus = block;
        requestAnimationFrame(this._updateActiveStatus);
    }

    private _updateActiveStatus = () => {
        const { blur, focus } = this._blurFocus;

        if (blur == null && focus == null)
            return;

        let needBlurBlocks: Parent[] = [];
        let needFocusBlocks: Parent[] = [];
        let block;

        if (blur && focus) {
            needFocusBlocks = focus.getAncestors();
            block = blur.parent;
            while (block && block.isParent && block.isParent() && !needFocusBlocks.includes(block)) {
                needBlurBlocks.push(block);
                block = block.parent;
            }
        }
        else if (blur) {
            needBlurBlocks = blur.getAncestors();
        }
        else if (focus) {
            needFocusBlocks = focus.getAncestors();
        }

        if (needBlurBlocks.length) {
            needBlurBlocks.forEach((b) => {
                b.active = false;
            });
        }

        if (needFocusBlocks.length) {
            needFocusBlocks.forEach((b) => {
                b.active = true;
            });
        }

        this._blurFocus = {
            blur: null,
            focus: null,
        };
    };

    // Create a new paragraph if click the blank area in editor.
    private _clickHandler(event: Event) {
        if (!isMouseEvent(event) || !isHTMLElement(event.target))
            return;

        const target = event.target;

        if (target[BLOCK_DOM_PROPERTY] === this) {
            const lastIndex = this._state.length - 1;
            if (lastIndex < 0)
                return;
            if (!this._mountedBlocks.has(lastIndex))
                this._addPinnedIndex(lastIndex);
            const lastChild = this._mountedBlocks.get(lastIndex);
            if (!lastChild)
                return;
            const lastContentBlock = lastChild.lastContentInDescendant()!;
            const { clientY } = event;
            const lastChildDom = lastChild.domNode;
            const { bottom } = lastChildDom!.getBoundingClientRect();

            if (clientY > bottom) {
                if (
                    lastChild.blockName === 'paragraph'
                    && lastContentBlock.text === ''
                ) {
                    lastContentBlock.setCursor(0, 0);
                }
                else {
                    const state = {
                        name: 'paragraph',
                        text: '',
                    };
                    const newNode = ScrollPage.loadBlock(state.name).create(
                        this.muya,
                        state,
                    );
                    this.append(newNode, 'user');
                    const cursorBlock = newNode.lastContentInDescendant();
                    cursorBlock.setCursor(0, 0, true);
                }
            }
        }
    }
}
