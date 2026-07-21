import { describe, expect, it } from 'vitest';
import {
    ensureProjectExtension,
    isSupportedOpenPath,
    resolveRendererPath,
    sanitizeSuggestedName,
} from '../../../electron/shared/path-security';

describe('Electron path security helpers', () => {
    it('normalizes project filenames and preserves an existing extension', () => {
        expect(ensureProjectExtension('Demo')).toBe('Demo.mvt');
        expect(ensureProjectExtension('Demo.MVT')).toBe('Demo.MVT');
        expect(sanitizeSuggestedName('../bad:name')).toBe('.._bad_name.mvt');
        expect(sanitizeSuggestedName('')).toBe('Untitled.mvt');
    });

    it('recognizes only project and plugin files', () => {
        expect(isSupportedOpenPath('/tmp/demo.mvt')).toBe(true);
        expect(isSupportedOpenPath('/tmp/demo.MVMNT-PLUGIN')).toBe(true);
        expect(isSupportedOpenPath('/tmp/demo.mid')).toBe(false);
    });

    it('serves assets and SPA routes without permitting traversal', () => {
        const root = '/app/build';
        expect(resolveRendererPath(root, '/assets/index.js')).toBe('/app/build/assets/index.js');
        expect(resolveRendererPath(root, '/workspace')).toBe('/app/build/index.html');
        expect(resolveRendererPath(root, '/../secret.txt')).toBeNull();
        expect(resolveRendererPath(root, '/%2e%2e/secret.txt')).toBeNull();
        expect(resolveRendererPath(root, '/%E0%A4%A')).toBeNull();
    });
});
