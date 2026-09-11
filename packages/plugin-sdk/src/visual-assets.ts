import type { Result } from './api.js';

export interface AssetHandle {
    readonly url: string;
    dispose(): void;
}

export type VisualAssetStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Opaque snapshot that can be passed directly to VisualMedia.setResource().
 * The resource is deliberately host-owned: plugins may render it but cannot
 * inspect or retain the application's decoded media objects.
 */
export interface VisualAssetSnapshot {
    readonly resource: unknown | null;
    readonly status: VisualAssetStatus;
    readonly errorMessage?: string;
}

export interface ProjectVisualAssetHandle {
    update(assetId: string | null): VisualAssetSnapshot;
    dispose(): void;
}

export interface BundledVisualAssetHandle {
    get(): VisualAssetSnapshot;
    dispose(): void;
}

export interface GridAtlasLayout {
    readonly columns: number;
    readonly rows: number;
    readonly frameDurationMs?: number;
}

export interface GeneratedRasterRequest {
    readonly contentKey: string;
    readonly width: number;
    readonly height: number;
    readonly format: 'rgba8';
    /** Runs synchronously only on a cache miss. */
    readonly build: () => Uint8ClampedArray;
}

export interface AssetApi {
    load(path: string): Promise<Result<AssetHandle>>;
    project(): ProjectVisualAssetHandle;
    bundledImage(path: string): BundledVisualAssetHandle;
    bundledSparrow(imagePath: string, xmlPath: string, defaultFps?: number): BundledVisualAssetHandle;
    bundledGridAtlas(imagePath: string, layout: GridAtlasLayout): BundledVisualAssetHandle;
    generatedRaster(request: GeneratedRasterRequest): Result<VisualAssetSnapshot>;
}

export class VisualMediaPlayback {
    speed = 1;
    startOffset = 0;
    computeLocalTime(sceneTimeSeconds: number): number {
        return Math.max(0, sceneTimeSeconds - this.startOffset) * this.speed;
    }
}

export type ResourceStatus = VisualAssetStatus;
export type ResourceHandleResult = VisualAssetSnapshot;
/** @deprecated Use the opaque `VisualAssetSnapshot.resource` value directly. */
export type VisualResource = unknown;
/** @deprecated Compatibility alias for plugins authored before `BundledVisualAssetHandle` was named. */
export type BundledSprite = BundledVisualAssetHandle & Readonly<{ destroy(): void }>;
