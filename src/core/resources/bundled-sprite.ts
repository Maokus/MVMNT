/**
 * BundledSprite — convenience wrapper for a single bundled plugin image asset.
 *
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

import { BundledImageAssetSlot } from './visual-asset-slot';
import { VisualMedia } from '@core/render/render-objects/visual-media';
import type { AssetSlotResult } from './visual-asset-slot';

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
