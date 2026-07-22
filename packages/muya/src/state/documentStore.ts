const DEFAULT_CHUNK_SIZE = 32 * 1024;

export type TAnchorAffinity = 'left' | 'right';

export interface IReplaceStep {
    from: number;
    to: number;
    insert: string;
}

export interface IEditTransaction {
    baseRevision: number;
    origin: string;
    steps: IReplaceStep[];
}

export interface IDocumentAnchor {
    readonly storeId: number;
    offset: number;
    readonly affinity: TAnchorAffinity;
    revision: number;
    disposed: boolean;
}

interface ITextNode {
    text: string;
    textNewlines: number;
    left: ITextNode | null;
    right: ITextNode | null;
    priority: number;
    length: number;
    newlines: number;
}

let prioritySeed = 0x9E3779B9;
let nextStoreId = 1;

function nextPriority() {
    prioritySeed ^= prioritySeed << 13;
    prioritySeed ^= prioritySeed >>> 17;
    prioritySeed ^= prioritySeed << 5;
    return prioritySeed >>> 0;
}

function countNewlines(text: string) {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10)
            count++;
    }
    return count;
}

const nodeLength = (node: ITextNode | null) => node?.length ?? 0;
const nodeNewlines = (node: ITextNode | null) => node?.newlines ?? 0;

function createNode(
    text: string,
    left: ITextNode | null = null,
    right: ITextNode | null = null,
    priority = nextPriority(),
    textNewlines = countNewlines(text),
): ITextNode {
    return {
        text,
        textNewlines,
        left,
        right,
        priority,
        length: nodeLength(left) + text.length + nodeLength(right),
        newlines: nodeNewlines(left) + textNewlines + nodeNewlines(right),
    };
}

function cloneNode(node: ITextNode, left: ITextNode | null, right: ITextNode | null) {
    return createNode(node.text, left, right, node.priority, node.textNewlines);
}

function merge(left: ITextNode | null, right: ITextNode | null): ITextNode | null {
    if (!left)
        return right;
    if (!right)
        return left;
    if (left.priority <= right.priority)
        return cloneNode(left, left.left, merge(left.right, right));
    return cloneNode(right, merge(left, right.left), right.right);
}

function split(node: ITextNode | null, offset: number): [ITextNode | null, ITextNode | null] {
    if (!node)
        return [null, null];

    const leftLength = nodeLength(node.left);
    const textEnd = leftLength + node.text.length;
    if (offset < leftLength) {
        const [before, after] = split(node.left, offset);
        return [before, cloneNode(node, after, node.right)];
    }
    if (offset > textEnd) {
        const [before, after] = split(node.right, offset - textEnd);
        return [cloneNode(node, node.left, before), after];
    }

    const localOffset = offset - leftLength;
    const beforeText = node.text.slice(0, localOffset);
    const afterText = node.text.slice(localOffset);
    const before = beforeText ? merge(node.left, createNode(beforeText)) : node.left;
    const after = afterText ? merge(createNode(afterText), node.right) : node.right;
    return [before, after];
}

function appendSlice(
    node: ITextNode | null,
    from: number,
    to: number,
    chunks: string[],
    baseOffset = 0,
) {
    if (!node || from >= to)
        return;

    const leftLength = nodeLength(node.left);
    const textStart = baseOffset + leftLength;
    const textEnd = textStart + node.text.length;
    if (from < textStart)
        appendSlice(node.left, from, Math.min(to, textStart), chunks, baseOffset);
    if (from < textEnd && to > textStart) {
        chunks.push(node.text.slice(
            Math.max(0, from - textStart),
            Math.min(node.text.length, to - textStart),
        ));
    }
    if (to > textEnd)
        appendSlice(node.right, Math.max(from, textEnd), to, chunks, textEnd);
}

function* iterateChunks(node: ITextNode | null): Generator<string> {
    if (!node)
        return;
    yield* iterateChunks(node.left);
    if (node.text)
        yield node.text;
    yield* iterateChunks(node.right);
}

function createTree(text: string, chunkSize: number) {
    let root: ITextNode | null = null;
    for (let offset = 0; offset < text.length; offset += chunkSize)
        root = merge(root, createNode(text.slice(offset, offset + chunkSize)));
    return root;
}

function validateRange(from: number, to: number, length: number) {
    if (!Number.isInteger(from) || !Number.isInteger(to))
        throw new TypeError('Document offsets must be integers.');
    if (from < 0 || to < from || to > length)
        throw new RangeError(`Invalid document range [${from}, ${to}) for length ${length}.`);
}

function normalizeSteps(steps: IReplaceStep[], length: number) {
    if (!Array.isArray(steps) || steps.length === 0)
        throw new TypeError('An edit transaction requires at least one replace step.');

    const normalized = steps.map((step) => {
        if (!step || typeof step.insert !== 'string')
            throw new TypeError('Replace steps require string insert content.');
        validateRange(step.from, step.to, length);
        return { ...step };
    }).sort((a, b) => a.from - b.from || a.to - b.to);

    for (let i = 1; i < normalized.length; i++) {
        if (normalized[i].from < normalized[i - 1].to)
            throw new RangeError('Replace steps must not overlap.');
    }
    return normalized;
}

function mapAnchorThroughStep(anchor: IDocumentAnchor, step: IReplaceStep) {
    const removedLength = step.to - step.from;
    if (anchor.offset < step.from)
        return;
    if (anchor.offset > step.to || (anchor.offset === step.to && removedLength > 0)) {
        anchor.offset += step.insert.length - removedLength;
        return;
    }
    anchor.offset = step.from + (anchor.affinity === 'right' ? step.insert.length : 0);
}

export class DocumentSnapshot {
    readonly length: number;
    readonly lineCount: number;

    constructor(private readonly _root: ITextNode | null, readonly revision: number) {
        this.length = nodeLength(_root);
        this.lineCount = nodeNewlines(_root) + 1;
    }

    slice(from = 0, to = this.length) {
        validateRange(from, to, this.length);
        const chunks: string[] = [];
        appendSlice(this._root, from, to, chunks);
        return chunks.join('');
    }

    * chunks() {
        yield* iterateChunks(this._root);
    }

    toString() {
        return Array.from(this.chunks()).join('');
    }
}

export class DocumentStore {
    private _root: ITextNode | null;
    private _revision = 0;
    private readonly _storeId = nextStoreId++;
    private readonly _anchors = new Set<IDocumentAnchor>();
    private readonly _chunkSize: number;

    constructor(text = '', options: { chunkSize?: number } = {}) {
        if (typeof text !== 'string')
            throw new TypeError('DocumentStore text must be a string.');
        this._chunkSize = Math.max(1024, options.chunkSize ?? DEFAULT_CHUNK_SIZE);
        this._root = createTree(text, this._chunkSize);
    }

    get revision() {
        return this._revision;
    }

    get length() {
        return nodeLength(this._root);
    }

    get lineCount() {
        return nodeNewlines(this._root) + 1;
    }

    slice(from = 0, to = this.length, snapshot?: DocumentSnapshot) {
        if (snapshot)
            return snapshot.slice(from, to);
        validateRange(from, to, this.length);
        const chunks: string[] = [];
        appendSlice(this._root, from, to, chunks);
        return chunks.join('');
    }

    snapshot() {
        return new DocumentSnapshot(this._root, this._revision);
    }

    toString() {
        return this.snapshot().toString();
    }

    createAnchor(offset: number, affinity: TAnchorAffinity = 'right'): IDocumentAnchor {
        validateRange(offset, offset, this.length);
        const anchor: IDocumentAnchor = {
            storeId: this._storeId,
            offset,
            affinity,
            revision: this._revision,
            disposed: false,
        };
        this._anchors.add(anchor);
        return anchor;
    }

    resolveAnchor(anchor: IDocumentAnchor) {
        if (anchor.storeId !== this._storeId || anchor.disposed || !this._anchors.has(anchor))
            throw new Error('Cannot resolve an anchor that does not belong to this document.');
        return anchor.offset;
    }

    disposeAnchor(anchor: IDocumentAnchor) {
        if (anchor.storeId === this._storeId) {
            anchor.disposed = true;
            this._anchors.delete(anchor);
        }
    }

    apply(transaction: IEditTransaction) {
        if (transaction.baseRevision !== this._revision)
            throw new Error(`Stale edit transaction: expected revision ${this._revision}.`);

        const steps = normalizeSteps(transaction.steps, this.length);
        const deletedText = steps.map(step => this.slice(step.from, step.to));
        let root = this._root;
        for (let index = steps.length - 1; index >= 0; index--) {
            const step = steps[index];
            const [before, tail] = split(root, step.from);
            const [, after] = split(tail, step.to - step.from);
            root = merge(merge(before, createTree(step.insert, this._chunkSize)), after);
            for (const anchor of this._anchors)
                mapAnchorThroughStep(anchor, step);
        }

        this._root = root;
        this._revision++;
        for (const anchor of this._anchors)
            anchor.revision = this._revision;

        let delta = 0;
        const inverseSteps = steps.map((step, index) => {
            const from = step.from + delta;
            delta += step.insert.length - (step.to - step.from);
            return { from, to: from + step.insert.length, insert: deletedText[index] };
        });
        return {
            revision: this._revision,
            steps,
            deletedText,
            dirtyRange: { from: steps[0].from, to: steps[steps.length - 1].to },
            inverse: {
                baseRevision: this._revision,
                origin: transaction.origin === 'undo' ? 'redo' : 'undo',
                steps: inverseSteps,
            },
        };
    }

    replace(from: number, to: number, insert: string, origin = 'input') {
        return this.apply({
            baseRevision: this._revision,
            origin,
            steps: [{ from, to, insert }],
        });
    }
}
