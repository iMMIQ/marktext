import type Content from '../block/base/content';
import type Parent from '../block/base/parent';
import type { Muya } from '../muya';
import type { TState } from './types';
import { tokenizer, tokensToPlainText } from '../inlineRenderer/lexer';
import { getUniqueId } from '../utils';
import { generateGithubSlug } from '../utils/slug';

export interface ITocItem {
    content: string;
    lvl: number;
    slug: string;
    githubSlug: string;
}

interface IHeadingBlock extends Parent {
    meta: { level: number };
}

const slugCache = new WeakMap<Parent, string>();
const stateSlugCache = new WeakMap<TState, string>();

export function stableSlug(block: Parent): string {
    let slug = slugCache.get(block);
    if (slug == null) {
        slug = getUniqueId();
        slugCache.set(block, slug);
    }
    return slug;
}

function stableStateSlug(state: TState) {
    let slug = stateSlugCache.get(state);
    if (slug == null) {
        slug = getUniqueId();
        stateSlugCache.set(state, slug);
    }
    return slug;
}

function createTocItem(
    blockName: 'atx-heading' | 'setext-heading',
    text: string,
    level: number,
    slug: string,
    muya: Muya,
): ITocItem {
    const source = blockName === 'setext-heading'
        ? text.trim()
        : text.replace(/^\s*#{1,6}\s+/, '').trim();
    const { superSubScript, footnote } = muya.options;
    const content = tokensToPlainText(
        tokenizer(source, {
            hasBeginRules: false,
            options: { superSubScript, footnote },
        }),
    ).trim();
    return {
        content,
        lvl: level,
        slug,
        githubSlug: generateGithubSlug(content),
    };
}

export function getTOC(muya: Muya): ITocItem[] {
    const { scrollPage } = muya.editor;
    if (!scrollPage)
        return [];

    const items: ITocItem[] = [];
    const { jsonState } = muya.editor;
    if (jsonState.isSourceBacked) {
        jsonState.ensureHeadings();
        jsonState.forEachParsedStateInSourceOrder((state) => {
            if (state.name !== 'atx-heading' && state.name !== 'setext-heading')
                return;
            items.push(createTocItem(
                state.name,
                state.text,
                state.meta.level,
                stableStateSlug(state),
                muya,
            ));
        });
        return items;
    }

    for (const node of scrollPage.children.iterator()) {
        const { blockName } = node;
        if (blockName !== 'atx-heading' && blockName !== 'setext-heading')
            continue;

        const block = node as IHeadingBlock;
        const head = block.children.head as Content | null;
        const text = head?.text ?? '';

        // Show and slug the heading by its rendered text — inline markdown
        // stripped to what a reader sees — instead of the raw source (#4811).
        items.push(createTocItem(
            blockName,
            text,
            block.meta.level,
            stableSlug(block),
            muya,
        ));
    }

    return items;
}
