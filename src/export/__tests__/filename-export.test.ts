import { describe, it, expect, vi, beforeEach, afterEach, type SpyInstance } from 'vitest';
import { buildExportFilename } from '@utils/filename';
import { VideoExporter } from '@export/video-exporter';

// Provide OffscreenCanvas mock for mediabunny in jsdom
// @ts-ignore
if (typeof (globalThis as any).OffscreenCanvas === 'undefined') {
    (globalThis as any).OffscreenCanvas = class OffscreenCanvas {
        width: number;
        height: number;
        private canvas: HTMLCanvasElement;
        constructor(w: number, h: number) {
            this.width = w;
            this.height = h;
            this.canvas = document.createElement('canvas');
            this.canvas.width = w;
            this.canvas.height = h;
        }
        getContext(type: string) {
            return this.canvas.getContext(type as any);
        }
        transferToImageBitmap() {
            return {};
        }
    } as any;
}

// Mock mediabunny heavy parts so we don't rely on real encoding in test environment.
vi.mock('mediabunny', async () => {
    return {
        BufferTarget: class {
            buffer: Uint8Array = new Uint8Array([1, 2, 3]);
        },
        Mp4OutputFormat: class {},
        Output: class {
            private target: any;
            constructor({ target }: any) {
                this.target = target;
            }
            addVideoTrack() {}
            async start() {}
            async finalize() {}
        },
        CanvasSource: class {
            constructor() {}
            async add() {}
            close() {}
        },
        canEncodeVideo: async () => true,
        getEncodableVideoCodecs: async () => ['avc'],
    };
});

// Minimal mock visualizer with required surface
class MockVisualizer {
    duration = 2; // seconds
    isPlaying = false;
    currentTime = 0;
    getCurrentDuration() {
        return this.duration;
    }
    renderAtTime() {
        /* noop */
    }
    getPlayRange() {
        return { startSec: 0, endSec: this.duration };
    }
    resize() {
        /* noop */
    }
}

describe('filename utilities', () => {
    it('sanitizes and ensures extension', () => {
        expect(buildExportFilename('My Cool Name', undefined, 'export', '.mp4')).toBe('My_Cool_Name.mp4');
        expect(buildExportFilename('already.mp4', undefined, 'export', '.mp4')).toBe('already.mp4');
        expect(buildExportFilename(undefined, 'Scene One', 'export', '.mp4')).toBe('Scene_One.mp4');
    });
});

describe('VideoExporter filename integration', () => {
    let canvas: HTMLCanvasElement;
    let exporter: VideoExporter;
    let anchor: HTMLAnchorElement | null;
    let anchorClickSpy: SpyInstance | null;

    beforeEach(() => {
        canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        exporter = new VideoExporter(canvas, new MockVisualizer());
        anchor = null;
        anchorClickSpy = vi
            .spyOn(HTMLAnchorElement.prototype, 'click')
            .mockImplementation(function (this: HTMLAnchorElement) {
                // jsdom triggers navigation for anchor clicks; keep it as a no-op to avoid errors.
                const event = new Event('click', { bubbles: true, cancelable: true });
                this.dispatchEvent(event);
            });
        // Spy on document.createElement to capture anchor used for download
        const realCreate = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation(((tag: string, options?: any) => {
            const el = realCreate(tag, options);
            if (tag.toLowerCase() === 'a') anchor = el as HTMLAnchorElement;
            return el as any;
        }) as any);
        // Mock URL.createObjectURL
        if (!(URL as any).__mocked) {
            const realURL = URL.createObjectURL;
            (URL as any).__real = realURL;
            URL.createObjectURL = ((blob: any) => 'blob:mock-' + (blob?.size || 0)) as any;
            (URL as any).__mocked = true;
        }
    });

    afterEach(() => {
        anchorClickSpy?.mockRestore();
        anchorClickSpy = null;
    });

    it('uses provided filename when downloading', async () => {
        await exporter.exportVideo({
            fps: 1,
            width: 10,
            height: 10,
            filename: 'Custom Name',
            sceneName: 'Ignored Scene',
        });
        expect(anchor).not.toBeNull();
        expect(anchor!.download).toBe('Custom_Name.mp4');
    });

    it('falls back to scene name when no filename provided', async () => {
        await exporter.exportVideo({ fps: 1, width: 10, height: 10, sceneName: 'Scene Title' });
        expect(anchor).not.toBeNull();
        expect(anchor!.download).toBe('Scene_Title.mp4');
    });
});
