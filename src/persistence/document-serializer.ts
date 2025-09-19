import type { DocumentStateV1 } from '../state/document/types';
import { serializeStable } from './stable-stringify';
import { useDocumentStore } from '../state/document/documentStore';

export const DOCUMENT_SCHEMA_VERSION = 1 as const;

type EnvelopeV1 = {
    version: number;
    doc: DocumentStateV1;
};

/** Clone only keys that exist in the template object; recursively enforces structure and drops unknowns. */
function cloneKnownKeys<S>(source: any, template: S): S {
    if (template === null || typeof template !== 'object') {
        // Primitive template -> try to use source if same type, else fallback to template
        if (typeof source === typeof template) return source as S;
        return template;
    }
    if (Array.isArray(template)) {
        if (Array.isArray(source)) {
            // For arrays, do a shallow clone; assume element structures are validated elsewhere
            return source.slice() as any;
        }
        return (template as any).slice();
    }
    const out: any = {};
    for (const k of Object.keys(template as any)) {
        const tVal: any = (template as any)[k];
        const sVal: any = source ? (source as any)[k] : undefined;
        out[k] = cloneKnownKeys(sVal, tVal);
    }
    return out as S;
}

function coerceToDocShape(input: any): DocumentStateV1 {
    // Use current store snapshot as the structural template (ensures defaults)
    const template = useDocumentStore.getState().getSnapshot();
    return cloneKnownKeys(input, template);
}

export function serializeDocument(doc: DocumentStateV1): string {
    const env: EnvelopeV1 = { version: DOCUMENT_SCHEMA_VERSION, doc };
    return serializeStable(env);
}

export function deserializeDocument(json: string): DocumentStateV1 {
    let parsed: any;
    try {
        parsed = JSON.parse(json);
    } catch (e: any) {
        // On parse failure, return a baseline document
        return useDocumentStore.getState().getSnapshot();
    }

    // Accept multiple shapes:
    // - Envelope: { version, doc }
    // - Legacy Phase 1 envelope: { schemaVersion, format: 'mvmnt.scene', timeline, scene }
    // - Raw document: { timeline, scene }
    let candidate: any = parsed;
    if (parsed && typeof parsed === 'object' && 'version' in parsed && 'doc' in parsed) {
        candidate = parsed.doc;
    } else if (
        parsed &&
        typeof parsed === 'object' &&
        'schemaVersion' in parsed &&
        parsed.format === 'mvmnt.scene' &&
        'timeline' in parsed &&
        'scene' in parsed
    ) {
        // Map legacy envelope into current document shape
        candidate = {
            timeline: parsed.timeline,
            scene: parsed.scene,
        };
    }

    // Defensive: if still not object, fall back
    if (!candidate || typeof candidate !== 'object') {
        return useDocumentStore.getState().getSnapshot();
    }

    // Sanitize by cloning only known keys from current template
    const doc = coerceToDocShape(candidate);
    // P1 migration: hydrate elementsById / elementOrder if missing or empty
    try {
        const scene: any = doc.scene;
        if (scene) {
            if (!scene.elementsById || typeof scene.elementsById !== 'object') scene.elementsById = {};
            if (!Array.isArray(scene.elementOrder)) scene.elementOrder = [];
            if (scene.elementOrder.length === 0 && Object.keys(scene.elementsById).length === 0) {
                if (Array.isArray(scene.elements)) {
                    for (const el of scene.elements) {
                        if (!el || !el.id) continue;
                        scene.elementsById[el.id] = el;
                        scene.elementOrder.push(el.id);
                    }
                }
            }
        }
    } catch {}
    return doc;
}
