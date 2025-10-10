import { create } from 'zustand';
import type { RendererFrameTarget } from '@core/render/renderer-contract';
import type { RendererDiagnostics } from '@core/render/webgl/types';
import type { SceneRendererType } from '@state/sceneStore';

export type RendererBackend = SceneRendererType | 'unknown';
export type RendererContextKind = RendererDiagnostics['contextType'] | 'canvas2d';

export interface RenderFrameDiagnosticsSnapshot {
    renderer: RendererBackend;
    contextType: RendererContextKind;
    frameHash: string | null;
    drawCalls: number | null;
    bytesHashed: number | null;
    frameTimeMs: number;
    timestamp: number;
    target?: RendererFrameTarget;
    resources?: RendererDiagnostics['resources'];
}

export interface RenderDeterminismIssue {
    key: string;
    frameIndex: number | null;
    mode: RendererFrameTarget['mode'];
    previousHash: string;
    nextHash: string;
    timestamp: number;
}

export interface RenderErrorSnapshot {
    renderer: RendererBackend;
    message: string;
    stack?: string;
    timestamp: number;
}

export interface RenderDiagnosticsState {
    lastFrame: RenderFrameDiagnosticsSnapshot | null;
    lastError: RenderErrorSnapshot | null;
    determinismIssues: RenderDeterminismIssue[];
    recordFrame: (snapshot: RenderFrameDiagnosticsSnapshot) => void;
    recordError: (error: Error, context: { renderer: RendererBackend }) => void;
    reset: () => void;
}

const frameHashHistory = new Map<string, string>();
const DETERMINISM_HISTORY_LIMIT = 25;

export const useRenderDiagnosticsStore = create<RenderDiagnosticsState>((set) => ({
    lastFrame: null,
    lastError: null,
    determinismIssues: [],
    recordFrame: (snapshot) => {
        set((state) => {
            const issues = [...state.determinismIssues];
            const target = snapshot.target;
            const frameIndex = target?.frameIndex ?? null;
            if (snapshot.frameHash && target?.mode === 'export' && frameIndex != null) {
                const key = `${target.mode}:${frameIndex}`;
                const previousHash = frameHashHistory.get(key);
                if (previousHash && previousHash !== snapshot.frameHash) {
                    issues.push({
                        key,
                        frameIndex,
                        mode: target.mode,
                        previousHash,
                        nextHash: snapshot.frameHash,
                        timestamp: snapshot.timestamp,
                    });
                }
                frameHashHistory.set(key, snapshot.frameHash);
            }
            while (issues.length > DETERMINISM_HISTORY_LIMIT) {
                issues.shift();
            }
            return {
                lastFrame: snapshot,
                determinismIssues: issues,
            } satisfies Partial<RenderDiagnosticsState>;
        });
    },
    recordError: (error, context) => {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        set({
            lastError: {
                renderer: context.renderer,
                message,
                stack,
                timestamp: Date.now(),
            },
        });
    },
    reset: () => {
        frameHashHistory.clear();
        set({ lastFrame: null, lastError: null, determinismIssues: [] });
    },
}));
