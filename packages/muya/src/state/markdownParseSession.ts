import type { IRangeTask } from '../utils/rangeScheduler';
import type { MarkdownSourceIndex } from './markdownSourceIndex';
import type { TState } from './types';
import { RangeScheduler } from '../utils/rangeScheduler';
import { MarkdownSegmentTree } from './markdownSegmentTree';

export enum MarkdownParsePriority {
    Viewport = 0,
    Sequential = 1,
}

export type IMarkdownParseTask = IRangeTask<MarkdownParsePriority>;

export interface IMarkdownParseBatch {
    task: IMarkdownParseTask | null;
    parsedSegments: number;
    remainingSegments: number;
    complete: boolean;
}

const PRIORITIES = [
    MarkdownParsePriority.Viewport,
    MarkdownParsePriority.Sequential,
];

export class MarkdownParseSession {
    private readonly _scheduler = new RangeScheduler<MarkdownParsePriority>(PRIORITIES);

    readonly segments: MarkdownSegmentTree;

    constructor(
        readonly sourceIndex: MarkdownSourceIndex,
        private readonly _parseSegmentStates: (segmentIndex: number) => readonly TState[],
    ) {
        this.segments = new MarkdownSegmentTree(sourceIndex);
        this._scheduler.reset(sourceIndex.revision);
        this._scheduleSequential();
    }

    get hasPendingTasks() {
        return this._scheduler.hasPendingTasks;
    }

    prioritizeViewport(start: number, end: number, direction: 1 | -1 = 1) {
        this._assertRange(start, end);
        this._scheduler.preempt(start, end, MarkdownParsePriority.Viewport, direction);
        this._scheduleSequential();
    }

    prioritizeProgress(from: number, to: number, direction: 1 | -1 = 1) {
        const range = this.sourceIndex.rangeForProgress(from, to);
        this.prioritizeViewport(range.start, range.end, direction);
        return range;
    }

    parseNext(maxSegments: number): IMarkdownParseBatch {
        const task = this._scheduler.take(maxSegments);
        let parsedSegments = 0;
        if (task) {
            if (task.direction === 1) {
                for (let index = task.start; index < task.end; index++)
                    parsedSegments += this._parseSegment(index);
            }
            else {
                for (let index = task.end - 1; index >= task.start; index--)
                    parsedSegments += this._parseSegment(index);
            }
        }
        const complete = this.segments.isComplete;
        if (complete)
            this._scheduler.reset(this.sourceIndex.revision);
        return {
            task,
            parsedSegments,
            remainingSegments: this.segments.length - this.segments.parsedSegments,
            complete,
        };
    }

    parseAll() {
        while (!this.segments.isComplete && this.hasPendingTasks)
            this.parseNext(256);
        return this.segments.requireCompleteStateSnapshot();
    }

    private _parseSegment(segmentIndex: number) {
        if (this.segments.isParsed(segmentIndex))
            return 0;
        const committed = this.segments.commitSegment(
            segmentIndex,
            this._parseSegmentStates(segmentIndex),
            this.sourceIndex.revision,
        );
        return committed ? 1 : 0;
    }

    private _scheduleSequential() {
        this._scheduler.enqueue(
            0,
            this.sourceIndex.length,
            MarkdownParsePriority.Sequential,
        );
    }

    private _assertRange(start: number, end: number) {
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > this.sourceIndex.length)
            throw new RangeError(`Invalid source segment range [${start}, ${end}) for ${this.sourceIndex.length} segments.`);
    }
}
