import type { SceneElementInstance, SceneElementRegistration, SceneElementTypeInfo } from '@core/scene/runtime/types';

/** Stores normalized scene element registrations without knowing how definitions are hosted. */
export class SceneElementRegistry {
    private readonly registrations = new Map<string, SceneElementRegistration>();

    constructor(registrations: readonly SceneElementRegistration[] = []) {
        for (const registration of registrations) this.register(registration);
    }

    register(registration: SceneElementRegistration): string {
        const type = registration?.type;
        if (!type || typeof type !== 'string') throw new Error(`Invalid element type: ${type}`);
        if (registration.origin.kind === 'plugin') {
            const prefix = `${registration.origin.pluginId}:`;
            if (!registration.origin.pluginId || !type.startsWith(prefix) || type.length === prefix.length) {
                throw new Error(`Plugin element type '${type}' must be qualified as '${prefix}<type>'`);
            }
        }
        if (this.registrations.has(type)) throw new Error(`Element type '${type}' is already registered`);
        this.registrations.set(type, registration);
        return type;
    }

    unregisterElement(type: string): boolean {
        const registration = this.registrations.get(type);
        if (registration?.origin.kind === 'built-in') {
            throw new Error(`Cannot unregister built-in element '${type}'`);
        }
        return this.registrations.delete(type);
    }

    unregisterPlugin(pluginId: string): string[] {
        const unregistered: string[] = [];
        for (const [type, registration] of this.registrations) {
            if (registration.origin.kind === 'plugin' && registration.origin.pluginId === pluginId) {
                this.registrations.delete(type);
                unregistered.push(type);
            }
        }
        return unregistered;
    }

    hasElement(type: string): boolean {
        return this.registrations.has(type);
    }

    isBuiltIn(type: string): boolean {
        return this.registrations.get(type)?.origin.kind === 'built-in';
    }

    getPluginId(type: string): string | undefined {
        const origin = this.registrations.get(type)?.origin;
        return origin?.kind === 'plugin' ? origin.pluginId : undefined;
    }

    getBuiltInTypes(): readonly string[] {
        return [...this.registrations.values()]
            .filter((registration) => registration.origin.kind === 'built-in')
            .map((registration) => registration.type);
    }

    createElement(type: string, config: Record<string, unknown> = {}): SceneElementInstance | null {
        const registration = this.registrations.get(type);
        if (!registration) {
            console.warn(`Unknown scene element type: ${type}`);
            return null;
        }
        return registration.create(config);
    }

    getSchema(type: string) {
        return this.registrations.get(type)?.schema ?? null;
    }

    getAvailableTypes(): string[] {
        return [...this.registrations.keys()];
    }

    getElementTypeInfo(): SceneElementTypeInfo[] {
        return [...this.registrations.values()].map((registration) => ({
            type: registration.type,
            name: registration.schema.name || registration.type,
            description: registration.schema.description || `${registration.type} element`,
            category: registration.schema.category || 'general',
            pluginId: registration.origin.kind === 'plugin' ? registration.origin.pluginId : null,
        }));
    }
}
