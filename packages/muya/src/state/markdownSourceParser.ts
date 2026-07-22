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
        const record = index.recordAt(candidateIndex);
        if (!record)
            throw new RangeError(`Invalid source candidate ${candidateIndex} for ${index.length} candidates.`);
        return {
            revision: index.revision,
            candidateIndex,
            sourceFrom: record.from,
            sourceTo: record.to,
            states: this._parser.generate(index.sourceForRange(candidateIndex, candidateIndex + 1)),
        };
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
