import React from 'react';
import { Section } from './Section';

type UndoEntry = {
    index: number;
    hasScenePatch: boolean;
    hasTimelinePatch: boolean;
    source?: string;
    ageMs: number;
    mergeKey: string | null;
    transient: boolean;
};

type UndoDebugInfo = {
    index: number;
    size: number;
    entries: UndoEntry[];
};

type UndoSummary = {
    info: UndoDebugInfo;
    canUndo: boolean;
    canRedo: boolean;
};

const collectUndoSummary = (): UndoSummary | null => {
    if (typeof window === 'undefined') return null;
    const win = window as typeof window & {
        __mvmntUndo?: {
            debugStack?: () => UndoDebugInfo;
            canUndo?: () => boolean;
            canRedo?: () => boolean;
        };
        getUndoStack?: () => UndoDebugInfo;
    };
    const controller = win.__mvmntUndo;
    let info: UndoDebugInfo | null = null;
    try {
        if (typeof win.getUndoStack === 'function') {
            info = win.getUndoStack();
        } else if (controller?.debugStack) {
            info = controller.debugStack();
        }
    } catch {
        info = null;
    }
    if (!info) return null;
    return {
        info,
        canUndo: !!controller?.canUndo?.(),
        canRedo: !!controller?.canRedo?.(),
    };
};

const formatAge = (ms: number | undefined) => {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '—';
    if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms ago`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s ago`;
    const minutes = ms / 60000;
    if (minutes < 60) return `${minutes.toFixed(1)}m ago`;
    const hours = minutes / 60;
    return `${hours.toFixed(1)}h ago`;
};

type UndoSectionProps = {
    open: boolean;
    onToggle: () => void;
};

export const UndoSection: React.FC<UndoSectionProps> = ({ open, onToggle }) => {
    const [undoSummary, setUndoSummary] = React.useState<UndoSummary | null>(() => collectUndoSummary());

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const update = () => setUndoSummary(collectUndoSummary());
        update();
        const id = window.setInterval(update, 1000);
        return () => {
            window.clearInterval(id);
        };
    }, []);

    return (
        <Section title="Undo Stack" open={open} onToggle={onToggle}>
            {undoSummary ? (
                <div style={{ display: 'grid', gap: 8 }}>
                    <div>
                        <div style={{ fontSize: 11, opacity: 0.75 }}>Undoable commands</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {undoSummary.info.index + 1} / {undoSummary.info.size}
                        </div>
                    </div>
                    <div>
                        <span>Can undo: </span>
                        <span style={{ color: undoSummary.canUndo ? '#34d399' : '#f87171' }}>
                            {undoSummary.canUndo ? 'yes' : 'no'}
                        </span>
                        <span style={{ marginLeft: 8 }}>Can redo: </span>
                        <span style={{ color: undoSummary.canRedo ? '#34d399' : '#f87171' }}>
                            {undoSummary.canRedo ? 'yes' : 'no'}
                        </span>
                    </div>
                    {undoSummary.info.entries.length ? (
                        <div>
                            <div style={{ fontSize: 11, opacity: 0.75, marginBottom: 2 }}>Recent entries</div>
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 4 }}>
                                {[...undoSummary.info.entries]
                                    .slice(-5)
                                    .reverse()
                                    .map((entry) => (
                                        <li key={entry.index}>
                                            #{entry.index} · {entry.source ?? 'unknown'} ·
                                            <span style={{ marginLeft: 4 }}>
                                                scene:{entry.hasScenePatch ? 'yes' : 'no'}
                                            </span>
                                            <span style={{ marginLeft: 4 }}>
                                                timeline:{entry.hasTimelinePatch ? 'yes' : 'no'}
                                            </span>
                                            <span style={{ marginLeft: 4 }}>
                                                transient:{entry.transient ? 'yes' : 'no'}
                                            </span>
                                            {entry.mergeKey ? (
                                                <span style={{ marginLeft: 4 }}>merge:{entry.mergeKey}</span>
                                            ) : null}
                                            <span style={{ marginLeft: 4, opacity: 0.7 }}>
                                                {formatAge(entry.ageMs)}
                                            </span>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    ) : (
                        <div style={{ opacity: 0.65, fontSize: 11 }}>Stack empty.</div>
                    )}
                </div>
            ) : (
                <div style={{ opacity: 0.65, fontSize: 11 }}>Undo stack unavailable.</div>
            )}
        </Section>
    );
};
