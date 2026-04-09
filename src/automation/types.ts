/**
 * Automation System — Core Types
 *
 * Data model for keyframe-based property automation. An AutomationChannel
 * stores an ordered list of keyframes for a single property on a single
 * element. The binding system references channels by ID.
 */

// ---------------------------------------------------------------------------
// Keyframe
// ---------------------------------------------------------------------------

/** A single keyframe on an automation channel. */
export interface AutomationKeyframe {
    /** Absolute tick position on the timeline. */
    tick: number;
    /** The property value at this tick (number, hex color string, or boolean). */
    value: unknown;
    /** Key into the easing library applied *from* this keyframe to the next. */
    easingId: string;
}

// ---------------------------------------------------------------------------
// Channel
// ---------------------------------------------------------------------------

/** How values are interpolated between keyframes. */
export type AutomationInterpolation = 'linear' | 'stepped' | 'eased';

/** The JS value type stored in keyframes — drives evaluation strategy. */
export type AutomationValueType = 'number' | 'color' | 'boolean';

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
    /** Interpolation mode for the channel. */
    interpolation: AutomationInterpolation;
    /** The value type — determines evaluation strategy. */
    valueType: AutomationValueType;
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
// Utility functions
// ---------------------------------------------------------------------------

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
        keyframes: channel.keyframes.map((kf) => ({ ...kf })),
        interpolation: channel.interpolation,
        valueType: channel.valueType,
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
