import type { IRangeTask } from '../../utils/rangeScheduler';
import { RangeScheduler } from '../../utils/rangeScheduler';

export enum RenderPriority {
    Cursor = 0,
    Viewport = 1,
    Overscan = 2,
    Sequential = 3,
}

export type IRenderTask = IRangeTask<RenderPriority>;

const PRIORITIES = [
    RenderPriority.Cursor,
    RenderPriority.Viewport,
    RenderPriority.Overscan,
    RenderPriority.Sequential,
];

export class RenderScheduler extends RangeScheduler<RenderPriority> {
    constructor() {
        super(PRIORITIES);
    }

    preemptViewport(start: number, end: number, direction: 1 | -1 = 1) {
        this.preempt(start, end, RenderPriority.Viewport, direction);
    }
}
