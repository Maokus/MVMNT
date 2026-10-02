/** Accumulates foreground workspace time into the current project's metadata. */
export class ProjectTimeTracker {
    private lastTick: number | null = null;
    private pendingMs = 0;
    private interval: ReturnType<typeof setInterval> | null = null;

    constructor(private readonly addSeconds: (seconds: number) => void) {}

    private isActive() {
        return document.visibilityState === 'visible' && document.hasFocus();
    }

    flush = () => {
        const now = performance.now();
        if (this.lastTick !== null) {
            // A suspended computer can delay a timer without any editing taking place.
            const elapsed = Math.min(Math.max(0, now - this.lastTick), 60_000);
            this.pendingMs += elapsed;
            const wholeSeconds = Math.floor(this.pendingMs / 1000);
            if (wholeSeconds > 0) {
                this.pendingMs -= wholeSeconds * 1000;
                this.addSeconds(wholeSeconds);
            }
        }
        this.lastTick = this.isActive() ? now : null;
    };

    /** Includes the current foreground interval without changing saved metadata. */
    currentSeconds() {
        const elapsed =
            this.lastTick !== null && this.isActive()
                ? Math.min(Math.max(0, performance.now() - this.lastTick), 60_000)
                : 0;
        return (this.pendingMs + elapsed) / 1000;
    }

    private updateActivity = () => {
        this.flush();
        if (!this.isActive()) this.lastTick = null;
    };

    start() {
        this.lastTick = this.isActive() ? performance.now() : null;
        this.interval = setInterval(this.updateActivity, 30_000);
        window.addEventListener('focus', this.updateActivity);
        window.addEventListener('blur', this.updateActivity);
        window.addEventListener('pagehide', this.pause);
        document.addEventListener('visibilitychange', this.updateActivity);
        activeTracker = this;
    }

    stop() {
        this.flush();
        if (this.interval !== null) clearInterval(this.interval);
        window.removeEventListener('focus', this.updateActivity);
        window.removeEventListener('blur', this.updateActivity);
        window.removeEventListener('pagehide', this.pause);
        document.removeEventListener('visibilitychange', this.updateActivity);
        if (activeTracker === this) activeTracker = null;
        this.lastTick = null;
    }

    /** Called when a different document replaces the current one. */
    reset() {
        this.pendingMs = 0;
        this.lastTick = this.isActive() ? performance.now() : null;
    }

    pause = () => {
        this.flush();
        this.lastTick = null;
    };

    suspend() {
        this.lastTick = null;
    }
}

let activeTracker: ProjectTimeTracker | null = null;

export function flushProjectTime() {
    activeTracker?.flush();
}

export function resetProjectTimeClock() {
    activeTracker?.reset();
}

export function suspendProjectTime() {
    activeTracker?.suspend();
}

export function getProjectTimeSpentSeconds(persistedSeconds: number) {
    return persistedSeconds + (activeTracker?.currentSeconds() ?? 0);
}
