/** Serializes memory-heavy work and lets playback move ahead of background preparation. */
export class AudioWorkQueue {
    private pending: {
        key: object;
        priority: number;
        run: () => Promise<unknown>;
        resolve: (value: any) => void;
        reject: (error: unknown) => void;
    }[] = [];
    private requests = new WeakMap<object, Promise<any>>();
    private running = false;

    getStats(): { active: boolean; queued: number } {
        return { active: this.running, queued: this.pending.length };
    }

    schedule<T>(key: object, run: () => Promise<T>, priority = 0): Promise<T> {
        const existing = this.requests.get(key);
        if (existing) {
            const queued = this.pending.find((job) => job.key === key);
            if (queued) queued.priority = Math.max(queued.priority, priority);
            return existing;
        }
        const promise = new Promise<T>((resolve, reject) => {
            this.pending.push({ key, priority, run, resolve, reject });
        });
        this.requests.set(key, promise);
        void this.drain();
        return promise;
    }

    private async drain() {
        if (this.running) return;
        this.running = true;
        try {
            while (this.pending.length) {
                this.pending.sort((a, b) => b.priority - a.priority);
                const job = this.pending.shift()!;
                try {
                    job.resolve(await job.run());
                } catch (error) {
                    job.reject(error);
                } finally {
                    this.requests.delete(job.key);
                }
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
            }
        } finally {
            this.running = false;
        }
    }
}

export const audioDecodeQueue = new AudioWorkQueue();
