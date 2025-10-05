// Single source of truth for ticks per quarter (PPQ) used across UI and timing logic.
// Historically 960; some tooling expects 960. We centralize and allow runtime configuration
// early during application startup / test setup. Avoid importing and mutating elsewhere.

let _canonicalPPQ = 960; // default

/** Read the canonical PPQ (ticks per quarter note) */
export function getCanonicalPPQ(): number {
    return _canonicalPPQ;
}

/** Convenience constant-like accessor for existing call sites (read-only). */
// Live mutable export; modules reading CANONICAL_PPQ will see updated value after setCanonicalPPQ.
export let CANONICAL_PPQ = _canonicalPPQ;

/** Set the canonical PPQ once at startup (idempotent in prod; tests may override). */
export function setCanonicalPPQ(ppq: number): void {
    if (!Number.isFinite(ppq) || ppq <= 0) throw new Error(`Invalid PPQ: ${ppq}`);
    _canonicalPPQ = Math.round(ppq);
    CANONICAL_PPQ = _canonicalPPQ; // update live binding
}

/** Helper: beats -> ticks using canonical PPQ */
export function beatsToTicks(beats: number): number {
    return Math.round(beats * _canonicalPPQ);
}
/** Helper: ticks -> beats using canonical PPQ */
export function ticksToBeats(ticks: number): number {
    return ticks / _canonicalPPQ;
}
