type SequenceNode = ISequenceBranch | ISequenceLeaf;

export type MeasureStorage = 'float64' | 'uint32' | 'uint8';

type MeasureArray = Float64Array | Uint32Array | Uint8Array;

interface ISequenceLeaf {
    kind: 'leaf';
    parent: ISequenceBranch | null;
    length: number;
    values: MeasureArray[];
    totals: Float64Array;
}

interface ISequenceBranch {
    kind: 'branch';
    parent: ISequenceBranch | null;
    children: SequenceNode[];
    lengthEnds: Uint32Array;
    length: number;
    totals: Float64Array;
}

export type MeasureReader = (index: number, measure: number) => number;

function exceedsWithRoundingTolerance(value: number, remaining: number, originalOffset: number) {
    const tolerance = Number.EPSILON * 16 * Math.max(
        1,
        Math.abs(value),
        Math.abs(remaining),
        Math.abs(originalOffset),
    );
    return value - remaining > tolerance;
}

/**
 * A compact B+ sequence whose internal nodes aggregate every numeric column.
 *
 * Records live only in typed-array leaf pages. Rank and measured-offset
 * lookups descend the same tree, so local splices do not require rebuilding a
 * document-sized side index.
 */
export class PagedMeasuredSequence {
    private _root: SequenceNode | null = null;

    readonly storageTypes: readonly MeasureStorage[];

    constructor(
        readonly measureCount: number,
        readonly pageCapacity = 256,
        readonly branchCapacity = 32,
        storageTypes: readonly MeasureStorage[] = [],
    ) {
        if (!Number.isInteger(measureCount) || measureCount < 1)
            throw new RangeError('measureCount must be a positive integer.');
        if (!Number.isInteger(pageCapacity) || pageCapacity < 4)
            throw new RangeError('pageCapacity must be at least 4.');
        if (!Number.isInteger(branchCapacity) || branchCapacity < 4)
            throw new RangeError('branchCapacity must be at least 4.');
        if (storageTypes.length !== 0 && storageTypes.length !== measureCount)
            throw new RangeError(`Expected ${measureCount} storage types, received ${storageTypes.length}.`);
        this.storageTypes = storageTypes.length === 0
            ? Array.from({ length: measureCount }, () => 'float64' as const)
            : Array.from(storageTypes);
    }

    get length() {
        return this._root?.length ?? 0;
    }

    get storageBytes() {
        if (!this._root)
            return 0;
        let bytes = 0;
        const pending = [this._root];
        while (pending.length > 0) {
            const node = pending.pop()!;
            bytes += node.totals.byteLength;
            if (node.kind === 'leaf') {
                for (const values of node.values)
                    bytes += values.byteLength;
            }
            else {
                bytes += node.lengthEnds.byteLength;
                pending.push(...node.children);
            }
        }
        return bytes;
    }

    build(length: number, read: MeasureReader) {
        this._assertLength(length);
        if (length === 0) {
            this._root = null;
            return;
        }

        const leaves: SequenceNode[] = [];
        for (let start = 0; start < length; start += this.pageCapacity) {
            const leafLength = Math.min(this.pageCapacity, length - start);
            const leaf = this._createLeaf(leafLength);
            for (let localIndex = 0; localIndex < leafLength; localIndex++) {
                for (let measure = 0; measure < this.measureCount; measure++)
                    leaf.values[measure][localIndex] = read(start + localIndex, measure);
            }
            this._refreshLeaf(leaf);
            leaves.push(leaf);
        }
        this._root = this._buildTree(leaves);
    }

    measureAt(index: number, measure: number) {
        this._assertIndex(index);
        this._assertMeasure(measure);
        const { leaf, offset } = this._findLeaf(index);
        return leaf.values[measure][offset];
    }

    recordAt(index: number, target = new Float64Array(this.measureCount)) {
        this._assertIndex(index);
        if (target.length < this.measureCount)
            throw new RangeError(`Record target needs ${this.measureCount} entries.`);
        const { leaf, offset } = this._findLeaf(index);
        for (let measure = 0; measure < this.measureCount; measure++)
            target[measure] = leaf.values[measure][offset];
        return target;
    }

    setMeasure(index: number, measure: number, value: number) {
        this._assertIndex(index);
        this._assertMeasure(measure);
        if (!Number.isFinite(value))
            throw new RangeError('Sequence measures must be finite.');
        this._assertStoredValue(measure, value);
        const { leaf, offset } = this._findLeaf(index);
        const delta = value - leaf.values[measure][offset];
        if (delta === 0)
            return 0;
        leaf.values[measure][offset] = value;
        leaf.totals[measure] += delta;
        for (let parent = leaf.parent; parent; parent = parent.parent)
            parent.totals[measure] += delta;
        return delta;
    }

    total(measure: number) {
        this._assertMeasure(measure);
        return this._root?.totals[measure] ?? 0;
    }

    prefixMeasures(count: number, target = new Float64Array(this.measureCount)) {
        if (!Number.isInteger(count) || count < 0 || count > this.length)
            throw new RangeError(`Invalid prefix length ${count} for ${this.length} records.`);
        if (target.length < this.measureCount)
            throw new RangeError(`Prefix target needs ${this.measureCount} entries.`);
        target.fill(0);
        let node = this._root;
        let remaining = count;
        while (node && node.kind === 'branch') {
            let child: SequenceNode | null = null;
            for (const candidate of node.children) {
                if (remaining >= candidate.length) {
                    this._addTotals(target, candidate.totals);
                    remaining -= candidate.length;
                }
                else {
                    child = candidate;
                    break;
                }
            }
            if (!child)
                return target;
            node = child;
        }
        if (node) {
            for (let index = 0; index < remaining; index++) {
                for (let measure = 0; measure < this.measureCount; measure++)
                    target[measure] += node.values[measure][index];
            }
        }
        return target;
    }

    prefixMeasure(count: number, measure: number) {
        if (!Number.isInteger(count) || count < 0 || count > this.length)
            throw new RangeError(`Invalid prefix length ${count} for ${this.length} records.`);
        this._assertMeasure(measure);
        let total = 0;
        let node = this._root;
        let remaining = count;
        while (node && node.kind === 'branch') {
            const childIndex = this._childIndexAtRank(node, remaining);
            for (let index = 0; index < childIndex; index++)
                total += node.children[index].totals[measure];
            const previousLength = childIndex === 0 ? 0 : node.lengthEnds[childIndex - 1];
            remaining -= previousLength;
            node = childIndex < node.children.length ? node.children[childIndex] : null;
        }
        if (node) {
            const values = node.values[measure];
            for (let index = 0; index < remaining; index++)
                total += values[index];
        }
        return total;
    }

    selectByMeasure(measure: number, offset: number) {
        this._assertMeasure(measure);
        if (!this._root)
            return 0;

        let node = this._root;
        let rank = 0;
        let remaining = Math.max(0, offset);
        while (node.kind === 'branch') {
            let selected = node.children[node.children.length - 1];
            for (const child of node.children) {
                if (exceedsWithRoundingTolerance(child.totals[measure], remaining, offset)) {
                    selected = child;
                    break;
                }
                rank += child.length;
                remaining -= child.totals[measure];
            }
            node = selected;
        }
        for (let index = 0; index < node.length; index++) {
            const value = node.values[measure][index];
            if (exceedsWithRoundingTolerance(value, remaining, offset))
                return Math.min(this.length - 1, rank + index);
            remaining -= value;
        }
        return this.length - 1;
    }

    iterateRange(
        start: number,
        end: number,
        visitor: (index: number, record: Float64Array) => void,
    ) {
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > this.length)
            throw new RangeError(`Invalid sequence range [${start}, ${end}) for ${this.length} records.`);
        if (start === end)
            return;
        let { leaf, offset } = this._findLeaf(start);
        let index = start;
        const record = new Float64Array(this.measureCount);
        while (index < end) {
            for (; offset < leaf.length && index < end; offset++, index++) {
                for (let measure = 0; measure < this.measureCount; measure++)
                    record[measure] = leaf.values[measure][offset];
                visitor(index, record);
            }
            if (index < end) {
                leaf = this._nextLeaf(leaf)!;
                offset = 0;
            }
        }
    }

    splice(index: number, removed: number, inserted: number, read: MeasureReader) {
        if (!Number.isInteger(index) || index < 0 || index > this.length)
            throw new RangeError(`Invalid splice index ${index} for ${this.length} records.`);
        if (!Number.isInteger(removed) || removed < 0 || index + removed > this.length)
            throw new RangeError(`Invalid removal count ${removed} at ${index}.`);
        this._assertLength(inserted);

        let remaining = removed;
        while (remaining > 0) {
            const { leaf, offset } = this._findLeaf(index);
            const count = Math.min(remaining, leaf.length - offset);
            this._deleteFromLeaf(leaf, offset, count);
            remaining -= count;
        }
        if (inserted > 0)
            this._insert(index, inserted, read);
    }

    private _insert(index: number, inserted: number, read: MeasureReader) {
        if (!this._root) {
            this.build(inserted, read);
            return;
        }
        const { leaf, offset } = this._findLeaf(index, true);
        const combinedLength = leaf.length + inserted;
        const combined = this.storageTypes.map(type => this._createValueArray(type, combinedLength));
        for (let measure = 0; measure < this.measureCount; measure++) {
            combined[measure].set(leaf.values[measure].subarray(0, offset));
            for (let insertedIndex = 0; insertedIndex < inserted; insertedIndex++)
                combined[measure][offset + insertedIndex] = read(insertedIndex, measure);
            combined[measure].set(
                leaf.values[measure].subarray(offset, leaf.length),
                offset + inserted,
            );
        }

        if (combinedLength <= this.pageCapacity) {
            for (let measure = 0; measure < this.measureCount; measure++) {
                leaf.values[measure].fill(0);
                leaf.values[measure].set(combined[measure]);
            }
            leaf.length = combinedLength;
            this._refreshLeaf(leaf);
            this._refreshAncestors(leaf.parent);
            return;
        }

        const replacement: ISequenceLeaf[] = [];
        for (let start = 0; start < combinedLength; start += this.pageCapacity) {
            const length = Math.min(this.pageCapacity, combinedLength - start);
            const next = this._createLeaf(length);
            for (let measure = 0; measure < this.measureCount; measure++)
                next.values[measure].set(combined[measure].subarray(start, start + length));
            this._refreshLeaf(next);
            replacement.push(next);
        }
        this._replaceLeaf(leaf, replacement);
    }

    private _deleteFromLeaf(leaf: ISequenceLeaf, offset: number, count: number) {
        for (const values of leaf.values) {
            values.copyWithin(offset, offset + count, leaf.length);
            values.fill(0, leaf.length - count, leaf.length);
        }
        leaf.length -= count;
        if (leaf.length === 0) {
            this._removeLeaf(leaf);
            return;
        }
        this._refreshLeaf(leaf);
        this._refreshAncestors(leaf.parent);
    }

    private _replaceLeaf(leaf: ISequenceLeaf, replacement: ISequenceLeaf[]) {
        const parent = leaf.parent;
        if (!parent) {
            this._root = this._buildTree(replacement);
            return;
        }
        const index = parent.children.indexOf(leaf);
        for (const next of replacement)
            next.parent = parent;
        parent.children.splice(index, 1, ...replacement);
        this._repairOverflow(parent);
    }

    private _removeLeaf(leaf: ISequenceLeaf) {
        const parent = leaf.parent;
        if (!parent) {
            this._root = null;
            return;
        }
        parent.children.splice(parent.children.indexOf(leaf), 1);
        this._repairAfterRemoval(parent);
    }

    private _repairOverflow(branch: ISequenceBranch) {
        let current = branch;
        while (current.children.length > this.branchCapacity) {
            const replacements: ISequenceBranch[] = [];
            for (let start = 0; start < current.children.length; start += this.branchCapacity)
                replacements.push(this._createBranch(current.children.slice(start, start + this.branchCapacity)));
            const parent = current.parent;
            if (!parent) {
                this._root = this._buildTree(replacements);
                return;
            }
            const index = parent.children.indexOf(current);
            for (const replacement of replacements)
                replacement.parent = parent;
            parent.children.splice(index, 1, ...replacements);
            current = parent;
        }
        this._refreshAncestors(current);
    }

    private _repairAfterRemoval(branch: ISequenceBranch) {
        let current: ISequenceBranch | null = branch;
        while (current) {
            if (current.children.length === 0) {
                const parent: ISequenceBranch | null = current.parent;
                if (!parent) {
                    this._root = null;
                    return;
                }
                parent.children.splice(parent.children.indexOf(current), 1);
                current = parent;
                continue;
            }
            this._refreshBranch(current);
            if (!current.parent && current.children.length === 1) {
                this._root = current.children[0];
                this._root.parent = null;
                return;
            }
            current = current.parent;
        }
    }

    private _findLeaf(index: number, allowEnd = false) {
        if (!this._root)
            throw new RangeError('Cannot locate a record in an empty sequence.');
        if (index === this.length && allowEnd) {
            let node = this._root;
            while (node.kind === 'branch')
                node = node.children[node.children.length - 1];
            return { leaf: node, offset: node.length };
        }
        this._assertIndex(index);
        let node = this._root;
        let remaining = index;
        while (node.kind === 'branch') {
            const childIndex = this._childIndexAtRank(node, remaining);
            const previousLength = childIndex === 0 ? 0 : node.lengthEnds[childIndex - 1];
            remaining -= previousLength;
            node = node.children[childIndex];
        }
        return { leaf: node, offset: remaining };
    }

    private _nextLeaf(leaf: ISequenceLeaf) {
        let node: SequenceNode = leaf;
        let parent = leaf.parent;
        while (parent) {
            const index = parent.children.indexOf(node);
            if (index + 1 < parent.children.length) {
                node = parent.children[index + 1];
                while (node.kind === 'branch')
                    node = node.children[0];
                return node;
            }
            node = parent;
            parent = parent.parent;
        }
        return null;
    }

    private _buildTree(nodes: SequenceNode[]) {
        let level = nodes;
        while (level.length > 1) {
            const next: SequenceNode[] = [];
            for (let start = 0; start < level.length; start += this.branchCapacity)
                next.push(this._createBranch(level.slice(start, start + this.branchCapacity)));
            level = next;
        }
        level[0].parent = null;
        return level[0];
    }

    private _createLeaf(length: number): ISequenceLeaf {
        return {
            kind: 'leaf',
            parent: null,
            length,
            values: this.storageTypes.map(type => this._createValueArray(type, this.pageCapacity)),
            totals: new Float64Array(this.measureCount),
        };
    }

    private _createBranch(children: SequenceNode[]): ISequenceBranch {
        const branch: ISequenceBranch = {
            kind: 'branch',
            parent: null,
            children,
            lengthEnds: new Uint32Array(children.length),
            length: 0,
            totals: new Float64Array(this.measureCount),
        };
        for (const child of children)
            child.parent = branch;
        this._refreshBranch(branch);
        return branch;
    }

    private _refreshLeaf(leaf: ISequenceLeaf) {
        leaf.totals.fill(0);
        for (let measure = 0; measure < this.measureCount; measure++) {
            const values = leaf.values[measure];
            for (let index = 0; index < leaf.length; index++)
                leaf.totals[measure] += values[index];
        }
    }

    private _refreshBranch(branch: ISequenceBranch) {
        branch.length = 0;
        branch.totals.fill(0);
        if (branch.lengthEnds.length !== branch.children.length)
            branch.lengthEnds = new Uint32Array(branch.children.length);
        for (let index = 0; index < branch.children.length; index++) {
            const child = branch.children[index];
            branch.length += child.length;
            branch.lengthEnds[index] = branch.length;
            this._addTotals(branch.totals, child.totals);
        }
    }

    private _refreshAncestors(branch: ISequenceBranch | null) {
        for (let current = branch; current; current = current.parent)
            this._refreshBranch(current);
    }

    private _addTotals(target: Float64Array, source: Float64Array) {
        for (let measure = 0; measure < this.measureCount; measure++)
            target[measure] += source[measure];
    }

    private _assertIndex(index: number) {
        if (!Number.isInteger(index) || index < 0 || index >= this.length)
            throw new RangeError(`Invalid record index ${index} for ${this.length} records.`);
    }

    private _assertLength(length: number) {
        if (!Number.isInteger(length) || length < 0)
            throw new RangeError(`Invalid sequence length ${length}.`);
    }

    private _assertMeasure(measure: number) {
        if (!Number.isInteger(measure) || measure < 0 || measure >= this.measureCount)
            throw new RangeError(`Invalid measure ${measure} for ${this.measureCount} measures.`);
    }

    private _assertStoredValue(measure: number, value: number) {
        const storageType = this.storageTypes[measure];
        if (storageType === 'float64')
            return;
        const maximum = storageType === 'uint8' ? 0xFF : 0xFFFFFFFF;
        if (!Number.isInteger(value) || value < 0 || value > maximum)
            throw new RangeError(`Measure ${measure} requires a ${storageType} value.`);
    }

    private _childIndexAtRank(branch: ISequenceBranch, rank: number) {
        let low = 0;
        let high = branch.lengthEnds.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (branch.lengthEnds[middle] <= rank)
                low = middle + 1;
            else
                high = middle;
        }
        return low;
    }

    private _createValueArray(type: MeasureStorage, length: number): MeasureArray {
        if (type === 'uint8')
            return new Uint8Array(length);
        if (type === 'uint32')
            return new Uint32Array(length);
        return new Float64Array(length);
    }
}
