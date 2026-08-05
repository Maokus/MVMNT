import { describe, expect, it } from 'vitest';
import { isTextEditingTarget } from './SceneSelectionContext';

describe('isTextEditingTarget', () => {
    it('allows scene-tree keyboard shortcuts while still protecting text entry controls', () => {
        const tree = document.createElement('div');
        tree.setAttribute('role', 'tree');
        const row = document.createElement('div');
        tree.append(row);

        const input = document.createElement('input');

        expect(isTextEditingTarget(row)).toBe(false);
        expect(isTextEditingTarget(input)).toBe(true);
    });
});
