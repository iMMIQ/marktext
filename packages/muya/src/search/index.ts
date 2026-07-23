import type Content from '../block/base/content';
import type { TBlockPath } from '../block/types';
import type { IHighlight } from '../inlineRenderer/types';
import type { Muya } from '../muya';
import type { IMatch } from './types';
import diff from 'fast-diff';
import { DEFAULT_SEARCH_OPTIONS } from '../config';
import { diffToTextOp } from '../utils';
import { buildRegexValue, matchString } from '../utils/search';

export class Search {
    private _value: string = '';
    public matches: IMatch[] = [];
    public index: number = -1;
    private _textByPath = new Map<string, string>();

    get value() {
        return this._value;
    }

    private get _scrollPage() {
        return this._muya.editor.scrollPage;
    }

    constructor(private _muya: Muya) {}

    // Drop match state when the document is replaced (e.g. a tab switch), so
    // stale logical paths don't resolve into the replacement document (#1932).
    reset() {
        this._updateMatches(true, false);
        this._value = '';
        this.matches = [];
        this.index = -1;
        this._textByPath.clear();
    }

    private _pathKey(path: TBlockPath) {
        return JSON.stringify(path);
    }

    private _queryMatch(match: IMatch, mount: boolean) {
        const block = mount
            ? this._scrollPage?.queryBlock([...match.path])
            : this._scrollPage?.queryMountedBlock([...match.path]);
        return block?.isContent() ? block : null;
    }

    private _updateMatches(isClear = false, updateFocus = true) {
        const { matches, index } = this;
        const len = matches.length;
        const matchesMap = new Map<Content, IHighlight[]>();

        for (let i = 0; i < len; i++) {
            const { start, end } = matches[i];
            const block = this._queryMatch(matches[i], false);
            if (!block)
                continue;
            const active = i === index;
            const highlight: IHighlight = { start, end, active };
            const highlights = matchesMap.get(block);

            if (matchesMap.has(block) && Array.isArray(highlights)) {
                highlights.push(highlight);
                matchesMap.set(block, highlights);
            }
            else {
                matchesMap.set(block, [highlight]);
            }
        }

        for (const [block, highlights] of matchesMap.entries()) {
            const isActive = highlights.some(h => h.active);

            block.update(undefined, isClear ? [] : highlights);

            if (updateFocus && block.parent?.active && !isActive)
                block.blurHandler();

            if (updateFocus && isActive && !isClear)
                block.focusHandler();
        }
    }

    refreshMountedHighlights() {
        if (this.matches.length)
            this._updateMatches(false, false);
    }

    private _innerReplace(matches: IMatch[], replacement: (match: IMatch) => string) {
        if (!matches.length)
            return;

        const grouped = new Map<string, { path: TBlockPath; matches: IMatch[] }>();
        for (const match of matches) {
            const key = this._pathKey(match.path);
            const group = grouped.get(key) ?? { path: match.path, matches: [] };
            group.matches.push(match);
            grouped.set(key, group);
        }

        for (const [key, { path, matches: blockMatches }] of grouped) {
            const oldText = this._textByPath.get(key);
            if (oldText === undefined)
                continue;
            let nextText = '';
            let lastEnd = 0;
            for (const match of blockMatches) {
                nextText += oldText.substring(lastEnd, match.start);
                nextText += replacement(match);
                lastEnd = match.end;
            }
            nextText += oldText.substring(lastEnd);
            if (nextText === oldText)
                continue;

            const mounted = this._scrollPage?.queryMountedBlock([...path]);
            if (mounted?.isContent()) {
                mounted.text = nextText;
                if (
                    mounted.blockName === 'language-input'
                    && mounted.parent
                    && 'lang' in mounted.parent
                ) {
                    mounted.parent.lang = nextText;
                }
            }
            else {
                this._muya.editor.jsonState.editOperation(path, diffToTextOp(diff(oldText, nextText)));
            }
        }
        this._muya.editor.jsonState.flush();
    }

    replace(replaceValue: string, opt = { isSingle: true, isRegexp: false }) {
        const { isSingle, isRegexp, ...rest } = opt;
        const options = Object.assign({}, DEFAULT_SEARCH_OPTIONS, rest);
        const { matches, index } = this;
        const value = this._value;

        if (matches.length) {
            const replacement = isRegexp
                ? (match: IMatch) => buildRegexValue(match, replaceValue)
                : () => replaceValue;
            if (isSingle) {
                // replace one
                this._innerReplace([matches[index] ?? matches[0]], replacement);
            }
            else {
                // replace all
                this._innerReplace(matches, replacement);
            }
            const highlightIndex = index < matches.length - 1 ? index : index - 1;

            this.search(value, {
                ...options,
                highlightIndex: isSingle ? highlightIndex : -1,
            });
        }

        return this;
    }

    /**
     * Find preview or next value, and highlight it.
     * @param {string} action : previous or next.
     */
    find(action: 'previous' | 'next'): this {
        const { matches } = this;
        let { index } = this;
        const len = matches.length;

        if (!len)
            return this;

        index = action === 'next' ? index + 1 : index - 1;

        if (index < 0)
            index = len - 1;

        if (index >= len)
            index = 0;

        this.index = index;

        this._updateMatches(true);
        const match = matches[index];
        const block = this._queryMatch(match, true);
        block?.outMostBlock?.domNode?.scrollIntoView?.({ block: 'center' });
        this._updateMatches();

        return this;
    }

    /**
     * Search value in current document.
     * @param {string} value
     * @param {object} opts
     */
    search(value: string, opts = {}) {
        const matches: IMatch[] = [];
        const textByPath = new Map<string, string>();
        const options = Object.assign({}, DEFAULT_SEARCH_OPTIONS, opts);
        const { highlightIndex, selectHighlight } = options;
        let index = -1;

        // The currently active match, captured before it is cleared below, so a
        // `selectHighlight` request can drop the cursor back onto it when the
        // new search has no match of its own (e.g. closing the search bar).
        const prevActiveMatch = this.matches[this.index];

        // Empty last search.
        this._updateMatches(true);

        // Highlight current search.
        if (value) {
            this._muya.editor.jsonState.forEachTextState((text, path) => {
                if (!text)
                    return;
                const blockPath = [...path] as TBlockPath;
                textByPath.set(this._pathKey(blockPath), text);
                const strMatches = matchString(text, value, options);
                matches.push(
                    ...strMatches.map(({ index, match, subMatches }) => ({
                        path: blockPath,
                        start: index,
                        end: index + match.length,
                        match,
                        subMatches,
                    })),
                );
            });
        }

        if (highlightIndex !== -1) {
            // If set the highlight index, then highlight the highlighIndex
            index = highlightIndex;
        }
        else if (matches.length) {
            // highlight the first word that matches.
            index = 0;
        }

        Object.assign(this, { _value: value, matches, index, _textByPath: textByPath });

        this._updateMatches();

        // Restore the editor cursor onto the active match. Mirrors muyajs's
        // `render(selectHighlight)` -> `setCursor()` path: closing the search
        // bar empties the search with `selectHighlight`, which must place the
        // cursor where the highlight was so the user can keep typing there.
        if (selectHighlight) {
            const activeMatch = matches[index] ?? prevActiveMatch;
            if (activeMatch) {
                const { start, end } = activeMatch;
                const block = this._queryMatch(activeMatch, true);
                block?.outMostBlock?.domNode?.scrollIntoView?.({ block: 'center' });
                block?.setCursor(start, end, true);
            }
        }

        return this;
    }
}
