type SequenceNode = ISequenceBranch | ISequenceLeaf;

interface ISequenceLeaf {
    kind: 'leaf';
    parent: ISequenceBranch | null;
    length: number;
    values: Float64Array;
    totals: Float64Array;
}

interface ISequenceBranch {
    kind: 'branch';
    parent: ISequenceBranch | null;
    children: SequenceNode[];
    length: number;
    totals: Float64Array;
}

export type MeasureReader = (index: number, measure: number) => number;

/**
 * A compact B+ sequence whose internal nodes aggregate every numeric column.
 *
 * Records live only in typed-array leaf pages. Rank and measured-offset
 * lookups descend the same tree, so local splices do not require rebuilding a
 * document-sized side index.
 */
export class PagedMeasuredSequence {
    private _root: SequenceNode | null = null;

    constructor(
        readonly measureCount: number,
        readonly pageCapacity = 256,
        readonly branchCapacity = 32,
    ) {
        if (!Number.isInteger(measureCount) || measureCount < 1)
            throw new RangeError('measureCount must be a positive integer.');
        if (!Number.isInteger(pageCapacity) || pageCapacity < 4)
            throw new RangeError('pageCapacity must be at least 4.');
        if (!Number.isInteger(branchCapacity) || branchCapacity < 4)
            throw new RangeError('branchCapacity must be at least 4.');
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
            if (node.kind === 'leaf')
                bytes += node.values.byteLength;
            else
                pending.push(...node.children);
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
                    leaf.values[localIndex * this.measureCount + measure] = read(start + localIndex, measure);
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
        return leaf.values[offset * this.measureCount + measure];
    }

    recordAt(index: number, target = new Float64Array(this.measureCount)) {
        this._assertIndex(index);
        if (target.length < this.measureCount)
            throw new RangeError(`Record target needs ${this.measureCount} entries.`);
        const { leaf, offset } = this._findLeaf(index);
        const start = offset * this.measureCount;
        target.set(leaf.values.subarray(start, start + this.measureCount));
        return target;
    }

    setMeasure(index: number, measure: number, value: number) {
        this._assertIndex(index);
        this._assertMeasure(measure);
        if (!Number.isFinite(value))
            throw new RangeError('Sequence measures must be finite.');
        const { leaf, offset } = this._findLeaf(index);
        const valueIndex = offset * this.measureCount + measure;
        const delta = value - leaf.values[valueIndex];
        if (delta === 0)
            return 0;
        leaf.values[valueIndex] = value;
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
                const start = index * this.measureCount;
                for (let measure = 0; measure < this.measureCount; measure++)
                    target[measure] += node.values[start + measure];
            }
        }
        return target;
    }

    selectByMeasure(measure: number, offset: number) {
        this._assertMeasure(measure);
        if (!this._root)
            return 0;
        if (offset <= 0)
            return 0;

        let node = this._root;
        let rank = 0;
        let remaining = offset;
        while (node.kind === 'branch') {
            let selected = node.children[node.children.length - 1];
            for (const child of node.children) {
                if (child.totals[measure] > remaining) {
                    selected = child;
                    break;
                }
                rank += child.length;
                remaining -= child.totals[measure];
            }
            node = selected;
        }
        for (let index = 0; index < node.length; index++) {
            const value = node.values[index * this.measureCount + measure];
            if (value > remaining)
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
                const valueStart = offset * this.measureCount;
                record.set(leaf.values.subarray(valueStart, valueStart + this.measureCount));
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
        const combined = new Float64Array(combinedLength * this.measureCount);
        const splitOffset = offset * this.measureCount;
        combined.set(leaf.values.subarray(0, splitOffset));
        for (let insertedIndex = 0; insertedIndex < inserted; insertedIndex++) {
            for (let measure = 0; measure < this.measureCount; measure++) {
                combined[splitOffset + insertedIndex * this.measureCount + measure]
                    = read(insertedIndex, measure);
            }
        }
        combined.set(
            leaf.values.subarray(splitOffset, leaf.length * this.measureCount),
            splitOffset + inserted * this.measureCount,
        );

        if (combinedLength <= this.pageCapacity) {
            leaf.values.fill(0);
            leaf.values.set(combined);
            leaf.length = combinedLength;
            this._refreshLeaf(leaf);
            this._refreshAncestors(leaf.parent);
            return;
        }

        const replacement: ISequenceLeaf[] = [];
        for (let start = 0; start < combinedLength; start += this.pageCapacity) {
            const length = Math.min(this.pageCapacity, combinedLength - start);
            const next = this._createLeaf(length);
            next.values.set(combined.subarray(
                start * this.measureCount,
                (start + length) * this.measureCount,
            ));
            this._refreshLeaf(next);
            replacement.push(next);
        }
        this._replaceLeaf(leaf, replacement);
    }

    private _deleteFromLeaf(leaf: ISequenceLeaf, offset: number, count: number) {
        const destination = offset * this.measureCount;
        const source = (offset + count) * this.measureCount;
        const used = leaf.length * this.measureCount;
        leaf.values.copyWithin(destination, source, used);
        leaf.values.fill(0, used - count * this.measureCount, used);
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
            let selected = node.children[node.children.length - 1];
            for (const child of node.children) {
                if (remaining < child.length) {
                    selected = child;
                    break;
                }
                remaining -= child.length;
            }
            node = selected;
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
            values: new Float64Array(this.pageCapacity * this.measureCount),
            totals: new Float64Array(this.measureCount),
        };
    }

    private _createBranch(children: SequenceNode[]): ISequenceBranch {
        const branch: ISequenceBranch = {
            kind: 'branch',
            parent: null,
            children,
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
        for (let index = 0; index < leaf.length; index++) {
            const start = index * this.measureCount;
            for (let measure = 0; measure < this.measureCount; measure++)
                leaf.totals[measure] += leaf.values[start + measure];
        }
    }

    private _refreshBranch(branch: ISequenceBranch) {
        branch.length = 0;
        branch.totals.fill(0);
        for (const child of branch.children) {
            branch.length += child.length;
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
}
