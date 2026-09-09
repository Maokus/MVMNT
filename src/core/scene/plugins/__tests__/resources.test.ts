import { describe, expect, it, vi } from 'vitest';
import {
    definePluginElement,
    group,
    prop,
    tab,
    type ResourceContext,
} from '../../../../../packages/plugin-sdk/src/scene';
import { createPluginDefinitionScope } from '@core/scene/runtime/definition-runtime';
import { Rectangle } from '@core/render/render-objects';
import sdkManifest from '../../../../../packages/plugin-sdk/sdk-manifest.json';

const options = () => ({
    pluginId: 'test',
    services: null,
    synchronousInitialization: true,
    loadAsset: async () => 'blob:test',
    report: vi.fn(),
});

describe('instance resources', () => {
    it('produces equivalent frames with fresh, reused, and evicted resources in arbitrary time order', async () => {
        const caches: Map<string, number>[] = [];
        const definition = definePluginElement({
            type: 'cached-shape',
            metadata: { name: 'Cached shape' },
            schema: { tabs: [tab.properties([group('shape', 'Shape', [prop.number('speed', 'Speed', 2)])])] },
            createResources() {
                const cache = new Map<string, number>();
                caches.push(cache);
                return { cache, rectangle: new Rectangle(0, 0, 10, 10) };
            },
            render(input) {
                expect(Object.keys(input).sort()).toEqual([...sdkManifest.elementContract.renderInputFields].sort());
                const { props, time, resources } = input;
                const key = `${props.speed}:${time.seconds}`;
                if (!resources.cache.has(key)) resources.cache.set(key, props.speed * time.seconds);
                resources.rectangle.x = resources.cache.get(key)!;
                resources.rectangle.opacity = time.seconds < 2 ? 0.5 : 1;
                return [resources.rectangle];
            },
        });
        const scope = createPluginDefinitionScope(definition, options());
        const registration = scope.createRegistration({ kind: 'built-in' });
        const reused = registration.create();
        const frame = (instance: typeof reused, time: number) => {
            const [container] = instance.buildRenderObjects({}, time);
            const rectangle = container.children[0] as Rectangle;
            // Copy immediately: the next callback may reuse and modify this object.
            return { x: rectangle.x, width: rectangle.width, opacity: rectangle.opacity };
        };
        for (const speed of [2, 4, 2]) {
            reused.updateConfig({ speed });
            for (const time of [0, 1, 2, 5, 1, 1, 0, 3]) {
                const fresh = registration.create({ speed });
                expect(frame(reused, time)).toEqual(frame(fresh, time));
                caches[0].clear();
                expect(frame(reused, time)).toEqual(frame(fresh, time));
                fresh.dispose();
            }
        }
        await scope.dispose();
    });

    it('restricts setup reads and attempts all cleanup once, even when disposal throws', async () => {
        const cleaned = vi.fn();
        const late = vi.fn();
        const dispose = vi.fn(() => {
            throw new Error('dispose failed');
        });
        let setup!: ResourceContext;
        const opts = options();
        const scope = createPluginDefinitionScope(
            definePluginElement({
                type: 'cleanup',
                metadata: { name: 'Cleanup' },
                schema: { tabs: [] },
                createResources(context) {
                    setup = context;
                    context.onCleanup(() => {
                        throw new Error('cleanup failed');
                    });
                    context.onCleanup(cleaned);
                    return {};
                },
                render() {
                    return [];
                },
                disposeResources: dispose,
            }),
            opts
        );
        const instance = scope.createRegistration({ kind: 'built-in' }).create();
        expect(Object.keys(setup).sort()).toEqual([...sdkManifest.elementContract.resourceContextFields].sort());
        instance.dispose();
        instance.dispose();
        await scope.dispose();
        await scope.dispose();
        expect(setup.signal.aborted).toBe(true);
        setup.onCleanup(late);
        expect(late).toHaveBeenCalledOnce();
        expect(dispose).toHaveBeenCalledOnce();
        expect(cleaned).toHaveBeenCalledOnce();
        expect(opts.report).toHaveBeenCalledTimes(2);
        expect(() => setup.assets.project()).toThrow('aborted');
        expect(() => setup.assets.bundledImage('image.png')).toThrow('aborted');
    });

    it.each([false, true])('cleans partial initialization after failure (async=%s)', async (asynchronous) => {
        const cleaned = vi.fn();
        const disposed = vi.fn();
        const render = vi.fn(() => []);
        const opts = { ...options(), synchronousInitialization: !asynchronous };
        const scope = createPluginDefinitionScope(
            definePluginElement({
                type: 'failed-setup',
                metadata: { name: 'Failed setup' },
                schema: { tabs: [] },
                createResources(context): {} | Promise<{}> {
                    context.onCleanup(cleaned);
                    if (asynchronous) return Promise.reject(new Error('failed'));
                    throw new Error('failed');
                },
                disposeResources: disposed,
                render,
            }),
            opts
        );
        const instance = scope.createRegistration({ kind: 'built-in' }).create();
        await vi.waitFor(() => expect(cleaned).toHaveBeenCalledOnce());
        instance.buildRenderObjects({}, 0);
        expect(render).not.toHaveBeenCalled();
        instance.dispose();
        await scope.dispose();
        expect(cleaned).toHaveBeenCalledOnce();
        expect(disposed).not.toHaveBeenCalled();
        expect(opts.report).toHaveBeenCalledWith(expect.objectContaining({ code: 'INITIALIZATION_FAILED' }));
    });

    it('revokes an asset URL that resolves after its instance has been removed', async () => {
        let resolve!: (url: string) => void;
        let pending!: ReturnType<ResourceContext['assets']['load']>;
        const revoke = vi.spyOn(URL, 'revokeObjectURL');
        const scope = createPluginDefinitionScope(
            definePluginElement({
                type: 'late-asset',
                metadata: { name: 'Late asset' },
                schema: { tabs: [] },
                createResources(context) {
                    pending = context.assets.load('image.png');
                    return {};
                },
                render() {
                    return [];
                },
            }),
            {
                ...options(),
                loadAsset: () =>
                    new Promise<string>((finish) => {
                        resolve = finish;
                    }),
            }
        );
        const instance = scope.createRegistration({ kind: 'built-in' }).create();
        instance.dispose();
        resolve('blob:late');
        expect(await pending).toMatchObject({ ok: false, error: { code: 'ABORTED' } });
        expect(revoke).toHaveBeenCalledWith('blob:late');
        await scope.dispose();
        revoke.mockRestore();
    });

    it('disposes live instances before unloading the definition and isolates replacement resources', async () => {
        const events: string[] = [];
        const resources: object[] = [];
        const definition = definePluginElement({
            type: 'reload',
            metadata: { name: 'Reload' },
            schema: { tabs: [] },
            createResources(context) {
                context.onCleanup(() => {
                    events.push('cleanup');
                });
                const resource = {};
                resources.push(resource);
                return resource;
            },
            disposeResources(_resources, context) {
                expect(context.signal.aborted).toBe(true);
                events.push('dispose');
            },
            unload() {
                events.push('unload');
            },
            render() {
                return [];
            },
        });
        const first = createPluginDefinitionScope(definition, options());
        const instance = first.createRegistration({ kind: 'built-in' }).create();
        await first.dispose();
        instance.dispose();
        expect(events).toEqual(['dispose', 'cleanup', 'unload']);
        const replacement = createPluginDefinitionScope(definition, options());
        replacement.createRegistration({ kind: 'built-in' }).create();
        expect(resources[0]).not.toBe(resources[1]);
        await replacement.dispose();
    });
});
