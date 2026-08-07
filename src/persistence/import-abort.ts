/** Import cancellation helpers kept independent from parsing and store hydration. */
export function createImportAbortError(): Error {
    if (typeof DOMException === 'function') return new DOMException('Import aborted', 'AbortError');
    const error = new Error('Import aborted');
    error.name = 'AbortError';
    return error;
}

export function throwIfImportAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw createImportAbortError();
}
