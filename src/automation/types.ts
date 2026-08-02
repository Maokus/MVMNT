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
    /** Per-segment interpolation mode, direction, and parameters (outgoing). */
    segmentInterpolation: SegmentInterpolation;
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

/** The JS value type stored in keyframes — drives evaluation strategy. */
export type AutomationValueType = 'number' | 'color' | 'boolean' | 'string';

export interface PropertyTarget {
    owner: { kind: 'node' | 'element'; id: string };
    propertyPath: string;
}

export function elementPropertyTarget(elementId: string, propertyPath: string): PropertyTarget {
    return { owner: { kind: 'element', id: elementId }, propertyPath };
}

export function nodePropertyTarget(nodeId: string, propertyPath: string): PropertyTarget {
    return { owner: { kind: 'node', id: nodeId }, propertyPath };
}

export function isPropertyTarget(value: unknown): value is PropertyTarget {
    if (!value || typeof value !== 'object') return false;
    const target = value as any;
    return (
        target.owner &&
        (target.owner.kind === 'node' || target.owner.kind === 'element') &&
        typeof target.owner.id === 'string' &&
        typeof target.propertyPath === 'string'
    );
}

/** Collision-free internal lookup key. Ownership is always read from the target itself. */
export function encodePropertyTarget(target: PropertyTarget): string {
    const { kind, id } = target.owner;
    return `${kind.length}:${kind}${id.length}:${id}${target.propertyPath.length}:${target.propertyPath}`;
}

let channelSequence = 0;

export function createOpaqueChannelId(occupied: ReadonlySet<string> = new Set()): string {
    let id: string;
    do {
        id =
            typeof globalThis.crypto?.randomUUID === 'function'
                ? `channel:${globalThis.crypto.randomUUID()}`
                : `channel:${Date.now().toString(36)}:${(++channelSequence).toString(36)}`;
    } while (occupied.has(id));
    return id;
}

/** One automation channel: a single animated property with structured ownership. */
export interface AutomationChannel {
    /** Independent opaque identity; it never encodes property ownership. */
    id: string;
    target: PropertyTarget;
    /** Keyframes sorted ascending by tick. */
    keyframes: AutomationKeyframe[];
    /** The value type — determines evaluation strategy. */
    valueType: AutomationValueType;
}

// ---------------------------------------------------------------------------
// Store slice
// ---------------------------------------------------------------------------

/** Automation state stored inside the scene store. */
export interface AutomationState {
    channels: Record<string, AutomationChannel>;
    channelIdByTarget?: Record<string, string>;
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
    const clone: AutomationKeyframe = {
        tick: kf.tick,
        value: kf.value,
        segmentInterpolation: cloneSegmentInterpolation(kf.segmentInterpolation),
    };
    if (kf.leftHandle) clone.leftHandle = { ...kf.leftHandle };
    if (kf.rightHandle) clone.rightHandle = { ...kf.rightHandle };
    if (kf.leftHandleType) clone.leftHandleType = kf.leftHandleType;
    if (kf.rightHandleType) clone.rightHandleType = kf.rightHandleType;
    return clone;
}

/** Create an empty automation state. */
export function createEmptyAutomationState(): AutomationState {
    return { channels: {}, channelIdByTarget: {} };
}

export function channelIdForTarget(state: AutomationState, target: PropertyTarget): string | undefined {
    return (
        state.channelIdByTarget?.[encodePropertyTarget(target)] ??
        Object.values(state.channels).find(
            (channel) => encodePropertyTarget(channel.target) === encodePropertyTarget(target)
        )?.id
    );
}

export function channelForTarget(state: AutomationState, target: PropertyTarget): AutomationChannel | undefined {
    const id = channelIdForTarget(state, target);
    return id ? state.channels[id] : undefined;
}

export function rebuildAutomationTargetIndex(channels: Record<string, AutomationChannel>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const channel of Object.values(channels)) {
        if (channel.target) result[encodePropertyTarget(channel.target)] = channel.id;
    }
    return result;
}

/** Persistence-boundary migration for pre-v13 element-owned channels. */
export function migrateLegacyAutomationState(input: unknown): {
    state: AutomationState;
    channelIdMap: Record<string, string>;
} {
    const rawChannels =
        input && typeof input === 'object' && 'channels' in input && (input as any).channels
            ? ((input as any).channels as Record<string, any>)
            : {};
    const channels: Record<string, AutomationChannel> = {};
    const channelIdMap: Record<string, string> = {};
    const reservedIds = new Set(
        Object.values(rawChannels)
            .filter((raw: any) => isPropertyTarget(raw?.target) && typeof raw?.id === 'string')
            .map((raw: any) => raw.id as string)
    );
    const occupied = new Set<string>();
    let migratedSequence = 0;
    for (const [storedId, raw] of Object.entries(rawChannels)) {
        if (!raw || typeof raw !== 'object') continue;
        let target: PropertyTarget | null = isPropertyTarget(raw.target) ? raw.target : null;
        if (!target && typeof raw.elementId === 'string' && typeof raw.propertyKey === 'string') {
            target = elementPropertyTarget(raw.elementId, raw.propertyKey);
        }
        if (!target) {
            const dotIndex = storedId.indexOf('.');
            if (dotIndex > 0 && dotIndex < storedId.length - 1) {
                target = elementPropertyTarget(storedId.slice(0, dotIndex), storedId.slice(dotIndex + 1));
            }
        }
        if (!target) continue;
        const alreadyOpaque = isPropertyTarget(raw.target) && typeof raw.id === 'string';
        const preserveId = alreadyOpaque && !occupied.has(raw.id);
        let id = preserveId ? raw.id : `channel:migrated:${++migratedSequence}`;
        while (occupied.has(id) || (!preserveId && reservedIds.has(id))) {
            id = `channel:migrated:${++migratedSequence}`;
        }
        occupied.add(id);
        channelIdMap[storedId] = id;
        if (typeof raw.id === 'string') channelIdMap[raw.id] = id;
        channels[id] = {
            id,
            target: { owner: { ...target.owner }, propertyPath: target.propertyPath },
            keyframes: Array.isArray(raw.keyframes) ? raw.keyframes.map(cloneKeyframe) : [],
            valueType: raw.valueType,
        };
    }
    return {
        state: { channels, channelIdByTarget: rebuildAutomationTargetIndex(channels) },
        channelIdMap,
    };
}

/** Clone the current structured automation contract used by runtime snapshots and undo. */
export function cloneCurrentAutomationState(input: AutomationState | null | undefined): AutomationState {
    if (!input) return createEmptyAutomationState();
    const channels: Record<string, AutomationChannel> = {};
    for (const [storedId, channel] of Object.entries(input.channels)) {
        if (channel.id !== storedId) {
            throw new Error(`Automation channel key '${storedId}' does not match channel id '${channel.id}'`);
        }
        if (!isPropertyTarget(channel.target)) {
            throw new Error(`Automation channel '${storedId}' has an invalid structured target`);
        }
        channels[storedId] = {
            ...channel,
            target: {
                owner: { ...channel.target.owner },
                propertyPath: channel.target.propertyPath,
            },
            keyframes: channel.keyframes.map(cloneKeyframe),
        };
    }
    return { channels, channelIdByTarget: rebuildAutomationTargetIndex(channels) };
}

/** Create a new, empty automation channel. */
export function createChannel(
    target: PropertyTarget,
    valueType: AutomationValueType,
    occupied: ReadonlySet<string> = new Set()
): AutomationChannel {
    return {
        id: createOpaqueChannelId(occupied),
        target: {
            owner: { ...target.owner },
            propertyPath: target.propertyPath,
        },
        keyframes: [],
        valueType,
    };
}

/** Create a keyframe with sensible defaults for the new interpolation system. */
export function createKeyframe(tick: number, value: unknown, interpolation?: SegmentInterpolation): AutomationKeyframe {
    return {
        tick,
        value,
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
    tolerance: number = 0.5
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
    tolerance: number = 0.5
): AutomationKeyframe[] {
    return keyframes.filter((kf) => Math.abs(kf.tick - tick) >= tolerance);
}

/**
 * Clone a channel, optionally reassigning it to a new element.
 * Returns a new channel object with a fresh keyframes array.
 */
export function cloneChannel(
    channel: AutomationChannel,
    newTarget: PropertyTarget = channel.target,
    occupied: ReadonlySet<string> = new Set()
): AutomationChannel {
    return {
        id: createOpaqueChannelId(occupied),
        target: { owner: { ...newTarget.owner }, propertyPath: newTarget.propertyPath },
        keyframes: channel.keyframes.map(cloneKeyframe),
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
    tolerance: number = 0.5
): AutomationKeyframe | null {
    for (const kf of keyframes) {
        if (Math.abs(kf.tick - tick) < tolerance) return kf;
        if (kf.tick > tick + tolerance) break; // sorted, so no point continuing
    }
    return null;
}
