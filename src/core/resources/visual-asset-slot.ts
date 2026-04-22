/**
 * ImageAssetSlot / AtlasAssetSlot — managed lifecycle wrappers for visual assets.
 *
 * Each slot owns a single asset reference (load + retain on change, release on
 * change or destroy). Plugin authors create one slot per image they want to
 * display, call update() each frame, and call destroy() in onDestroy().
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

/** Returned by {@link ImageAssetSlot.update} and {@link AtlasAssetSlot.update}. */
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
