import type { MarkdownSourceIndex } from './markdownSourceIndex';
import type { IMarkdownToStateOptions } from './markdownToState';
import type { TState } from './types';
import { MarkdownToState } from './markdownToState';

export interface IParsedSourceSegment {
    revision: number;
    candidateIndex: number;
    sourceFrom: number;
    sourceTo: number;
    states: TState[];
}

export interface IParsedSourceRange {
    revision: number;
    start: number;
    end: number;
    segments: IParsedSourceSegment[];
    states: TState[];
}

export class MarkdownSourceParser {
    private readonly _parser: MarkdownToState;

    constructor(options: IMarkdownToStateOptions) {
        this._parser = new MarkdownToState(options);
    }

    parseSegment(index: MarkdownSourceIndex, candidateIndex: number): IParsedSourceSegment {
        const sourceFrom = index.sourceFromAt(candidateIndex);
        const sourceTo = index.sourceToAt(candidateIndex);
        return {
            revision: index.revision,
            candidateIndex,
            sourceFrom,
            sourceTo,
            states: this._parser.generate(index.snapshot.slice(sourceFrom, sourceTo)),
        };
    }

    parseAllStates(index: MarkdownSourceIndex) {
        const states: TState[] = [];
        for (let candidateIndex = 0; candidateIndex < index.length; candidateIndex++) {
            const from = index.sourceFromAt(candidateIndex);
            const to = index.sourceToAt(candidateIndex);
            states.push(...this._parser.generate(index.snapshot.slice(from, to)));
        }
        return states;
    }

    parseRange(index: MarkdownSourceIndex, start = 0, end = index.length): IParsedSourceRange {
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > index.length)
            throw new RangeError(`Invalid source candidate range [${start}, ${end}) for ${index.length} candidates.`);
        const segments: IParsedSourceSegment[] = [];
        const states: TState[] = [];
        for (let candidateIndex = start; candidateIndex < end; candidateIndex++) {
            const segment = this.parseSegment(index, candidateIndex);
            segments.push(segment);
            states.push(...segment.states);
        }
        return { revision: index.revision, start, end, segments, states };
    }
}
