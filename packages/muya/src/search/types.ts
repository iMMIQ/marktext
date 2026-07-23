import type { TBlockPath } from '../block/types';

export interface ISearchOption {
    isCaseSensitive?: boolean;
    isWholeWord?: boolean;
    isRegexp?: boolean;
    selectHighlight?: boolean;
    highlightIndex?: number;
}

export interface IMatch {
    start: number;
    end: number;
    path: TBlockPath;
    match: string;
    subMatches: string[];
}
