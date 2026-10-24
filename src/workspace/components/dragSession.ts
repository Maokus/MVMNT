/** Create an opaque drag/merge-session id. Uniqueness only — never parsed. */
export function createDragSessionId(prefix: string): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
