import { describe, expect, it } from 'vitest';
import { createFlatSceneGraph, groupSceneNodes } from '@state/scene-graph';
import { resolveTreeDropTarget, resolveTreeRowTarget } from '../SceneNodeTree';

describe('scene hierarchy drop targets', () => {
    it('converts frontmost-first before/after rows to canonical indexes', () => {
        const graph = createFlatSceneGraph(['back', 'middle', 'front']);
        const root = graph.nodesById[graph.rootId];
        if (root.kind !== 'root') throw new Error('invalid fixture');
        const middle = graph.nodesById['element:middle'];
        expect(resolveTreeDropTarget(middle, root.children, 'before')).toEqual({
            parentId: graph.rootId,
            targetIndex: 2,
        });
        expect(resolveTreeDropTarget(middle, root.children, 'after')).toEqual({
            parentId: graph.rootId,
            targetIndex: 1,
        });
    });

    it('targets the canonical front of a nested group for inside drops', () => {
        const graph = groupSceneNodes(createFlatSceneGraph(['a', 'b']), ['element:a'], 'group:nested');
        const group = graph.nodesById['group:nested'];
        expect(resolveTreeDropTarget(group, (graph.nodesById[graph.rootId] as any).children, 'inside')).toEqual({
            parentId: 'group:nested',
            targetIndex: 1,
        });
    });
});

describe('scene hierarchy row navigation', () => {
    const visible = ['element:front', 'element:middle', 'element:back'];

    it('steps one row up or down from the active row', () => {
        expect(resolveTreeRowTarget(visible, 'element:front', 'ArrowDown')).toBe('element:middle');
        expect(resolveTreeRowTarget(visible, 'element:middle', 'ArrowUp')).toBe('element:front');
    });

    it('clamps at both ends without wrapping', () => {
        expect(resolveTreeRowTarget(visible, 'element:front', 'ArrowUp')).toBeUndefined();
        expect(resolveTreeRowTarget(visible, 'element:back', 'ArrowDown')).toBeUndefined();
    });

    it('selects the first or last row when nothing is active yet', () => {
        expect(resolveTreeRowTarget(visible, null, 'ArrowDown')).toBe('element:front');
        expect(resolveTreeRowTarget(visible, null, 'ArrowUp')).toBe('element:back');
        expect(resolveTreeRowTarget(visible, null, 'Home')).toBe('element:front');
        expect(resolveTreeRowTarget(visible, null, 'End')).toBe('element:back');
    });

    it('ignores keys that are not row navigation', () => {
        expect(resolveTreeRowTarget(visible, 'element:front', ' ')).toBeUndefined();
        expect(resolveTreeRowTarget(visible, 'element:front', 'F2')).toBeUndefined();
    });
});
