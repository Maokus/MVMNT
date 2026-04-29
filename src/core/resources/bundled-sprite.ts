/**
 * BundledSprite / BundledSparrowHandle — convenience wrappers for bundled plugin assets.
 *
 * Both classes resolve filenames to blob URLs asynchronously on first use and
 * manage a VisualResourceHandle internally. Both expose identical public APIs:
 *   .get()  — returns ResourceHandleResult ready for VisualMedia.setResource()
 *   .build() — creates a new VisualMedia with resource already applied
 *   .destroy() — releases the held reference (safe to call multiple times)
 *
 * Instances created via SceneElement.bundledSprite() / .bundledSparrow() are
 * automatically destroyed when the element is disposed — no manual destroy() call
 * is needed unless you create them outside those factory methods.
 *
 * Load errors are surfaced as status:'error' rather than silently falling back to
 * idle/no-image. Check result.errorMessage for the cause.
 */

import { VisualResourceHandle, type ResourceHandleResult } from './visual-resource-handle';
import { VisualMedia } from '@core/render/render-objects/visual-media';
import type { VisualSourceDescriptor } from './visual-source-descriptor';

// ─── Shared option types ─────────────────────────────────────────────────────

export interface BundledBuildOptions {
    fitMode?: 'contain' | 'cover' | 'fill' | 'none';
    preserveAspectRatio?: boolean;
    includeInLayoutBounds?: boolean;
    /**
     * Draw origin X as a fraction of the container width (0–1).
     * 0 = left edge (default), 0.5 = center, 1 = right edge.
     */
    originX?: number;
    /** Draw origin Y as a fraction of the container height (0–1). */
    originY?: number;
    /**
     * Named animation to play. Ignored for plain images.
     * Pass null (or omit) to play the full frame sequence.
     */
    animation?: string | null;
}

// ─── BundledSprite ────────────────────────────────────────────────────────────

/**
 * Manages a single bundled plugin image asset (PNG, JPG, WebP, or GIF).
 *
 * Resolves the filename to a blob URL via the plugin loader on first use, then
 * feeds the URL into a VisualResourceHandle. Load failures are surfaced as
 * status:'error' rather than silently holding status:'idle'.
 *
 * Create via SceneElement.bundledSprite() so the loader is wired automatically
 * and the handle is auto-tracked for disposal.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _icon = this.bundledSprite('icon.png');
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     return [this._icon.build(0, 0, 64, 64)];
 *   }
 * }
 */
export class BundledSprite {
    private readonly _handle = new VisualResourceHandle();
    private _url: string | null = null;
    private _loading = false;
    private _error: string | null = null;

    constructor(
        private readonly _filename: string,
        private readonly _loader: (filename: string) => Promise<string>
    ) {}

    /**
     * Returns `{ resource, status }` ready to pass to `VisualMedia.setResource()`.
     * Triggers the bundled asset load on the first call; safe to call every frame.
     * When the loader fails, returns status:'error' with an errorMessage.
     */
    get(): ResourceHandleResult {
        if (this._error) {
            return { resource: null, status: 'error', errorMessage: this._error };
        }
        if (!this._url && !this._loading) {
            this._loading = true;
            this._loader(this._filename)
                .then((url) => {
                    this._url = url;
                    this._loading = false;
                })
                .catch((err) => {
                    this._error =
                        err instanceof Error ? err.message : `Failed to load bundled asset: ${this._filename}`;
                    this._loading = false;
                });
        }
        const descriptor: VisualSourceDescriptor | null = this._url
            ? { kind: 'image', src: this._url }
            : null;
        return this._handle.update(descriptor);
    }

    /**
     * Returns a new VisualMedia with the bundled resource already set.
     * Deterministic — derives entirely from current handle state + arguments.
     * Safe to call every frame.
     */
    build(x: number, y: number, width: number, height: number, options?: BundledBuildOptions): VisualMedia {
        const { resource, status } = this.get();
        const vm = new VisualMedia(x, y, width, height, options);
        vm.setResource(resource, status);
        if (options?.animation !== undefined) vm.setAnimation(options.animation);
        return vm;
    }

    /** Release the held reference. Safe to call multiple times. */
    destroy(): void {
        this._handle.destroy();
    }
}

// ─── BundledSparrowHandle ────────────────────────────────────────────────────

/**
 * Manages a bundled Sparrow atlas (paired PNG + XML) that ships inside the
 * plugin's assets/ directory.
 *
 * Resolves both filenames to blob URLs asynchronously, then feeds a
 * SparrowSourceDescriptor into a VisualResourceHandle. Load failures are surfaced
 * as status:'error' rather than silently holding status:'idle'. The optional
 * `_onBothLoaded` callback fires once both URLs are resolved.
 *
 * Create via SceneElement.bundledSparrow() so the loader and registry
 * registration are wired automatically and the handle is auto-tracked for disposal.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _sparrow = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     return [this._sparrow.build(0, 0, 200, 200, { animation: 'idle' })];
 *   }
 * }
 */
export class BundledSparrowHandle {
    private readonly _handle = new VisualResourceHandle();
    private _pngUrl: string | null = null;
    private _xmlUrl: string | null = null;
    private _loading = false;
    private _error: string | null = null;

    constructor(
        private readonly _pngFilename: string,
        private readonly _xmlFilename: string,
        private readonly _loader: (filename: string) => Promise<string>,
        private readonly _onBothLoaded?: (pngUrl: string, xmlUrl: string) => void,
        private readonly _defaultFps?: number
    ) {}

    /**
     * Returns `{ resource, status }` ready to pass to `VisualMedia.setResource()`.
     * Triggers the bundled asset load on the first call; safe to call every frame.
     * When the loader fails, returns status:'error' with an errorMessage.
     */
    get(): ResourceHandleResult {
        if (this._error) {
            return { resource: null, status: 'error', errorMessage: this._error };
        }
        if (!this._pngUrl && !this._loading) {
            this._loading = true;
            Promise.all([this._loader(this._pngFilename), this._loader(this._xmlFilename)])
                .then(([pngUrl, xmlUrl]) => {
                    this._pngUrl = pngUrl;
                    this._xmlUrl = xmlUrl;
                    this._onBothLoaded?.(pngUrl, xmlUrl);
                    this._loading = false;
                })
                .catch((err) => {
                    this._error =
                        err instanceof Error
                            ? err.message
                            : `Failed to load bundled Sparrow atlas: ${this._pngFilename}`;
                    this._loading = false;
                });
        }
        const descriptor: VisualSourceDescriptor | null =
            this._pngUrl && this._xmlUrl
                ? {
                      kind: 'sparrow',
                      imageSrc: this._pngUrl,
                      xmlSrc: this._xmlUrl,
                      ...(this._defaultFps !== undefined ? { defaultFps: this._defaultFps } : {}),
                  }
                : null;
        return this._handle.update(descriptor);
    }

    /**
     * Returns a new VisualMedia with the bundled Sparrow resource already set.
     * Deterministic — derives entirely from current handle state + arguments.
     * Safe to call every frame.
     */
    build(x: number, y: number, width: number, height: number, options?: BundledBuildOptions): VisualMedia {
        const { resource, status } = this.get();
        const vm = new VisualMedia(x, y, width, height, options);
        vm.setResource(resource, status);
        if (options?.animation !== undefined) vm.setAnimation(options.animation);
        return vm;
    }

    /** Release the held reference. Safe to call multiple times. */
    destroy(): void {
        this._handle.destroy();
    }
}
