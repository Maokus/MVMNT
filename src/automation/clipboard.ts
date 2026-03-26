/**
 * In-memory clipboard for automation channel copy/paste.
 * Transient — does not persist across sessions.
 */

import type { AutomationChannel, AutomationKeyframe } from './types';

interface AutomationClipboardState {
    keyframes: AutomationKeyframe[];
    valueType: AutomationChannel['valueType'];
    interpolation: AutomationChannel['interpolation'];
}

let clipboard: AutomationClipboardState | null = null;

/** Copy a channel's keyframes to clipboard. */
export function copyChannel(channel: AutomationChannel): void {
    clipboard = {
        keyframes: channel.keyframes.map((kf) => ({ ...kf })),
        valueType: channel.valueType,
        interpolation: channel.interpolation,
    };
}

/** Get the current clipboard content, or null. */
export function getClipboard(): AutomationClipboardState | null {
    return clipboard;
}

/** Clear the clipboard. */
export function clearClipboard(): void {
    clipboard = null;
}

// ---------------------------------------------------------------------------
// Selected-keyframes clipboard (for multi-keyframe copy/paste)
// ---------------------------------------------------------------------------

export interface KeyframeSelectionClipboard {
    entries: Array<{ channelId: string; keyframes: AutomationKeyframe[] }>;
    /** The lowest tick among all copied keyframes — used to offset on paste. */
    minTick: number;
}

let keyframeSelClipboard: KeyframeSelectionClipboard | null = null;

/** Copy a set of selected keyframes (grouped by channel) to the selection clipboard. */
export function copySelectedKeyframes(
    entries: Array<{ channelId: string; keyframes: AutomationKeyframe[] }>,
): void {
    if (entries.length === 0) return;
    const allTicks = entries.flatMap((e) => e.keyframes.map((kf) => kf.tick));
    const minTick = Math.min(...allTicks);
    keyframeSelClipboard = {
        entries: entries.map((e) => ({
            channelId: e.channelId,
            keyframes: e.keyframes.map((kf) => ({ ...kf })),
        })),
        minTick,
    };
}

/** Get the current selection clipboard, or null. */
export function getKeyframeSelClipboard(): KeyframeSelectionClipboard | null {
    return keyframeSelClipboard;
}
