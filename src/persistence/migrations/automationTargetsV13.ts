import { migrateLegacyAutomationState } from '@automation/types';

export const AUTOMATION_TARGETS_SCHEMA_VERSION = 13;

/** Replace ownership-encoded automation IDs with opaque IDs and structured targets. */
export function migrateAutomationTargetsV13<T extends Record<string, any>>(envelope: T): T {
    const version = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0;
    if (version >= AUTOMATION_TARGETS_SCHEMA_VERSION) return envelope;

    const scene = envelope.scene && typeof envelope.scene === 'object' ? envelope.scene : {};
    const { state: automation, channelIdMap } = migrateLegacyAutomationState(scene.automation);
    const rewriteBindings = (bindings: Record<string, any> | undefined) => {
        if (!bindings || typeof bindings !== 'object') return bindings;
        return Object.fromEntries(
            Object.entries(bindings).map(([path, binding]) => [
                path,
                binding?.type === 'keyframes' && channelIdMap[binding.channelId]
                    ? { ...binding, channelId: channelIdMap[binding.channelId] }
                    : binding,
            ])
        );
    };
    const elements =
        scene.elements && typeof scene.elements === 'object'
            ? Object.fromEntries(
                  Object.entries(scene.elements).map(([id, element]: [string, any]) => [
                      id,
                      { ...element, properties: rewriteBindings(element?.properties) },
                  ])
              )
            : scene.elements;
    const nodeBindings = scene.nodeBindings
        ? Object.fromEntries(
              Object.entries(scene.nodeBindings).map(([id, bindings]: [string, any]) => [id, rewriteBindings(bindings)])
          )
        : undefined;

    return {
        ...envelope,
        schemaVersion: AUTOMATION_TARGETS_SCHEMA_VERSION,
        scene: {
            ...scene,
            elements,
            ...(Object.keys(automation.channels).length ? { automation } : { automation: undefined }),
            ...(nodeBindings ? { nodeBindings } : {}),
        },
    } as T;
}
