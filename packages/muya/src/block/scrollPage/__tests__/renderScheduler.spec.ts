import { describe, expect, it } from 'vitest';
import { RenderPriority, RenderScheduler } from '../renderScheduler';

describe('renderScheduler', () => {
    it('drains ranges in priority order and bounded slices', () => {
        const scheduler = new RenderScheduler();
        scheduler.reset(3);
        scheduler.enqueue(10, 30, RenderPriority.Sequential);
        scheduler.enqueue(4, 8, RenderPriority.Viewport);

        expect(scheduler.take(3)).toMatchObject({
            start: 4,
            end: 7,
            priority: RenderPriority.Viewport,
        });
        expect(scheduler.take(3)).toMatchObject({ start: 7, end: 8 });
        expect(scheduler.take(3)).toMatchObject({ start: 10, end: 13 });
    });

    it('preempts old work without retaining per-block tasks', () => {
        const scheduler = new RenderScheduler();
        scheduler.reset(1);
        scheduler.enqueue(0, 100_000, RenderPriority.Sequential);
        const oldTask = scheduler.take(10)!;

        scheduler.preemptViewport(50_000, 50_020);

        expect(scheduler.isCurrent(oldTask)).toBe(false);
        expect(scheduler.take(100)).toMatchObject({
            start: 50_000,
            end: 50_020,
            priority: RenderPriority.Viewport,
        });
        expect(scheduler.hasPendingTasks).toBe(false);
    });

    it('invalidates every queued task when the document revision changes', () => {
        const scheduler = new RenderScheduler();
        scheduler.reset(1);
        scheduler.enqueue(0, 10, RenderPriority.Overscan);
        scheduler.reset(2);

        expect(scheduler.take(10)).toBeNull();
        expect(scheduler.revision).toBe(2);
    });
});
