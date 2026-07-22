export enum RenderPriority {
    Cursor = 0,
    Viewport = 1,
    Overscan = 2,
    Sequential = 3,
}

export interface IRenderTask {
    start: number;
    end: number;
    priority: RenderPriority;
    revision: number;
    generation: number;
    direction: 1 | -1;
}

const PRIORITIES = [
    RenderPriority.Cursor,
    RenderPriority.Viewport,
    RenderPriority.Overscan,
    RenderPriority.Sequential,
];

export class RenderScheduler {
    private readonly _queues = new Map<RenderPriority, IRenderTask[]>(
        PRIORITIES.map(priority => [priority, []]),
    );

    private _revision = 0;
    private _generation = 0;

    get revision() {
        return this._revision;
    }

    get generation() {
        return this._generation;
    }

    get hasPendingTasks() {
        return PRIORITIES.some(priority => this._queues.get(priority)!.length > 0);
    }

    reset(revision: number) {
        this._revision = revision;
        this._generation++;
        this._clearQueues();
    }

    enqueue(
        start: number,
        end: number,
        priority: RenderPriority,
        direction: 1 | -1 = 1,
    ) {
        if (start >= end)
            return;
        const queue = this._queues.get(priority)!;
        const task: IRenderTask = {
            start,
            end,
            priority,
            revision: this._revision,
            generation: this._generation,
            direction,
        };

        const last = queue[queue.length - 1];
        if (
            last
            && last.revision === task.revision
            && last.generation === task.generation
            && last.direction === task.direction
            && task.start <= last.end
            && task.end >= last.start
        ) {
            last.start = Math.min(last.start, task.start);
            last.end = Math.max(last.end, task.end);
            return;
        }
        queue.push(task);
    }

    preemptViewport(start: number, end: number, direction: 1 | -1 = 1) {
        this._generation++;
        this._clearQueues();
        this.enqueue(start, end, RenderPriority.Viewport, direction);
    }

    take(maxBlocks: number): IRenderTask | null {
        const blockBudget = Math.max(1, Math.floor(maxBlocks));
        for (const priority of PRIORITIES) {
            const queue = this._queues.get(priority)!;
            while (queue.length) {
                const task = queue[0];
                if (!this.isCurrent(task)) {
                    queue.shift();
                    continue;
                }

                const length = task.end - task.start;
                if (length <= blockBudget) {
                    queue.shift();
                    return task;
                }

                if (task.direction === 1) {
                    const slice = { ...task, end: task.start + blockBudget };
                    task.start = slice.end;
                    return slice;
                }
                const slice = { ...task, start: task.end - blockBudget };
                task.end = slice.start;
                return slice;
            }
        }
        return null;
    }

    isCurrent(task: Pick<IRenderTask, 'revision' | 'generation'>) {
        return task.revision === this._revision && task.generation === this._generation;
    }

    private _clearQueues() {
        for (const queue of this._queues.values())
            queue.length = 0;
    }
}
