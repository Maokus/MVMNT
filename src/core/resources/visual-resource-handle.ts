/**
 * VisualResourceHandle — managed lifecycle wrapper for visual resources.
 *
 * A single handle owns one resource reference (load + retain on descriptor change,
 * release on change or destroy). Accepts any VisualSourceDescriptor — image, atlas,
 * or Sparrow — through the same API.
 *
 * Registry ID resolution (UUID → File) and bundled URL resolution happen before the
 * descriptor is created. The handle operates on fully-resolved descriptors only.
 *
 * @example
 * class MyElement extends SceneElement {
 *   private readonly _handle = new VisualResourceHandle();
 *
 *   protected override onDestroy() { this._handle.destroy(); super.onDestroy(); }
 *
 *   protected override _buildRenderObjects(_cfg: unknown, t: number) {
 *     const descriptor = resolveProjectAssetDescriptor(props.imageSource as string | null);
 *     const { resource, status } = this._handle.update(descriptor);
 *     media.setResource(resource, status);
 *   }
 * }
 */

import { visualResourceCache } from './visual-resource-cache';
import { type VisualSourceDescriptor, makeDescriptorKey } from './visual-source-descriptor';
import type { VisualResource, ResourceStatus } from './visual-resource';

export interface ResourceHandleResult {
    resource: VisualResource | null;
    /** Derived status: 'idle' when no descriptor, otherwise the resource's own status. */
    status: ResourceStatus;
    /** Present when status === 'error'; contains the decode error message. */
    errorMessage?: string;
}

export class VisualResourceHandle {
    private _key: string | null = null;

    /**
     * Set the active descriptor. Returns `{ resource, status }` ready to pass
     * to `VisualMedia.setResource()`. Safe to call every frame — the cache is
     * only updated when the descriptor key changes.
     */
    update(descriptor: VisualSourceDescriptor | null): ResourceHandleResult {
        const key = descriptor ? makeDescriptorKey(descriptor) : null;
        if (key !== this._key) {
            if (this._key) visualResourceCache.release(this._key);
            this._key = key;
            if (descriptor && key) {
                visualResourceCache.load(descriptor);
                visualResourceCache.retain(key);
            }
        }
        if (!key) return { resource: null, status: 'idle' };
        const resource = visualResourceCache.get(key) ?? null;
        return {
            resource,
            status: resource?.status ?? 'loading',
            errorMessage: resource?.errorMessage,
        };
    }

    /** Release the held reference. Call from the element's onDestroy(). */
    destroy(): void {
        if (this._key) {
            visualResourceCache.release(this._key);
            this._key = null;
        }
    }
}
