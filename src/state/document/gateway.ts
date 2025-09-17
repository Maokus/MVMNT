import { applyPatches, type Patch } from 'immer';
import { useDocumentStore } from './documentStore';
import type { DocumentStateGateway, DocumentStateV1, PatchMeta } from './types';
import { serializeDocument, deserializeDocument } from '../../persistence/document-serializer';

/**
 * Phase 3: Unified Document State Gateway
 * Provides a single API surface to interact with the private document in the store
 * and (de)serialize it for persistence.
 */
export function createDocumentGateway(): DocumentStateGateway<DocumentStateV1> {
    return {
        get(): DocumentStateV1 {
            return useDocumentStore.getState().getSnapshot();
        },

        replace(next: DocumentStateV1, meta?: PatchMeta): void {
            useDocumentStore.getState().replace(next, meta);
        },

        apply(patches: Patch[], meta?: PatchMeta): void {
            const curr = useDocumentStore.getState().getSnapshot();
            const next = applyPatches(curr, patches as any);
            useDocumentStore.getState().replace(next, meta);
        },

        snapshot(): DocumentStateV1 {
            return useDocumentStore.getState().getSnapshot();
        },

        serialize(doc?: DocumentStateV1): string {
            return serializeDocument(doc ?? useDocumentStore.getState().getSnapshot());
        },

        deserialize(json: string): DocumentStateV1 {
            return deserializeDocument(json);
        },
    };
}

export type { DocumentStateGateway };
