import { defineCommand } from './commandRegistry';

export const SCENE_COMMANDS = {
    group: 'scene.group-selection',
    ungroup: 'scene.ungroup-selection',
    duplicate: 'scene.duplicate-selection',
    delete: 'scene.delete-selection',
    selectAll: 'scene.select-all',
} as const;

defineCommand({ id: SCENE_COMMANDS.group, title: 'Group Selection', category: 'Scene', defaultShortcut: 'Mod+G' });
defineCommand({
    id: SCENE_COMMANDS.ungroup,
    title: 'Ungroup Selection',
    category: 'Scene',
    defaultShortcut: 'Mod+Shift+G',
});
defineCommand({
    id: SCENE_COMMANDS.duplicate,
    title: 'Duplicate Selection',
    category: 'Scene',
    defaultShortcut: 'Mod+D',
});
defineCommand({ id: SCENE_COMMANDS.delete, title: 'Delete', category: 'Scene', defaultShortcut: 'Delete' });
defineCommand({ id: SCENE_COMMANDS.selectAll, title: 'Select All', category: 'Scene', defaultShortcut: 'Mod+A' });
