import audioIcon from './audio.svg';
import midiIcon from './midi.svg';
import miscIcon from './misc.svg';
import pluginIcon from './plugin.svg';

export type SceneElementIcon = 'audio' | 'midi' | 'misc' | 'plugin';

const iconSources: Record<SceneElementIcon, string> = {
    audio: audioIcon,
    midi: midiIcon,
    misc: miscIcon,
    plugin: pluginIcon,
};

// Add individual element types here when they receive their own icon assets.
const elementTypeIcons: Partial<Record<string, SceneElementIcon>> = {};

export function getSceneElementIcon(type: string, category: string | undefined, isPlugin: boolean): string {
    const typeIcon = elementTypeIcons[type];
    if (typeIcon) return iconSources[typeIcon];
    if (isPlugin) return iconSources.plugin;

    switch (category?.trim().toLowerCase()) {
        case 'audio displays':
            return iconSources.audio;
        case 'midi displays':
            return iconSources.midi;
        default:
            return iconSources.misc;
    }
}
