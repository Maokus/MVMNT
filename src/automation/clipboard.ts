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
