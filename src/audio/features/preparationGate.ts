let holds = 0;
const listeners = new Set<() => void>();

export function isAudioPreparationSuspended(): boolean {
    return holds > 0;
}
export function onAudioPreparationReleased(listener: () => void): void {
    listeners.add(listener);
}

/** Import publishes caches and source originals before declarative jobs may inspect them. */
export function suspendAudioPreparation(): () => void {
    holds++;
    let released = false;
    return () => {
        if (released) return;
        released = true;
        holds--;
        if (!holds) for (const listener of listeners) listener();
    };
}
