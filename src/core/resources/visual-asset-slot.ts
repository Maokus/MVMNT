/**
 * ImageAssetSlot / AtlasAssetSlot / BundledImageAssetSlot — managed lifecycle wrappers for visual assets.
 *
 * Each slot owns a single asset reference (load + retain on change, release on
 * change or destroy). Plugin authors create one slot per image they want to
 * display, call update()/get() each frame, and call destroy() in onDestroy().
 *
 * Before slots:
 *   const key = src ? makeImageKey(src) : null;
 *   if (key !== this._currentKey) {
 *     if (this._currentKey) visualAssetStore.release(this._currentKey);
 *     this._currentKey = key;
 *     if (src && key) { visualAssetStore.load(src); visualAssetStore.retain(key); }
 *   }
 *   const asset = key ? visualAssetStore.get(key) : undefined;
 *
 * After slots:
 *   const { asset, status } = this._image.update(src);
 */

import { visualAssetStore, makeImageKey, makeAtlasKey, type ImageSource } from './visual-asset-store';
import type { VisualAsset, VisualAssetStatus, AtlasLayout } from './visual-asset';
import { VisualMedia } from '@core/render/render-objects/visual-media';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';

/** Returned by {@link ImageAssetSlot.update}, {@link AtlasAssetSlot.update}, and {@link BundledImageAssetSlot.get}. */
export interface AssetSlotResult {
    asset: VisualAsset | null;
    /** Derived status: 'idle' when no source, otherwise the asset's own status. */
    status: VisualAssetStatus;
}

/**
 * Manages a single image or GIF asset reference.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _image = new ImageAssetSlot();
 *
 *   protected override onDestroy() { this._image.destroy(); super.onDestroy(); }
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     const { asset, status } = this._image.update(this.getSchemaProps().imageSource as ImageSource);
 *     // media.setAsset(asset, status)
 *   }
 * }
 */
export class ImageAssetSlot {
    private _key: string | null = null;

    /**
     * Set the active source. Returns `{ asset, status }` ready to pass directly
     * to `VisualMedia.setAsset()`. Safe to call every frame — the store is only
     * updated when the source changes.
     */
    update(src: ImageSource | null): AssetSlotResult {
        const key = src ? makeImageKey(src) : null;
        if (key !== this._key) {
            if (this._key) visualAssetStore.release(this._key);
            this._key = key;
            if (src && key) {
                visualAssetStore.load(src);
                visualAssetStore.retain(key);
            }
        }
        if (!key) return { asset: null, status: 'idle' };
        const asset = visualAssetStore.get(key) ?? null;
        return { asset, status: asset?.status ?? 'loading' };
    }

    /** Release the held reference. Call from onDestroy(). */
    destroy(): void {
        if (this._key) {
            visualAssetStore.release(this._key);
            this._key = null;
        }
    }
}

/**
 * Manages a single sprite-atlas asset reference.
 *
 * The key encodes both the source and the layout — different grid configurations
 * of the same spritesheet are cached as separate assets.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _atlas = new AtlasAssetSlot();
 *
 *   protected override onDestroy() { this._atlas.destroy(); super.onDestroy(); }
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     const layout: AtlasLayout = { columns: 4, rows: 4, frameDurationMs: 83 };
 *     const { asset, status } = this._atlas.update(this.getSchemaProps().imageSource as ImageSource, layout);
 *     // media.setAsset(asset, status)
 *   }
 * }
 */
export class AtlasAssetSlot {
    private _key: string | null = null;

    /**
     * Set the active source and layout. Returns `{ asset, status }` ready to
     * pass directly to `VisualMedia.setAsset()`. Safe to call every frame.
     */
    update(src: ImageSource | null, layout: AtlasLayout): AssetSlotResult {
        const key = src ? makeAtlasKey(src, layout) : null;
        if (key !== this._key) {
            if (this._key) visualAssetStore.release(this._key);
            this._key = key;
            if (src && key) {
                visualAssetStore.loadAtlas(src, layout);
                visualAssetStore.retain(key);
            }
        }
        if (!key) return { asset: null, status: 'idle' };
        const asset = visualAssetStore.get(key) ?? null;
        return { asset, status: asset?.status ?? 'loading' };
    }

    /** Release the held reference. Call from onDestroy(). */
    destroy(): void {
        if (this._key) {
            visualAssetStore.release(this._key);
            this._key = null;
        }
    }
}

/**
 * Manages a single bundled plugin image asset — one that ships inside the
 * plugin's `assets/` directory and is loaded via `SceneElement.loadBundledAsset`.
 *
 * Hides the full chain: filename → URL resolution → store load/retain/release.
 * Create via `SceneElement.bundledImage(filename)` so the loader is wired
 * automatically.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _head = this.bundledImage('Head.png');
 *
 *   protected override onDestroy() { this._head.destroy(); super.onDestroy(); }
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     const { asset, status } = this._head.get();
 *     media.setAsset(asset, status);
 *   }
 * }
 */
export class BundledImageAssetSlot {
    private readonly _inner = new ImageAssetSlot();
    private _url: string | null = null;
    private _loading = false;

    constructor(
        private readonly _filename: string,
        private readonly _loader: (filename: string) => Promise<string>
    ) {}

    /**
     * Returns `{ asset, status }` ready to pass directly to `VisualMedia.setAsset()`.
     * Triggers the bundled asset load on the first call; safe to call every frame.
     */
    get(): AssetSlotResult {
        if (!this._url && !this._loading) {
            this._loading = true;
            this._loader(this._filename)
                .then(url => { this._url = url; this._loading = false; })
                .catch(() => { this._loading = false; });
        }
        return this._inner.update(this._url);
    }

    /** Release the held reference. Call from onDestroy(). */
    destroy(): void {
        this._inner.destroy();
    }
}

/**
 * Convenience wrapper for a single bundled plugin image.
 * Owns the asset lifecycle (load/retain/release) and produces a ready
 * `VisualMedia` render object on each call to `build()`.
 *
 * Create via `SceneElement.bundledSprite(filename)` so the loader is wired
 * automatically.
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
    private readonly _slot: BundledImageAssetSlot;

    constructor(filename: string, loader: (filename: string) => Promise<string>) {
        this._slot = new BundledImageAssetSlot(filename, loader);
    }

    /**
     * Returns `{ asset, status }` for use in manual `VisualMedia.setAsset()` calls.
     * Use this when you need to mix bundled and user-supplied assets.
     * Safe to call every frame.
     */
    get(): AssetSlotResult {
        return this._slot.get();
    }

    /**
     * Returns a new `VisualMedia` with the bundled asset already set.
     * Deterministic — derives entirely from current slot state + arguments.
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
            /** Instance draw origin X (fraction of drawn width). Default 0. */
            originX?: number;
            /** Instance draw origin Y (fraction of drawn height). Default 0. */
            originY?: number;
        }
    ): VisualMedia {
        const { asset, status } = this._slot.get();
        const vm = new VisualMedia(x, y, width, height, options);
        vm.setAsset(asset, status);
        return vm;
    }

    /** Release the held reference. Call from onDestroy(). */
    destroy(): void {
        this._slot.destroy();
    }
}

/**
 * Resolves a visual asset registry ID to a File and delegates to {@link ImageAssetSlot}.
 *
 * Use this with `prop.imageAsset()` properties. The property value is a stable
 * asset ID string (from the visual asset registry), not a raw File or data URL.
 *
 * Also accepts File objects directly for backward compatibility with projects
 * loaded before the asset registry was introduced.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _image = new AssetRefSlot();
 *
 *   protected override onDestroy() { this._image.destroy(); super.onDestroy(); }
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     const { asset, status } = this._image.update(this.getSchemaProps().imageSource as string | File | null);
 *     media.setAsset(asset, status);
 *   }
 * }
 */
export class AssetRefSlot {
    private readonly _inner = new ImageAssetSlot();

    /**
     * Resolve an asset registry ID (or legacy File/URL) to a loaded asset.
     * Safe to call every frame.
     */
    update(assetIdOrSource: string | File | null): AssetSlotResult {
        if (assetIdOrSource instanceof File || assetIdOrSource === null) {
            return this._inner.update(assetIdOrSource);
        }
        const entry = useVisualAssetRegistryStore.getState().assets[assetIdOrSource] ?? null;
        return this._inner.update(entry?.file ?? null);
    }

    /** Release the held reference. Call from onDestroy(). */
    destroy(): void {
        this._inner.destroy();
    }
}
