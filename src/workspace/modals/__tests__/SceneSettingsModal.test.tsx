import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

const trackerTime = vi.hoisted(() => ({ seconds: 0 }));
vi.mock('@state/projectTimeTracker', () => ({
    getProjectTimeSpentSeconds: (persistedSeconds: number) => persistedSeconds + trackerTime.seconds,
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
        state: 'unavailable',
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
    it('updates project time while the Metadata tab is open', async () => {
        const { default: SceneSettingsModal } = await loadComponent();
        vi.useFakeTimers();
        trackerTime.seconds = 0;
        const view = render(<SceneSettingsModal onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Metadata' }));
        expect(screen.getByText('0h 0m 0s')).toBeInTheDocument();

        trackerTime.seconds = 1;
        act(() => vi.advanceTimersByTime(250));
        expect(screen.getByText('0h 0m 1s')).toBeInTheDocument();

        view.unmount();
        vi.useRealTimers();
    });

    it('labels the developer tools tab as Developer', async () => {
        const { default: SceneSettingsModal } = await loadComponent();
        render(<SceneSettingsModal onClose={vi.fn()} />);

        expect(screen.getByText(/developer tools for the current scene/i)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Debug' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Developer' }));

        expect(screen.getByRole('heading', { name: 'Developer' })).toBeInTheDocument();
        expect(screen.getByText('Development Plugin Server')).toBeInTheDocument();
    });

    it('shows that development plugins are unavailable before scanning in a production build', async () => {
        const { default: SceneSettingsModal } = await loadComponent();
        render(<SceneSettingsModal onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Developer' }));

        expect(
            screen.getByText('Development plugin servers are available only while running MVMNT in development mode.')
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Scan' })).toBeDisabled();
        expect(screen.getByRole('checkbox', { name: 'Continue scanning' })).toBeDisabled();
    });
});
