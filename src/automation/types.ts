/**
 * Automation System — Core Types
 *
 * Data model for keyframe-based property automation. An AutomationChannel
 * stores an ordered list of keyframes for a single property on a single
 * element. The binding system references channels by ID.
 */

// ---------------------------------------------------------------------------
// Interpolation mode types
// ---------------------------------------------------------------------------

/**
 * Interpolation mode for a segment between two keyframes.
 * - constant/linear/bezier: basic modes
 * - Semantic presets: easing families evaluated with a direction modifier
 */
export type SegmentInterpolationMode =
    | 'constant'
    | 'linear'
    | 'bezier'
    | 'sine'
    | 'quad'
    | 'cubic'
    | 'quart'
    | 'quint'
    | 'expo'
    | 'circ'
    | 'back'
    | 'bounce'
    | 'elastic';

/**
 * Easing direction for semantic preset modes.
 * 'auto' resolves to ease_in_out for smooth families, ease_out for dynamic.
 */
export type EasingDirection = 'auto' | 'ease_in' | 'ease_out' | 'ease_in_out';

/**
 * Bezier handle constraint type.
 * - free: fully independent handle movement
 * - aligned: opposite handles share tangent direction, independent length
 * - vector: handle points straight at the neighboring keyframe
 * - auto: Catmull-Rom tangent, auto-computed
 * - auto_clamped: auto with overshoot prevention
 */
export type HandleType = 'free' | 'aligned' | 'vector' | 'auto' | 'auto_clamped';

/** A bezier handle offset, relative to the keyframe's tick and value. */
export interface BezierHandle {
    /** Tick offset from the keyframe position. */
    dt: number;
    /** Value offset from the keyframe value. */
    dv: number;
}

/** Optional parameters for parameterized easing modes. */
export interface SegmentInterpolationParams {
    /** Back overshoot factor. Default: 1.70158 */
    overshoot?: number;
    /** Elastic amplitude. Default: 1.0 */
    amplitude?: number;
    /** Elastic oscillation period. Default: 0.3 */
    period?: number;
}

/** Per-segment interpolation descriptor, stored on the outgoing keyframe. */
export interface SegmentInterpolation {
    mode: SegmentInterpolationMode;
    direction: EasingDirection;
    params?: SegmentInterpolationParams;
}

// ---------------------------------------------------------------------------
// Keyframe
// ---------------------------------------------------------------------------

/** A single keyframe on an automation channel. */
export interface AutomationKeyframe {
    /** Absolute tick position on the timeline. */
    tick: number;
    /** The property value at this tick (number, hex color string, or boolean). */
    value: unknown;
    /**
     * Legacy easing ID applied from this keyframe to the next.
     * Kept for backward compatibility; new code should use segmentInterpolation.
     */
    easingId: string;

    // -- New hybrid interpolation fields (all optional for backward compat) --

    /** Per-segment interpolation mode, direction, and parameters (outgoing). */
    segmentInterpolation?: SegmentInterpolation;
    /** Left (incoming) bezier handle, relative to this keyframe. */
    leftHandle?: BezierHandle;
    /** Right (outgoing) bezier handle, relative to this keyframe. */
    rightHandle?: BezierHandle;
    /** Left handle constraint type. */
    leftHandleType?: HandleType;
    /** Right handle constraint type. */
    rightHandleType?: HandleType;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

/** How values are interpolated between keyframes. */
export type AutomationInterpolation = 'linear' | 'stepped' | 'eased';

/** The JS value type stored in keyframes — drives evaluation strategy. */
export type AutomationValueType = 'number' | 'color' | 'boolean' | 'string';

/** One automation channel: a single animated property on a single element. */
export interface AutomationChannel {
    /** Canonical ID: `${elementId}.${propertyKey}`. */
    id: string;
    /** The element this channel belongs to. */
    elementId: string;
    /** The property key being automated. */
    propertyKey: string;
    /** Keyframes sorted ascending by tick. */
    keyframes: AutomationKeyframe[];
    /**
     * Legacy channel-level interpolation mode.
     * @deprecated Use per-keyframe segmentInterpolation instead.
     */
    interpolation: AutomationInterpolation;
    /** The value type — determines evaluation strategy. */
    valueType: AutomationValueType;
    /** Default interpolation for newly created keyframes on this channel. */
    defaultInterpolation?: SegmentInterpolation;
}

// ---------------------------------------------------------------------------
// Store slice
// ---------------------------------------------------------------------------

/** Automation state stored inside the scene store. */
export interface AutomationState {
    channels: Record<string, AutomationChannel>;
}

/** Binding state variant for a keyframe-automated property. */
export interface KeyframesBindingState {
    type: 'keyframes';
    channelId: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_SEGMENT_INTERPOLATION: SegmentInterpolation = {
    mode: 'cubic',
    direction: 'ease_in_out',
};

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

function cloneSegmentInterpolation(interpolation: SegmentInterpolation): SegmentInterpolation {
    return {
        ...interpolation,
        params: interpolation.params ? { ...interpolation.params } : undefined,
    };
}

/** Deep-clone a single keyframe, including nested handle and interpolation objects. */
export function cloneKeyframe(kf: AutomationKeyframe): AutomationKeyframe {
    const clone: AutomationKeyframe = { tick: kf.tick, value: kf.value, easingId: kf.easingId };
    if (kf.segmentInterpolation) {
        clone.segmentInterpolation = cloneSegmentInterpolation(kf.segmentInterpolation);
    }
    if (kf.leftHandle) clone.leftHandle = { ...kf.leftHandle };
    if (kf.rightHandle) clone.rightHandle = { ...kf.rightHandle };
    if (kf.leftHandleType) clone.leftHandleType = kf.leftHandleType;
    if (kf.rightHandleType) clone.rightHandleType = kf.rightHandleType;
    return clone;
}

/** Build the canonical channel ID for an element + property pair. */
export function makeChannelId(elementId: string, propertyKey: string): string {
    return `${elementId}.${propertyKey}`;
}

/** Parse a channel ID back into its components. Returns null if malformed. */
export function parseChannelId(channelId: string): { elementId: string; propertyKey: string } | null {
    const dotIndex = channelId.indexOf('.');
    if (dotIndex <= 0 || dotIndex === channelId.length - 1) return null;
    return {
        elementId: channelId.slice(0, dotIndex),
        propertyKey: channelId.slice(dotIndex + 1),
    };
}

/** Create an empty automation state. */
export function createEmptyAutomationState(): AutomationState {
    return { channels: {} };
}

/** Create a new, empty automation channel. */
export function createChannel(
    elementId: string,
    propertyKey: string,
    valueType: AutomationValueType,
    interpolation: AutomationInterpolation = 'eased',
): AutomationChannel {
    return {
        id: makeChannelId(elementId, propertyKey),
        elementId,
        propertyKey,
        keyframes: [],
        interpolation,
        valueType,
        defaultInterpolation: {
            mode: interpolation === 'stepped' ? 'constant'
                : interpolation === 'linear' ? 'linear'
                : 'bezier',
            direction: 'auto',
        },
    };
}

/** Create a keyframe with sensible defaults for the new interpolation system. */
export function createKeyframe(
    tick: number,
    value: unknown,
    interpolation?: SegmentInterpolation,
): AutomationKeyframe {
    return {
        tick,
        value,
        easingId: 'linear',
        segmentInterpolation: cloneSegmentInterpolation(interpolation ?? DEFAULT_SEGMENT_INTERPOLATION),
        leftHandleType: 'auto_clamped',
        rightHandleType: 'auto_clamped',
    };
}

/**
 * Insert a keyframe into a sorted keyframes array (by tick, ascending).
 * If a keyframe exists at the same tick (within `tolerance`), it is replaced.
 * Returns a new array — does not mutate the input.
 */
export function insertKeyframeSorted(
    keyframes: readonly AutomationKeyframe[],
    keyframe: AutomationKeyframe,
    tolerance: number = 0.5,
): AutomationKeyframe[] {
    const result: AutomationKeyframe[] = [];
    let inserted = false;

    for (const existing of keyframes) {
        if (!inserted && Math.abs(existing.tick - keyframe.tick) < tolerance) {
            // Replace existing keyframe at same tick
            result.push(keyframe);
            inserted = true;
            continue;
        }
        if (!inserted && existing.tick > keyframe.tick) {
            result.push(keyframe);
            inserted = true;
        }
        result.push(existing);
    }

    if (!inserted) {
        result.push(keyframe);
    }

    return result;
}

/**
 * Remove the keyframe at the given tick (within `tolerance`).
 * Returns a new array — does not mutate the input.
 */
export function removeKeyframeAtTick(
    keyframes: readonly AutomationKeyframe[],
    tick: number,
    tolerance: number = 0.5,
): AutomationKeyframe[] {
    return keyframes.filter((kf) => Math.abs(kf.tick - tick) >= tolerance);
}

/**
 * Clone a channel, optionally reassigning it to a new element.
 * Returns a new channel object with a fresh keyframes array.
 */
export function cloneChannel(channel: AutomationChannel, newElementId?: string): AutomationChannel {
    const elementId = newElementId ?? channel.elementId;
    return {
        id: makeChannelId(elementId, channel.propertyKey),
        elementId,
        propertyKey: channel.propertyKey,
        keyframes: channel.keyframes.map(cloneKeyframe),
        interpolation: channel.interpolation,
        valueType: channel.valueType,
        defaultInterpolation: channel.defaultInterpolation
            ? cloneSegmentInterpolation(channel.defaultInterpolation)
            : undefined,
    };
}

/**
 * Find the keyframe at exactly the given tick (within tolerance).
 * Returns the keyframe or null.
 */
export function findKeyframeAtTick(
    keyframes: readonly AutomationKeyframe[],
    tick: number,
    tolerance: number = 0.5,
): AutomationKeyframe | null {
    for (const kf of keyframes) {
        if (Math.abs(kf.tick - tick) < tolerance) return kf;
        if (kf.tick > tick + tolerance) break; // sorted, so no point continuing
    }
    return null;
}
