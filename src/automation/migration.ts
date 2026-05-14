/**
 * Automation Migration — converts legacy easing data to the hybrid interpolation model.
 *
 * Legacy keyframes store a flat `easingId` string and the channel has a single
 * `interpolation` mode ('linear' | 'stepped' | 'eased'). This module migrates
 * that to the new per-keyframe `segmentInterpolation` descriptor.
 *
 * The migration is idempotent: keyframes that already have `segmentInterpolation`
 * are left unchanged.
 */

import type {
    AutomationChannel,
    AutomationInterpolation,
    AutomationKeyframe,
    AutomationState,
    EasingDirection,
    SegmentInterpolation,
    SegmentInterpolationMode,
} from './types';

// ---------------------------------------------------------------------------
// Legacy easing ID → (mode, direction) mapping
// ---------------------------------------------------------------------------

const EASING_ID_MAP: Record<string, { mode: SegmentInterpolationMode; direction: EasingDirection }> = {
    linear:          { mode: 'linear',   direction: 'auto' },
    hold:            { mode: 'constant', direction: 'auto' },

    easeInQuad:      { mode: 'quad',    direction: 'ease_in' },
    easeOutQuad:     { mode: 'quad',    direction: 'ease_out' },
    easeInOutQuad:   { mode: 'quad',    direction: 'ease_in_out' },

    easeInCubic:     { mode: 'cubic',   direction: 'ease_in' },
    easeOutCubic:    { mode: 'cubic',   direction: 'ease_out' },
    easeInOutCubic:  { mode: 'cubic',   direction: 'ease_in_out' },

    easeInQuart:     { mode: 'quart',   direction: 'ease_in' },
    easeOutQuart:    { mode: 'quart',   direction: 'ease_out' },
    easeInOutQuart:  { mode: 'quart',   direction: 'ease_in_out' },

    easeInQuint:     { mode: 'quint',   direction: 'ease_in' },
    easeOutQuint:    { mode: 'quint',   direction: 'ease_out' },
    easeInOutQuint:  { mode: 'quint',   direction: 'ease_in_out' },

    easeInSine:      { mode: 'sine',    direction: 'ease_in' },
    easeOutSine:     { mode: 'sine',    direction: 'ease_out' },
    easeInOutSine:   { mode: 'sine',    direction: 'ease_in_out' },

    easeInExpo:      { mode: 'expo',    direction: 'ease_in' },
    easeOutExpo:     { mode: 'expo',    direction: 'ease_out' },
    easeInOutExpo:   { mode: 'expo',    direction: 'ease_in_out' },

    easeInCirc:      { mode: 'circ',    direction: 'ease_in' },
    easeOutCirc:     { mode: 'circ',    direction: 'ease_out' },
    easeInOutCirc:   { mode: 'circ',    direction: 'ease_in_out' },

    easeInBack:      { mode: 'back',    direction: 'ease_in' },
    easeOutBack:     { mode: 'back',    direction: 'ease_out' },
    easeInOutBack:   { mode: 'back',    direction: 'ease_in_out' },

    easeInElastic:   { mode: 'elastic', direction: 'ease_in' },
    easeOutElastic:  { mode: 'elastic', direction: 'ease_out' },
    easeInOutElastic:{ mode: 'elastic', direction: 'ease_in_out' },

    easeInBounce:    { mode: 'bounce',  direction: 'ease_in' },
    easeOutBounce:   { mode: 'bounce',  direction: 'ease_out' },
    easeInOutBounce: { mode: 'bounce',  direction: 'ease_in_out' },
};

// ---------------------------------------------------------------------------
// Per-keyframe migration
// ---------------------------------------------------------------------------

/**
 * Migrate a single keyframe's easing data to segmentInterpolation.
 * Returns a new keyframe object (does not mutate the input).
 */
export function migrateKeyframe(
    kf: AutomationKeyframe,
    channelInterpolation: AutomationInterpolation,
): AutomationKeyframe {
    // Already migrated — skip
    if (kf.segmentInterpolation) return kf;

    let segmentInterpolation: SegmentInterpolation;

    // Channel-level mode overrides per-keyframe easing for stepped/linear
    if (channelInterpolation === 'stepped') {
        segmentInterpolation = { mode: 'constant', direction: 'auto' };
    } else if (channelInterpolation === 'linear') {
        segmentInterpolation = { mode: 'linear', direction: 'auto' };
    } else {
        // 'eased' — look up the per-keyframe easingId
        const mapped = EASING_ID_MAP[kf.easingId];
        segmentInterpolation = mapped
            ? { mode: mapped.mode, direction: mapped.direction }
            : { mode: 'linear', direction: 'auto' };
    }

    return {
        ...kf,
        segmentInterpolation,
        // Default handle types for future bezier use — handles auto-computed on demand
        leftHandleType: kf.leftHandleType ?? 'auto_clamped',
        rightHandleType: kf.rightHandleType ?? 'auto_clamped',
    };
}

// ---------------------------------------------------------------------------
// Channel and state migration
// ---------------------------------------------------------------------------

/** Migrate all keyframes in a channel. Returns a new channel object. */
export function migrateChannel(channel: AutomationChannel): AutomationChannel {
    const needsMigration = channel.keyframes.some((kf) => !kf.segmentInterpolation);
    if (!needsMigration) return channel;

    return {
        ...channel,
        keyframes: channel.keyframes.map((kf) => migrateKeyframe(kf, channel.interpolation)),
    };
}

/**
 * Migrate an entire automation state. Idempotent — channels already using
 * segmentInterpolation are passed through unchanged.
 */
export function migrateAutomationState(state: AutomationState): AutomationState {
    const channels: Record<string, AutomationChannel> = {};
    let changed = false;

    for (const [id, channel] of Object.entries(state.channels)) {
        const migrated = migrateChannel(channel);
        channels[id] = migrated;
        if (migrated !== channel) changed = true;
    }

    return changed ? { channels } : state;
}
