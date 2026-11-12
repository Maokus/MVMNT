import { useState } from 'react';
import { FaEllipsisV } from 'react-icons/fa';
import { SCENE_COMMANDS } from '@context/commands/sceneCommands';
import { useSceneViewPreferencesStore } from '@state/sceneViewPreferencesStore';
import { CommandContextMenu } from './CommandContextMenu';

export function SceneGroupViewMenu() {
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const collapsed = useSceneViewPreferencesStore((state) => state.openGroupsCollapsed);
    return (
        <>
            <button
                type="button"
                aria-label="Group view options"
                title="Group view options"
                aria-haspopup="menu"
                aria-expanded={Boolean(position)}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-white/10 hover:text-white"
                onClick={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    setPosition(position ? null : { x: rect.left, y: rect.bottom });
                }}
            >
                <FaEllipsisV />
            </button>
            {position && (
                <CommandContextMenu
                    position={position}
                    onClose={() => setPosition(null)}
                    ariaLabel="Group view options"
                    entries={[
                        { commandId: SCENE_COMMANDS.collapseAllGroups },
                        { commandId: SCENE_COMMANDS.expandAllGroups },
                        { separator: true },
                        {
                            label: 'Open projects with groups collapsed',
                            checked: collapsed,
                            onSelect: () => useSceneViewPreferencesStore.getState().setOpenGroupsCollapsed(!collapsed),
                        },
                    ]}
                />
            )}
        </>
    );
}
