const DEFAULT_PAGE_SIZE = 256;

function arrayIndex(property: PropertyKey) {
    if (typeof property !== 'string' || !/^(?:0|[1-9]\d*)$/.test(property))
        return null;
    const index = Number(property);
    return Number.isSafeInteger(index) ? index : null;
}

function emptyPage<T>(length: number) {
    const page: Array<T | undefined> = [];
    page.length = length;
    return page;
}

function arrayView<T>(state: SparseState<T>): readonly T[] {
    const target: T[] = [];
    return new Proxy(target, {
        get(_target, property, receiver) {
            if (property === 'length')
                return state.length;
            if (property === Symbol.iterator)
                return state[Symbol.iterator].bind(state);
            if (property === 'forEach')
                return state.forEach.bind(state);
            if (property === 'slice')
                return state.slice.bind(state);
            if (property === 'at')
                return state.at.bind(state);
            const index = arrayIndex(property);
            if (index !== null)
                return state.at(index);
            return Reflect.get(target, property, receiver);
        },
        has(target, property) {
            const index = arrayIndex(property);
            return index === null ? Reflect.has(target, property) : state.has(index);
        },
    });
}

/** Persistent sparse array optimized for partially parsed documents. */
export class SparseState<T> {
    private readonly _array: readonly T[];

    private constructor(
        readonly length: number,
        private readonly _pages: ReadonlyMap<number, readonly (T | undefined)[]>,
        readonly pageSize = DEFAULT_PAGE_SIZE,
    ) {
        this._array = arrayView(this);
    }

    static empty<T>(length: number, pageSize = DEFAULT_PAGE_SIZE) {
        if (!Number.isSafeInteger(length) || length < 0)
            throw new RangeError(`Invalid sparse state length ${length}.`);
        return new SparseState<T>(length, new Map(), pageSize);
    }

    static fromArray<T>(state: readonly T[], pageSize = DEFAULT_PAGE_SIZE) {
        const pages = new Map<number, (T | undefined)[]>();
        state.forEach((value, index) => {
            const pageIndex = Math.floor(index / pageSize);
            let page = pages.get(pageIndex);
            if (!page) {
                page = emptyPage<T>(pageSize);
                pages.set(pageIndex, page);
            }
            page[index % pageSize] = value;
        });
        return new SparseState<T>(state.length, pages, pageSize);
    }

    asArray() {
        return this._array;
    }

    at(index: number) {
        if (index < 0)
            index += this.length;
        if (!Number.isInteger(index) || index < 0 || index >= this.length)
            return undefined;
        return this._pages.get(Math.floor(index / this.pageSize))?.[index % this.pageSize];
    }

    has(index: number) {
        return this.at(index) !== undefined;
    }

    withUpdates(updates: Iterable<readonly [number, T]>) {
        const pages = new Map(this._pages);
        const copied = new Set<number>();
        for (const [index, value] of updates) {
            if (!Number.isInteger(index) || index < 0 || index >= this.length)
                throw new RangeError(`Invalid sparse state index ${index} for ${this.length} records.`);
            const pageIndex = Math.floor(index / this.pageSize);
            let page = pages.get(pageIndex);
            if (!copied.has(pageIndex)) {
                page = page ? Array.from(page) : emptyPage<T>(this.pageSize);
                pages.set(pageIndex, page);
                copied.add(pageIndex);
            }
            (page as (T | undefined)[])[index % this.pageSize] = value;
        }
        return new SparseState<T>(this.length, pages, this.pageSize);
    }

    /** Fill previously empty parse slots without changing an existing value. */
    hydrate(updates: Iterable<readonly [number, T]>) {
        const pages = this._pages as Map<number, (T | undefined)[]>;
        for (const [index, value] of updates) {
            if (!Number.isInteger(index) || index < 0 || index >= this.length)
                throw new RangeError(`Invalid sparse hydration index ${index} for ${this.length} records.`);
            const pageIndex = Math.floor(index / this.pageSize);
            let page = pages.get(pageIndex);
            if (!page) {
                page = emptyPage<T>(this.pageSize);
                pages.set(pageIndex, page);
            }
            const offset = index % this.pageSize;
            if (page[offset] === undefined)
                page[offset] = value;
        }
        return this;
    }

    splice(start: number, removed: number, inserted: readonly T[]) {
        if (!Number.isInteger(start) || start < 0 || start > this.length)
            throw new RangeError(`Invalid sparse splice index ${start} for ${this.length} records.`);
        if (!Number.isInteger(removed) || removed < 0 || start + removed > this.length)
            throw new RangeError(`Invalid sparse removal count ${removed} at ${start}.`);
        if (removed === inserted.length) {
            return this.withUpdates(inserted.map((value, offset) => [start + offset, value] as const));
        }

        const delta = inserted.length - removed;
        const nextLength = this.length + delta;
        const pages = new Map<number, (T | undefined)[]>();
        const set = (index: number, value: T) => {
            const pageIndex = Math.floor(index / this.pageSize);
            let page = pages.get(pageIndex);
            if (!page) {
                page = emptyPage<T>(this.pageSize);
                pages.set(pageIndex, page);
            }
            page[index % this.pageSize] = value;
        };
        this.forEachDefined((value, index) => {
            if (index < start)
                set(index, value);
            else if (index >= start + removed)
                set(index + delta, value);
        });
        for (let offset = 0; offset < inserted.length; offset++)
            set(start + offset, inserted[offset]);
        return new SparseState<T>(nextLength, pages, this.pageSize);
    }

    forEach(visitor: (value: T, index: number, state: readonly T[]) => void, thisArg?: unknown) {
        this.forEachDefined((value, index) => visitor.call(thisArg, value, index, this._array));
    }

    forEachDefined(visitor: (value: T, index: number) => void) {
        const pageIndexes = [...this._pages.keys()].sort((a, b) => a - b);
        for (const pageIndex of pageIndexes) {
            const page = this._pages.get(pageIndex)!;
            const base = pageIndex * this.pageSize;
            for (let offset = 0; offset < page.length; offset++) {
                const index = base + offset;
                const value = page[offset];
                if (index < this.length && value !== undefined)
                    visitor(value, index);
            }
        }
    }

    slice(start = 0, end = this.length) {
        const normalizedStart = start < 0
            ? Math.max(0, this.length + start)
            : Math.min(this.length, start);
        const normalizedEnd = end < 0
            ? Math.max(0, this.length + end)
            : Math.min(this.length, end);
        const length = Math.max(0, normalizedEnd - normalizedStart);
        const result: T[] = [];
        result.length = length;
        this.forEachDefined((value, index) => {
            if (index >= normalizedStart && index < normalizedEnd)
                result[index - normalizedStart] = value;
        });
        return result;
    }

    toArray() {
        return this.slice();
    }

    * [Symbol.iterator](): IterableIterator<T> {
        for (let index = 0; index < this.length; index++)
            yield this.at(index) as T;
    }
}
