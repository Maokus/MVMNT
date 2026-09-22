export type TemporalCoordinateDomain = 'seconds' | 'beats' | 'ticks';

export interface TemporalPoint<D extends TemporalCoordinateDomain = TemporalCoordinateDomain> {
    domain: D;
    value: number;
}

export interface TemporalDuration<D extends TemporalCoordinateDomain = TemporalCoordinateDomain> {
    domain: D;
    value: number;
}

export interface TemporalWindow<D extends TemporalCoordinateDomain = TemporalCoordinateDomain> {
    domain: D;
    start: number;
    end: number;
}

export interface TemporalInterval<D extends TemporalCoordinateDomain = TemporalCoordinateDomain> {
    domain: D;
    start: number;
    end: number;
}

export interface TemporalCoordinateConversions {
    secondsToBeats(seconds: number): number;
    beatsToSeconds(beats: number): number;
    secondsToTicks(seconds: number): number;
    ticksToSeconds(ticks: number): number;
    beatsToTicks(beats: number): number;
    ticksToBeats(ticks: number): number;
}

export type TemporalCadence = 'continuous' | 'transport-relative';
export type TemporalReconstruction = 'hold' | 'interpolate';

export interface ViewportTemporalMapping {
    mode: 'viewport';
    window: TemporalWindow;
}

export interface AnchorRelativeTemporalMapping {
    mode: 'anchor-relative';
    anchor: TemporalPoint;
    span: TemporalDuration;
    anchorPosition: number;
}

export type TemporalMapping = ViewportTemporalMapping | AnchorRelativeTemporalMapping;

export interface TemporalFrame<D extends TemporalCoordinateDomain = TemporalCoordinateDomain> {
    anchor: TemporalPoint;
    viewport: TemporalWindow<D>;
    materialization: TemporalWindow;
    cadence: TemporalCadence;
    reconstruction: TemporalReconstruction;
    mapping: TemporalMapping;
}

export interface TemporalMaterializationPadding {
    before?: TemporalDuration;
    after?: TemporalDuration;
    outputDomain?: TemporalCoordinateDomain;
}

export interface TemporalPositionOptions {
    clamp?: boolean;
}

const MUSICAL_BOUNDARY_TOLERANCE = 1e-9;

export function convertTemporalValue(
    value: number,
    from: TemporalCoordinateDomain,
    to: TemporalCoordinateDomain,
    conversions: TemporalCoordinateConversions
): number {
    if (from === to) return value;
    if (from === 'seconds' && to === 'beats') return conversions.secondsToBeats(value);
    if (from === 'beats' && to === 'seconds') return conversions.beatsToSeconds(value);
    if (from === 'seconds' && to === 'ticks') return conversions.secondsToTicks(value);
    if (from === 'ticks' && to === 'seconds') return conversions.ticksToSeconds(value);
    if (from === 'beats' && to === 'ticks') return conversions.beatsToTicks(value);
    return conversions.ticksToBeats(value);
}

export function convertTemporalPoint<D extends TemporalCoordinateDomain>(
    point: TemporalPoint,
    domain: D,
    conversions: TemporalCoordinateConversions
): TemporalPoint<D> {
    return {
        domain,
        value: convertTemporalValue(point.value, point.domain, domain, conversions),
    };
}

export function convertTemporalWindow<D extends TemporalCoordinateDomain>(
    window: TemporalWindow,
    domain: D,
    conversions: TemporalCoordinateConversions
): TemporalWindow<D> {
    return {
        domain,
        start: convertTemporalValue(window.start, window.domain, domain, conversions),
        end: convertTemporalValue(window.end, window.domain, domain, conversions),
    };
}

/** Resolve a fixed-span window around an anchor in the span's coordinate domain. */
export function resolveAnchoredWindow<D extends TemporalCoordinateDomain>(
    anchor: TemporalPoint,
    span: TemporalDuration<D>,
    anchorPosition: number,
    conversions: TemporalCoordinateConversions
): TemporalWindow<D> {
    const anchorValue = convertTemporalValue(anchor.value, anchor.domain, span.domain, conversions);
    return {
        domain: span.domain,
        start: anchorValue - span.value * anchorPosition,
        end: anchorValue + span.value * (1 - anchorPosition),
    };
}

/** Resolve the equal-sized window containing an anchor, with an explicit exact-boundary policy. */
export function resolveAlignedWindow<D extends TemporalCoordinateDomain>(
    anchor: TemporalPoint,
    span: TemporalDuration<D>,
    conversions: TemporalCoordinateConversions,
    boundary: 'next' | 'previous' = 'next'
): TemporalWindow<D> {
    const anchorValue = convertTemporalValue(anchor.value, anchor.domain, span.domain, conversions);
    const quotient = anchorValue / span.value;
    const nearestBoundary = Math.round(quotient);
    const isPositiveBoundary = anchorValue > 0 && Math.abs(quotient - nearestBoundary) < MUSICAL_BOUNDARY_TOLERANCE;
    const windowIndex = boundary === 'previous' && isPositiveBoundary ? nearestBoundary - 1 : Math.floor(quotient);
    const start = windowIndex * span.value;
    return { domain: span.domain, start, end: start + span.value };
}

/** Derive equal-sized neighbours directly in the window's coordinate domain. */
export function resolveAdjacentWindows<D extends TemporalCoordinateDomain>(
    window: TemporalWindow<D>,
    retention: { before: number; after: number }
): Array<{ offset: number; window: TemporalWindow<D> }> {
    const duration = window.end - window.start;
    const windows: Array<{ offset: number; window: TemporalWindow<D> }> = [];
    for (
        let offset = -Math.max(0, Math.floor(retention.before));
        offset <= Math.max(0, Math.floor(retention.after));
        offset++
    ) {
        windows.push({
            offset,
            window: {
                domain: window.domain,
                start: window.start + offset * duration,
                end: window.end + offset * duration,
            },
        });
    }
    return windows;
}

/** Expand a viewport independently on either side, allowing padding in another time domain. */
export function resolveMaterializationWindow(
    viewport: TemporalWindow,
    padding: TemporalMaterializationPadding,
    conversions: TemporalCoordinateConversions
): TemporalWindow {
    const outputDomain = padding.outputDomain ?? viewport.domain;
    const before = padding.before;
    const after = padding.after;

    const paddedStart = before
        ? convertTemporalValue(
              convertTemporalValue(viewport.start, viewport.domain, before.domain, conversions) -
                  Math.max(0, before.value),
              before.domain,
              outputDomain,
              conversions
          )
        : convertTemporalValue(viewport.start, viewport.domain, outputDomain, conversions);
    const paddedEnd = after
        ? convertTemporalValue(
              convertTemporalValue(viewport.end, viewport.domain, after.domain, conversions) + Math.max(0, after.value),
              after.domain,
              outputDomain,
              conversions
          )
        : convertTemporalValue(viewport.end, viewport.domain, outputDomain, conversions);

    return { domain: outputDomain, start: paddedStart, end: paddedEnd };
}

export function createTemporalFrame<D extends TemporalCoordinateDomain>(frame: TemporalFrame<D>): TemporalFrame<D> {
    return frame;
}

export function clipTemporalInterval<D extends TemporalCoordinateDomain>(
    interval: TemporalInterval<D>,
    window: TemporalWindow<D>
): TemporalInterval<D> | null {
    assertMatchingDomains(interval.domain, window.domain);
    if (!(interval.start < window.end && interval.end > window.start)) return null;
    return {
        domain: interval.domain,
        start: Math.max(interval.start, window.start),
        end: Math.min(interval.end, window.end),
    };
}

export function clipTemporalIntervalAcrossWindows<D extends TemporalCoordinateDomain>(
    interval: TemporalInterval<D>,
    windows: readonly TemporalWindow<D>[]
): Array<{ interval: TemporalInterval<D>; window: TemporalWindow<D> }> {
    return windows.flatMap((window) => {
        const clipped = clipTemporalInterval(interval, window);
        return clipped ? [{ interval: clipped, window }] : [];
    });
}

/** Map a temporal value using an explicit viewport or anchor-relative mapping. */
export function mapTemporalPosition(
    point: TemporalPoint,
    mapping: TemporalMapping,
    conversions: TemporalCoordinateConversions,
    options: TemporalPositionOptions = {}
): number {
    let position: number;
    if (mapping.mode === 'viewport') {
        const value = convertTemporalValue(point.value, point.domain, mapping.window.domain, conversions);
        const duration = Math.max(1e-9, mapping.window.end - mapping.window.start);
        position = (value - mapping.window.start) / duration;
    } else {
        const value = convertTemporalValue(point.value, point.domain, mapping.span.domain, conversions);
        const anchor = convertTemporalValue(
            mapping.anchor.value,
            mapping.anchor.domain,
            mapping.span.domain,
            conversions
        );
        position = (value - anchor) / Math.max(1e-9, mapping.span.value) + mapping.anchorPosition;
    }
    return options.clamp === false ? position : Math.max(0, Math.min(1, position));
}

function assertMatchingDomains(left: TemporalCoordinateDomain, right: TemporalCoordinateDomain): void {
    if (left !== right) throw new Error(`Temporal coordinate domains do not match: ${left} and ${right}`);
}
