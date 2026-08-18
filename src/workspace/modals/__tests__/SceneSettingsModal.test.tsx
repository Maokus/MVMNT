import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@context/VisualizerContext', () => ({
    useVisualizer: () => ({
        exportSettings: { width: 1920, height: 1080, fps: 60 },
        setExportSettings: vi.fn(),
        debugSettings: {},
        setDebugSettings: vi.fn(),
    }),
}));

vi.mock('@state/timelineStore', () => ({
    useTimelineStore: (selector: (state: any) => unknown) =>
        selector({
            timelineView: { startTick: 0, endTick: 0 },
            playbackRange: undefined,
            timeline: { beatsPerBar: 4 },
            setPlaybackRangeExplicitTicks: vi.fn(),
        }),
}));

vi.mock('@state/sceneMetadataStore', () => ({
    useSceneMetadataStore: (selector: (state: any) => unknown) =>
        selector({
            metadata: { name: 'Untitled', id: 'untitled', description: '', author: '', createdAt: '', modifiedAt: '' },
            setId: vi.fn(),
            setDescription: vi.fn(),
            setAuthor: vi.fn(),
        }),
}));

vi.mock('@context/SceneContext', () => ({ useScene: () => ({ renameScene: vi.fn().mockResolvedValue(true) }) }));
vi.mock('@state/sceneStore', () => ({ useSceneStore: { getState: vi.fn() } }));
vi.mock('@state/scene', () => ({ dispatchSceneCommand: vi.fn() }));
vi.mock('../../scene-settings/SceneFontManager', () => ({ default: () => <div /> }));
vi.mock('../../scene-settings/SceneAnalysisCachesTab', () => ({ default: () => <div /> }));
vi.mock('../../scene-settings/ScenePluginsTab', () => ({ default: () => <div /> }));
vi.mock('@core/scene/plugins/dev-plugin-watcher', () => ({
    connectToDevPluginServer: vi.fn(),
    getDevPluginConnectionStatus: () => ({
        state: 'idle',
        scanning: false,
        servers: [],
        portRange: '7741–7750',
        continuousScanning: false,
    }),
    setDevPluginServerContinuousScanning: vi.fn(),
    subscribeToDevPluginConnectionStatus: () => () => {},
}));

const loadComponent = () => import('../SceneSettingsModal');

describe('SceneSettingsModal', () => {
    it('labels the developer tools tab as Developer', async () => {
        const { default: SceneSettingsModal } = await loadComponent();
        render(<SceneSettingsModal onClose={vi.fn()} />);

        expect(screen.getByText(/developer tools for the current scene/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Debug' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Developer' }));

        expect(screen.getByRole('heading', { name: 'Developer' })).toBeInTheDocument();
        expect(screen.getByText('Development Plugin Server')).toBeInTheDocument();
    });
});
