export interface IRangeTask<TPriority extends number> {
    start: number;
    end: number;
    priority: TPriority;
    revision: number;
    generation: number;
    direction: 1 | -1;
}

export class RangeScheduler<TPriority extends number> {
    private readonly _queues: Map<TPriority, Array<IRangeTask<TPriority>>>;
    private _revision = 0;
    private _generation = 0;

    constructor(private readonly _priorities: readonly TPriority[]) {
        this._queues = new Map(
            _priorities.map(priority => [priority, []]),
        );
    }

    get revision() {
        return this._revision;
    }

    get generation() {
        return this._generation;
    }

    get hasPendingTasks() {
        return this._priorities.some(priority => this._queues.get(priority)!.length > 0);
    }

    reset(revision: number) {
        this._revision = revision;
        this._generation++;
        this._clearQueues();
    }

    enqueue(
        start: number,
        end: number,
        priority: TPriority,
        direction: 1 | -1 = 1,
    ) {
        if (start >= end)
            return;
        const queue = this._queues.get(priority);
        if (!queue)
            throw new RangeError(`Unknown range priority: ${priority}`);
        const task: IRangeTask<TPriority> = {
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

    preempt(
        start: number,
        end: number,
        priority: TPriority,
        direction: 1 | -1 = 1,
    ) {
        this._generation++;
        this._clearQueues();
        this.enqueue(start, end, priority, direction);
    }

    take(maxItems: number): IRangeTask<TPriority> | null {
        const itemBudget = Math.max(1, Math.floor(maxItems));
        for (const priority of this._priorities) {
            const queue = this._queues.get(priority)!;
            while (queue.length) {
                const task = queue[0];
                if (!this.isCurrent(task)) {
                    queue.shift();
                    continue;
                }

                const length = task.end - task.start;
                if (length <= itemBudget) {
                    queue.shift();
                    return task;
                }

                if (task.direction === 1) {
                    const slice = { ...task, end: task.start + itemBudget };
                    task.start = slice.end;
                    return slice;
                }
                const slice = { ...task, start: task.end - itemBudget };
                task.end = slice.start;
                return slice;
            }
        }
        return null;
    }

    isCurrent(task: Pick<IRangeTask<TPriority>, 'revision' | 'generation'>) {
        return task.revision === this._revision && task.generation === this._generation;
    }

    private _clearQueues() {
        for (const queue of this._queues.values())
            queue.length = 0;
    }
}
