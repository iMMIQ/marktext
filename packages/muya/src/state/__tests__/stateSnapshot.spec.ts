// @vitest-environment happy-dom

import type { Muya } from '../../muya';
import type { IJSONChangePayload } from '../index';
import * as json1 from 'ot-json1';
import { describe, expect, it, vi } from 'vitest';
import JSONState from '../index';

function createState(markdown = 'before\n') {
    let listener: ((payload: IJSONChangePayload) => void) | null = null;
    const muya = {
        options: {
            fontSize: 16,
            lineHeight: 1.6,
            codeFontSize: 14,
            wrapCodeBlocks: false,
            tabSize: 4,
            footnote: false,
            isGitlabCompatibilityEnabled: false,
            trimUnnecessaryCodeBlockEmptyLines: false,
            frontMatter: false,
            math: true,
            listIndentation: 1,
        },
        eventCenter: {
            emit: (_event: string, payload: IJSONChangePayload) => listener?.(payload),
        },
    } as unknown as Muya;
    return {
        state: new JSONState(muya, markdown),
        listen(next: (payload: IJSONChangePayload) => void) {
            listener = next;
        },
    };
}

describe('jsonState snapshots', () => {
    it('keeps persistent before/after roots without cloning when internal consumers use snapshots', () => {
        const { state, listen } = createState();
        const clone = vi.spyOn(globalThis, 'structuredClone');
        let payload: IJSONChangePayload | null = null;
        listen((next) => {
            payload = next;
        });

        state.dispatch(json1.editOp([0, 'text'], 'text-unicode', [6, ' after']), 'test');

        expect(clone).not.toHaveBeenCalled();
        expect(payload!.prevStateSnapshot[0]).toMatchObject({ text: 'before' });
        expect(payload!.stateSnapshot[0]).toMatchObject({ text: 'before after' });
    });

    it('preserves defensive copies for the public state and event payload', () => {
        const { state, listen } = createState();
        let payload: IJSONChangePayload | null = null;
        listen((next) => {
            payload = next;
        });
        state.dispatch(json1.editOp([0, 'text'], 'text-unicode', [6, ' after']), 'test');

        const publicState = state.getState() as Array<{ text: string }>;
        const eventState = payload!.doc as Array<{ text: string }>;
        publicState[0].text = 'mutated';
        eventState[0].text = 'also mutated';

        expect(state.getState()).toMatchObject([{ text: 'before after' }]);
        expect(payload!.stateSnapshot[0]).toMatchObject({ text: 'before after' });
    });
});
