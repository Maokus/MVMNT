// Single source of truth for ticks per quarter (PPQ) used across UI and timing logic.
// TimingManager defaults to 480; store helpers also assume 480. Avoid hard-coding 960/480 elsewhere.
export const CANONICAL_PPQ = 480;
