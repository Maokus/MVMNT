import React, { useEffect, useState } from 'react';
import { useVisualizer } from '@context/VisualizerContext';

interface RenderModalProps {
    onClose: () => void;
}

// Simple modal to configure export settings & trigger video export.
const RenderModal: React.FC<RenderModalProps> = ({ onClose }) => {
    const { exportSettings, setExportSettings, exportVideo } = useVisualizer() as any;
    const [local, setLocal] = useState(() => ({ ...exportSettings }));
    const [rangeMode, setRangeMode] = useState(exportSettings.fullDuration);
    const [isEncoding, setIsEncoding] = useState(false);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    const update = (patch: Partial<typeof local>) => setLocal((prev: typeof local) => ({ ...prev, ...patch }));

    const start = async () => {
        setExportSettings((prev: any) => ({ ...prev, ...local, fullDuration: rangeMode }));
        setIsEncoding(true);
        try {
            await exportVideo({ ...local, fullDuration: rangeMode });
            onClose();
        } catch (e) {
            // error surfaced via context already
        } finally { setIsEncoding(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9700]" role="dialog" aria-modal="true">
            <div className="border rounded-lg w-[560px] max-w-[92vw] p-5 [background-color:var(--twc-menubar)] [border-color:var(--twc-border)] shadow-2xl relative">
                <h2 className="m-0 text-xl font-semibold mb-2">Render Video</h2>
                <p className="m-0 mb-4 text-sm opacity-80">Configure output parameters and generate an MP4 directly in the browser using WebCodecs.</p>
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <label className="flex flex-col gap-1">FPS
                        <input type="number" min={1} max={240} value={local.fps} onChange={e => update({ fps: Number(e.target.value) || 1 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                    </label>
                    <label className="flex flex-col gap-1">Width
                        <input type="number" min={16} value={local.width} onChange={e => update({ width: Number(e.target.value) || 16 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                    </label>
                    <label className="flex flex-col gap-1">Height
                        <input type="number" min={16} value={local.height} onChange={e => update({ height: Number(e.target.value) || 16 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                    </label>
                    <label className="flex flex-col gap-1">Mode
                        <select value={rangeMode ? 'full' : 'range'} onChange={e => setRangeMode(e.target.value === 'full')} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                            <option value="full">Full Duration</option>
                            <option value="range">Time Range</option>
                        </select>
                    </label>
                    {!rangeMode && (
                        <>
                            <label className="flex flex-col gap-1">Start Time (s)
                                <input type="number" min={0} value={local.startTime} onChange={e => update({ startTime: Number(e.target.value) || 0 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            </label>
                            <label className="flex flex-col gap-1">End Time (s)
                                <input type="number" min={0} value={local.endTime} onChange={e => update({ endTime: Number(e.target.value) || 0 })} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            </label>
                        </>
                    )}
                </div>
                <div className="flex gap-2 justify-end mt-4">
                    <button disabled={isEncoding} onClick={onClose} className="px-3 py-1 border rounded text-xs font-medium bg-neutral-700 border-neutral-600 text-neutral-200 hover:bg-neutral-600 hover:text-white disabled:opacity-50">Cancel</button>
                    <button disabled={isEncoding} onClick={start} className="px-4 py-1 rounded text-xs font-semibold bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white shadow hover:opacity-90 disabled:opacity-50">{isEncoding ? 'Starting...' : 'Start Render'}</button>
                </div>
            </div>
        </div>
    );
};

export default RenderModal;
