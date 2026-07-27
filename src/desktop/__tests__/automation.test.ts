import { describe, expect, it } from 'vitest';
import { parseDeepLink, parseRenderCommand } from '../../../electron/shared/automation';

describe('desktop automation schema', () => {
    it('parses a render command with preset, range, overrides, and JSON progress', () => {
        expect(
            parseRenderCommand([
                'electron',
                '.',
                '--render',
                'demo.mvt',
                '--output',
                'demo.mp4',
                '--preset',
                'hd-landscape',
                '--range',
                '2.5:9',
                '--fps',
                '30',
                '--json',
            ])
        ).toEqual({
            inputPath: 'demo.mvt',
            outputPath: 'demo.mp4',
            kind: 'video',
            preset: 'hd-landscape',
            range: { start: 2.5, end: 9 },
            width: undefined,
            height: undefined,
            fps: 30,
            json: true,
        });
    });

    it('rejects missing output and invalid ranges', () => {
        expect(() => parseRenderCommand(['--render', 'demo.mvt'])).toThrow('--output is required');
        expect(() => parseRenderCommand(['--render', 'demo.mvt', '--output', 'out.mp4', '--range', '9:2'])).toThrow(
            '--range'
        );
    });

    it('accepts only explicitly allowlisted deep links without paths or script payloads', () => {
        expect(parseDeepLink('mvmnt://automation/show-recovery')).toEqual({ command: 'show-recovery' });
        expect(parseDeepLink('mvmnt://automation/open-community?id=scene_42')).toEqual({
            command: 'open-community',
            id: 'scene_42',
        });
        expect(parseDeepLink('mvmnt://automation/run-script?path=/tmp/x')).toBeNull();
        expect(parseDeepLink('mvmnt://automation/open-community?id=../../etc/passwd')).toEqual({
            command: 'open-community',
        });
        expect(parseDeepLink('https://example.com/automation/show-storage')).toBeNull();
    });
});
