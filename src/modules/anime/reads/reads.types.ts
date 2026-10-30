export interface CursorPaginationInput { readonly cursor?: string; readonly limit?: number; }
export interface CursorPage<T> { readonly items: readonly T[]; readonly next_cursor: string | null; }
export function clampLimit(rawLimit?: number): number { if (rawLimit === undefined || Number.isNaN(rawLimit)) return 25; return Math.max(1, Math.min(100, Math.floor(rawLimit))); }
