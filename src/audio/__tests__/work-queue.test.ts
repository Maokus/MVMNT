import { describe, expect, it, vi } from 'vitest';
import { AudioWorkQueue } from '../work-queue';

describe('audio work queue', () => {
    it('coalesces source requests and prioritizes playback over queued preparation', async () => {
        const queue = new AudioWorkQueue();
        let release!: () => void;
        const active = queue.schedule(
            {},
            () =>
                new Promise<void>((resolve) => {
                    release = resolve;
                })
        );
        const order: string[] = [];
        const source = {};
        const background = queue.schedule(source, async () => {
            order.push('playback');
            return 42;
        });
        const other = queue.schedule({}, async () => {
            order.push('background');
        });
        const duplicate = vi.fn();
        expect(queue.schedule(source, duplicate, 1)).toBe(background);
        release();
        await Promise.all([active, background, other]);
        expect(order).toEqual(['playback', 'background']);
        expect(duplicate).not.toHaveBeenCalled();
    });

    it('continues after a failed decode', async () => {
        const queue = new AudioWorkQueue();
        await expect(
            queue.schedule({}, async () => {
                throw new Error('bad audio');
            })
        ).rejects.toThrow('bad audio');
        await expect(queue.schedule({}, async () => 'ready')).resolves.toBe('ready');
    });
});
