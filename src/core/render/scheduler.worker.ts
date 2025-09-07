/* eslint-disable @typescript-eslint/no-explicit-any */
// Optional Phase 3 worker scaffold (feature-flagged in app; not wired by default)
import { compileWindow } from './compile';

type InMsg =
    | { type: 'CONFIG'; payload: Parameters<typeof compileWindow>[0] & { nowSec: number; lookAheadSec: number } }
    | { type: 'TICK'; nowSec: number };

let lastConfig: any = null;

self.onmessage = (ev: MessageEvent<InMsg>) => {
    const msg = ev.data;
    if (msg.type === 'CONFIG') {
        lastConfig = { ...msg.payload };
        // immediate compile for current window
        const batch = compileWindow(lastConfig);
        (self as any).postMessage({ type: 'SCHEDULE_BATCH', payload: batch });
    } else if (msg.type === 'TICK') {
        if (!lastConfig) return;
        const cfg = { ...lastConfig, nowSec: msg.nowSec };
        const batch = compileWindow(cfg);
        (self as any).postMessage({ type: 'SCHEDULE_BATCH', payload: batch });
    }
};
