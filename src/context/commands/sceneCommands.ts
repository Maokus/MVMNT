import { defineCommand } from './commandRegistry';

export const SCENE_COMMANDS = {
    copy: 'scene.copy-selection',
    paste: 'scene.paste',
    pasteWithoutAutomation: 'scene.paste-without-automation',
    duplicateWithoutAutomation: 'scene.duplicate-without-automation',
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

defineCommand({ id: SCENE_COMMANDS.copy, title: 'Copy', category: 'Scene', defaultShortcut: 'Mod+C' });
defineCommand({ id: SCENE_COMMANDS.paste, title: 'Paste', category: 'Scene', defaultShortcut: 'Mod+V' });
defineCommand({
    id: SCENE_COMMANDS.pasteWithoutAutomation,
    title: 'Paste Without Automation',
    category: 'Scene',
    defaultShortcut: 'Mod+Shift+V',
});
defineCommand({
    id: SCENE_COMMANDS.duplicateWithoutAutomation,
    title: 'Duplicate Without Automation',
    category: 'Scene',
});
