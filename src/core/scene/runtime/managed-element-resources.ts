export interface ManagedElementResource {
    destroy(): void;
}

/** Owns resource handles created for one bound runtime instance. */
export class ManagedElementResources {
    private readonly handles = new Set<ManagedElementResource>();

    track<T extends ManagedElementResource>(handle: T): T {
        this.handles.add(handle);
        return handle;
    }

    dispose(): void {
        for (const handle of this.handles) handle.destroy();
        this.handles.clear();
    }
}
