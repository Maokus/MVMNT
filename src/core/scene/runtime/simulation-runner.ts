import type {
    ElementSimulation,
    SimulationContext,
    SimulationSnapshot,
} from '../../../../packages/plugin-sdk/src/scene';
import { createSimulationRandom } from './deterministic-random';

export class SimulationPending extends Error {}
export type SimulationStatus = 'idle' | 'preparing' | 'pending' | 'ready' | 'error' | 'disposed';
export interface SimulationReadiness {
    readonly status: SimulationStatus;
    readonly reason?: string;
    readonly completedStep: number;
    readonly targetStep: number;
    readonly changedAt: number;
    /** True when preview can keep showing completed element output while this target prepares. */
    readonly hasRenderableFrame?: boolean;
    /** Number of canonical steps between the completed state and current target. */
    readonly lagSteps?: number;
}
export const SIMULATION_PLACEHOLDER_GRACE_MS = 150;
export const SIMULATION_PENDING_NOTICE_GRACE_MS = 500;
export interface SimulationInputs {
    readonly identity: object;
    propsAt(seconds: number): Readonly<Record<string, unknown>>;
    contextAt(step: number, dt: number): Omit<SimulationContext<any>, 'random'>;
    /** A failed read must prevent committing even if plugin code catches or ignores it. */
    checkReads(): void;
}

/** Snap only within floating-point roundoff of an integer, never a visible fraction of a step. */
export function simulationStepAt(seconds: number, dt: number): number {
    if (!Number.isFinite(seconds)) throw new Error('Simulation time must be finite');
    const value = Math.max(0, seconds) / dt;
    const nearest = Math.round(value);
    const index =
        Math.abs(value - nearest) <= Math.min(1e-7, 8 * Number.EPSILON * Math.max(1, value))
            ? nearest
            : Math.floor(value);
    if (!Number.isSafeInteger(index)) throw new Error('Simulation step index exceeds the safe integer range');
    return index;
}

export function copySimulationData<T>(value: T): { value: T; bytes: number } {
    const ancestors = new Set<object>();
    let bytes = 0;
    const copy = (item: any): any => {
        if (item === null || item === undefined || typeof item === 'boolean') {
            bytes += 8;
            return item;
        }
        if (typeof item === 'string') {
            bytes += item.length * 2;
            return item;
        }
        if (typeof item === 'number') {
            if (!Number.isFinite(item)) throw new Error('Simulation numbers must be finite');
            bytes += 8;
            return item;
        }
        if (typeof item !== 'object') throw new Error('Simulation state must contain plain data');
        if (
            typeof SharedArrayBuffer !== 'undefined' &&
            (item instanceof SharedArrayBuffer || item.buffer instanceof SharedArrayBuffer)
        )
            throw new Error('Shared memory is not simulation state');
        if (ArrayBuffer.isView(item) && !(item instanceof DataView)) {
            if (
                (item instanceof Float32Array ||
                    item instanceof Float64Array ||
                    (typeof Float16Array !== 'undefined' && item instanceof Float16Array)) &&
                item.some((value) => !Number.isFinite(value))
            )
                throw new Error('Simulation numbers must be finite');
            bytes += item.byteLength;
            return (item as any).slice();
        }
        if (ancestors.has(item)) throw new Error('Simulation state cannot contain cycles');
        if (
            !Array.isArray(item) &&
            Object.getPrototypeOf(item) !== Object.prototype &&
            Object.getPrototypeOf(item) !== null
        )
            throw new Error('Simulation state cannot contain class instances or resources');
        ancestors.add(item);
        const result: any = Array.isArray(item) ? new Array(item.length) : {};
        for (const key of Reflect.ownKeys(item)) {
            if (Array.isArray(item) && key === 'length') continue;
            if (typeof key !== 'string') throw new Error('Simulation state cannot contain symbol keys');
            const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
            if (!('value' in descriptor)) throw new Error('Simulation state cannot contain accessors');
            bytes += key.length * 2;
            Object.defineProperty(result, key, {
                value: copy(descriptor.value),
                enumerable: true,
                writable: true,
                configurable: true,
            });
        }
        ancestors.delete(item);
        bytes += 16;
        return result;
    };
    return { value: copy(value), bytes };
}

function freezePlain<T>(value: T): T {
    if (import.meta.env.DEV && value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
        Object.values(value).forEach(freezePlain);
        Object.freeze(value);
    }
    return value;
}

const scheduled = new Set<SimulationRunner>();
const SYNCHRONOUS_PREVIEW_STEPS = 4;
let timer: ReturnType<typeof setTimeout> | undefined;
function schedule(runner: SimulationRunner): void {
    scheduled.add(runner);
    if (timer !== undefined) return;
    timer = setTimeout(() => {
        timer = undefined;
        const next = scheduled.values().next().value as SimulationRunner | undefined;
        if (!next) return;
        scheduled.delete(next);
        next.advanceChunk();
        const remaining = scheduled.values().next().value as SimulationRunner | undefined;
        if (remaining) schedule(remaining);
    }, 0);
}

/** Host-owned canonical stepping. Render callbacks only receive defensive snapshots. */
export class SimulationRunner {
    status: SimulationStatus = 'idle';
    error?: Error;
    private reason = 'Waiting to prepare simulation';
    private changedAt = performance.now();
    private input?: SimulationInputs;
    private target = 0;
    private step = -1;
    private seed?: number;
    private state: unknown;
    private readonly checkpoints = new Map<number, { state: unknown; bytes: number }>();
    private checkpointBytes = 0;
    private readonly listeners = new Set<() => void>();
    readonly dt: number;

    constructor(
        private readonly definition: ElementSimulation<any, any>,
        private readonly changed: () => void,
        private readonly limits = { checkpoints: 32, bytes: 32 * 1024 * 1024 }
    ) {
        this.dt = definition.stepSeconds ?? 1 / 120;
        if (!Number.isFinite(this.dt) || this.dt <= 0) throw new Error('Simulation step must be finite and positive');
    }

    private setStatus(status: SimulationStatus, reason?: string, notify = true): void {
        const nextReason = reason ?? this.defaultReason(status);
        if (this.status !== status || this.reason !== nextReason) this.changedAt = performance.now();
        this.status = status;
        this.reason = nextReason;
        if (!notify) return;
        this.changed();
        for (const listener of [...this.listeners]) listener();
    }

    private defaultReason(status: SimulationStatus): string {
        switch (status) {
            case 'idle':
                return 'Waiting to prepare simulation';
            case 'preparing':
                return `Calculating simulation at ${(this.target * this.dt).toFixed(2)} s`;
            case 'pending':
                return 'Simulation inputs are not ready';
            case 'error':
                return this.error?.message ?? 'Simulation failed';
            case 'disposed':
                return 'Simulation was disposed';
            case 'ready':
                return '';
        }
    }

    getReadiness(): SimulationReadiness {
        return Object.freeze({
            status: this.status,
            ...(this.reason ? { reason: this.reason } : {}),
            completedStep: this.step,
            targetStep: this.target,
            changedAt: this.changedAt,
            lagSteps: Math.max(0, this.target - this.step),
        });
    }

    request(seconds: number, input: SimulationInputs): void {
        if (this.status === 'disposed') return;
        const target = simulationStepAt(seconds, this.dt);
        if (this.input?.identity !== input.identity) {
            this.input = input;
            this.state = undefined;
            this.seed = undefined;
            this.step = -1;
            this.error = undefined;
            this.checkpoints.clear();
            this.checkpointBytes = 0;
            this.status = 'idle';
            this.reason = this.defaultReason('idle');
            this.changedAt = performance.now();
        }
        if (this.status === 'error') return;
        if (
            target === this.target &&
            (this.status === 'pending' || this.status === 'preparing' || this.status === 'ready')
        )
            return;
        this.target = target;
        if (target < this.step) {
            const index = [...this.checkpoints.keys()].filter((index) => index <= target).sort((a, b) => b - a)[0];
            if (index !== undefined) {
                const checkpoint = this.checkpoints.get(index)!;
                this.checkpoints.delete(index);
                this.checkpoints.set(index, checkpoint);
                this.state = copySimulationData(checkpoint.state).value;
                this.step = index;
            } else {
                this.step = -1;
                this.state = undefined;
            }
        }
        if (this.step === target) this.setStatus('ready');
        else {
            // Normal playback usually advances by only one or two fixed steps.
            // Complete those small requests before renderAtTime asks for the
            // snapshot so the canvas does not alternate between a frame and an
            // empty "preparing" render. Large seeks remain cooperative.
            if (target - this.step <= SYNCHRONOUS_PREVIEW_STEPS) {
                // advanceChunk requires the preparing state, but observers only
                // need to hear about it if the work cannot complete inline.
                this.setStatus('preparing', undefined, false);
                this.advanceChunk();
            } else {
                this.setStatus('preparing');
                schedule(this);
            }
        }
    }

    advanceChunk(): void {
        if (this.status !== 'preparing' || !this.input) return;
        const started = performance.now();
        try {
            if (this.step < 0) {
                const props = freezePlain(copySimulationData(this.input.propsAt(0)).value);
                const seed = props.seed;
                if (typeof seed !== 'number' || !Number.isFinite(seed))
                    throw new Error('Simulation seed must be finite');
                this.seed = seed;
                this.state = copySimulationData(
                    this.definition.initialize({ props, seed, random: createSimulationRandom(seed, 0) })
                ).value;
                this.input.checkReads();
                this.step = 0;
                this.saveCheckpoint();
            }
            for (let count = 0; this.step < this.target && count < 240; count++) {
                const time = this.step * this.dt;
                const context = Object.freeze({
                    ...this.input.contextAt(this.step, this.dt),
                    random: createSimulationRandom(this.seed!, this.step),
                });
                const props = freezePlain(copySimulationData(this.input.propsAt(time)).value);
                const next = this.definition.step({
                    state: freezePlain(copySimulationData(this.state).value) as any,
                    props,
                    time: Object.freeze({ seconds: time, stepIndex: this.step }),
                    deltaSeconds: this.dt,
                    context,
                });
                this.input.checkReads();
                this.state = copySimulationData(next).value;
                this.step++;
                if (this.step % 120 === 0) this.saveCheckpoint();
                if (performance.now() - started >= 8) break;
            }
            if (this.step === this.target) this.setStatus('ready');
            else {
                // Publish at most once per cooperative chunk. Preview can use
                // the newest completed canonical step without observing a
                // half-executed transition.
                this.setStatus('preparing');
                schedule(this);
            }
        } catch (error) {
            if (error instanceof SimulationPending) this.setStatus('pending', error.message);
            else {
                this.error = error instanceof Error ? error : new Error(String(error));
                this.setStatus('error', this.error.message);
            }
        }
    }

    private saveCheckpoint(): void {
        const copy = copySimulationData(this.state);
        if (copy.bytes > this.limits.bytes || this.limits.checkpoints <= 0) return;
        this.checkpointBytes -= this.checkpoints.get(this.step)?.bytes ?? 0;
        this.checkpoints.delete(this.step);
        this.checkpoints.set(this.step, { state: copy.value, bytes: copy.bytes });
        this.checkpointBytes += copy.bytes;
        while (this.checkpoints.size > this.limits.checkpoints || this.checkpointBytes > this.limits.bytes) {
            const oldest = this.checkpoints.keys().next().value!;
            this.checkpointBytes -= this.checkpoints.get(oldest)!.bytes;
            this.checkpoints.delete(oldest);
        }
    }

    snapshot(seconds: number): SimulationSnapshot<any> | undefined {
        if (this.status !== 'ready' || this.step !== simulationStepAt(seconds, this.dt)) return undefined;
        return this.completedSnapshot();
    }

    /** Latest completed state at or before the requested preview time. Never used by exact export preparation. */
    previewSnapshot(seconds: number): SimulationSnapshot<any> | undefined {
        const requestedStep = simulationStepAt(seconds, this.dt);
        if (this.step < 0 || this.step > requestedStep || this.state === undefined) return undefined;
        return this.completedSnapshot();
    }

    private completedSnapshot(): SimulationSnapshot<any> {
        return Object.freeze({
            state: freezePlain(copySimulationData(this.state).value) as any,
            stepIndex: this.step,
            timeSeconds: this.step * this.dt,
        });
    }

    async prepare(seconds: number, input: SimulationInputs, signal?: AbortSignal): Promise<void> {
        if (signal?.aborted) throw new DOMException('Simulation cancelled', 'AbortError');
        this.request(seconds, input);
        const target = simulationStepAt(seconds, this.dt);
        await new Promise<void>((resolve, reject) => {
            const cleanup = () => {
                this.listeners.delete(check);
                signal?.removeEventListener('abort', check);
            };
            const check = () => {
                if (
                    signal?.aborted ||
                    this.status === 'disposed' ||
                    this.input?.identity !== input.identity ||
                    this.target !== target
                ) {
                    cleanup();
                    reject(new DOMException('Simulation cancelled', 'AbortError'));
                } else if (this.status === 'error') {
                    cleanup();
                    reject(this.error);
                } else if (this.status === 'pending') {
                    cleanup();
                    reject(new SimulationPending(this.reason || 'Simulation inputs are not ready'));
                } else if (this.status === 'ready') {
                    cleanup();
                    resolve();
                }
            };
            this.listeners.add(check);
            signal?.addEventListener('abort', check, { once: true });
            check();
        });
    }

    dispose(): void {
        scheduled.delete(this);
        this.checkpoints.clear();
        this.checkpointBytes = 0;
        this.state = undefined;
        this.seed = undefined;
        this.input = undefined;
        this.setStatus('disposed');
        this.listeners.clear();
    }
}
