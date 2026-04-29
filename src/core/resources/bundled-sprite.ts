/**
 * BundledSprite / BundledSparrowHandle — convenience wrappers for bundled plugin assets.
 *
 * Both classes resolve filenames to blob URLs asynchronously on first use and
 * manage a VisualResourceHandle internally. Elements call .get() each frame to
 * receive a ResourceHandleResult ready for VisualMedia.setResource().
 */

import { VisualResourceHandle, type ResourceHandleResult } from './visual-resource-handle';
import { VisualMedia } from '@core/render/render-objects/visual-media';
import type { VisualSourceDescriptor } from './visual-source-descriptor';

// ─── BundledSprite ────────────────────────────────────────────────────────────

/**
 * Manages a single bundled plugin image asset (PNG, JPG, WebP, or GIF).
 *
 * Resolves the filename to a blob URL via the plugin loader on first use, then
 * feeds the URL into a VisualResourceHandle. Exposes the same ResourceHandleResult
 * interface as other handles.
 *
 * Create via SceneElement.bundledSprite() so the loader is wired automatically.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _icon = this.bundledSprite('icon.png');
 *
 *   protected override onDestroy() { this._icon.destroy(); super.onDestroy(); }
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

    constructor(
        private readonly _filename: string,
        private readonly _loader: (filename: string) => Promise<string>
    ) {}

    /**
     * Returns `{ resource, status }` ready to pass to `VisualMedia.setResource()`.
     * Triggers the bundled asset load on the first call; safe to call every frame.
     */
    get(): ResourceHandleResult {
        if (!this._url && !this._loading) {
            this._loading = true;
            this._loader(this._filename)
                .then((url) => {
                    this._url = url;
                    this._loading = false;
                })
                .catch(() => {
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
    build(
        x: number,
        y: number,
        width: number,
        height: number,
        options?: {
            fitMode?: 'contain' | 'cover' | 'fill' | 'none';
            preserveAspectRatio?: boolean;
            includeInLayoutBounds?: boolean;
            originX?: number;
            originY?: number;
        }
    ): VisualMedia {
        const { resource, status } = this.get();
        const vm = new VisualMedia(x, y, width, height, options);
        vm.setResource(resource, status);
        return vm;
    }

    /** Release the held reference. Call from onDestroy(). */
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
 * SparrowSourceDescriptor into a VisualResourceHandle. The optional
 * `_onBothLoaded` callback is called once both URLs are resolved — use it to
 * register the asset in the visual asset registry.
 *
 * Create via SceneElement.bundledSparrow() so the loader and registry
 * registration are wired automatically.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _sparrow = this.bundledSparrow('BOYFRIEND.png', 'BOYFRIEND.xml');
 *
 *   protected override onDestroy() { this._sparrow.destroy(); super.onDestroy(); }
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     const { resource, status } = this._sparrow.get();
 *     media.setResource(resource, status).setLocalTime(t);
 *   }
 * }
 */
export class BundledSparrowHandle {
    private readonly _handle = new VisualResourceHandle();
    private _pngUrl: string | null = null;
    private _xmlUrl: string | null = null;
    private _loading = false;

    constructor(
        private readonly _pngFilename: string,
        private readonly _xmlFilename: string,
        private readonly _loader: (filename: string) => Promise<string>,
        private readonly _onBothLoaded?: (pngUrl: string, xmlUrl: string) => void
    ) {}

    /**
     * Returns `{ resource, status }` ready to pass to `VisualMedia.setResource()`.
     * Triggers the bundled asset load on the first call; safe to call every frame.
     */
    get(): ResourceHandleResult {
        if (!this._pngUrl && !this._loading) {
            this._loading = true;
            Promise.all([this._loader(this._pngFilename), this._loader(this._xmlFilename)])
                .then(([pngUrl, xmlUrl]) => {
                    this._pngUrl = pngUrl;
                    this._xmlUrl = xmlUrl;
                    this._onBothLoaded?.(pngUrl, xmlUrl);
                    this._loading = false;
                })
                .catch(() => {
                    this._loading = false;
                });
        }
        const descriptor: VisualSourceDescriptor | null =
            this._pngUrl && this._xmlUrl
                ? { kind: 'sparrow', imageSrc: this._pngUrl, xmlSrc: this._xmlUrl }
                : null;
        return this._handle.update(descriptor);
    }

    /** Release the held reference. Call from onDestroy(). */
    destroy(): void {
        this._handle.destroy();
    }
}
