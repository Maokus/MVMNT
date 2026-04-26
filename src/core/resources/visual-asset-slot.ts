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
 * @deprecated For user-facing image properties backed by the visual asset registry,
 * use {@link AssetRefSlot} with `prop.imageAsset()` instead. `ImageAssetSlot` is
 * retained for internal use inside the slot wrappers and for loading raw URLs.
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
 * Resolves a visual asset registry ID to a File and delegates to {@link AtlasAssetSlot}.
 *
 * Use this with `prop.imageAsset()` properties on sprite-atlas elements. Works identically
 * to {@link AssetRefSlot} but feeds into atlas loading rather than plain image loading.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _atlas = new AssetRefAtlasSlot();
 *
 *   protected override onDestroy() { this._atlas.destroy(); super.onDestroy(); }
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     const layout: AtlasLayout = { columns: 4, rows: 4, frameDurationMs: 83 };
 *     const { asset, status } = this._atlas.update(this.getSchemaProps().imageSource as string | File | null, layout);
 *     media.setAsset(asset, status);
 *   }
 * }
 */
export class AssetRefAtlasSlot {
    private readonly _inner = new AtlasAssetSlot();

    /**
     * Resolve an asset registry ID (or legacy File/URL) to a loaded atlas asset.
     * Safe to call every frame.
     */
    update(assetIdOrSource: string | File | null, layout: AtlasLayout): AssetSlotResult {
        if (assetIdOrSource instanceof File || assetIdOrSource === null) {
            return this._inner.update(assetIdOrSource, layout);
        }
        const entry = useVisualAssetRegistryStore.getState().assets[assetIdOrSource] ?? null;
        return this._inner.update(entry?.file ?? null, layout);
    }

    /** Release the held reference. Call from onDestroy(). */
    destroy(): void {
        this._inner.destroy();
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
