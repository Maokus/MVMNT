import { describe, it, expect } from 'vitest';
import { buildExportFilename } from '@utils/filename';

describe('filename utilities', () => {
    it('sanitizes and ensures extension', () => {
        expect(buildExportFilename('My Cool Name', undefined, 'export', '.mp4')).toBe('My_Cool_Name.mp4');
        expect(buildExportFilename('already.mp4', undefined, 'export', '.mp4')).toBe('already.mp4');
        expect(buildExportFilename(undefined, 'Scene One', 'export', '.mp4')).toBe('Scene_One.mp4');
    });
});
