import React, { useEffect, useState } from 'react';
import { useVisualizer } from '@context/VisualizerContext';

interface RenderModalProps {
    onClose: () => void;
}

// Simple modal to configure export settings & trigger video export.
const RenderModal: React.FC<RenderModalProps> = ({ onClose }) => {
    const { exportSettings, exportVideo, exportSequence, setExportSettings } = useVisualizer() as any;
    // Local UI state: format selection & optional overrides (currently only range + video params)
    const [format, setFormat] = useState<'png' | 'mp4'>('mp4');
    const [rangeMode, setRangeMode] = useState(exportSettings.fullDuration);
    const [startTime, setStartTime] = useState<number>(exportSettings.startTime || 0);
    const [endTime, setEndTime] = useState<number>(exportSettings.endTime || 0);
    const [qualityPreset, setQualityPreset] = useState<'low' | 'medium' | 'high'>('high');
    const [bitrate, setBitrate] = useState<number | ''>('');
    const [includeAudio, setIncludeAudio] = useState<boolean>(exportSettings.includeAudio !== false); // default true
    const [isExporting, setIsExporting] = useState(false);

    useEffect(() => {
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    const beginExport = async () => {
        // Persist duration/range flags globally so future exports use them
        setExportSettings((prev: any) => ({ ...prev, fullDuration: rangeMode, startTime, endTime, includeAudio }));
        setIsExporting(true);
        try {
            if (format === 'png') {
                await exportSequence({ fullDuration: rangeMode, startTime, endTime });
            } else {
                await exportVideo({ fullDuration: rangeMode, startTime, endTime, bitrate: bitrate === '' ? undefined : bitrate, qualityPreset, includeAudio });
            }
            onClose();
        } catch (e) {
            // surfaced upstream
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9700]" role="dialog" aria-modal="true">
            <div className="border rounded-lg w-[560px] max-w-[92vw] p-5 [background-color:var(--twc-menubar)] [border-color:var(--twc-border)] shadow-2xl relative">
                <h2 className="m-0 text-xl font-semibold mb-2">Render / Export</h2>
                <p className="m-0 mb-4 text-sm opacity-80">Choose an output format and (for video) quality settings. Resolution & FPS are controlled in Global Properties.</p>
                <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                    <label className="flex flex-col gap-1">Format
                        <select value={format} onChange={e => setFormat(e.target.value as any)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                            <option value="mp4">MP4 Video</option>
                            <option value="png">PNG Sequence</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">Duration
                        <select value={rangeMode ? 'full' : 'range'} onChange={e => setRangeMode(e.target.value === 'full')} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                            <option value="full">Full</option>
                            <option value="range">Range</option>
                        </select>
                    </label>
                    {!rangeMode && (
                        <>
                            <label className="flex flex-col gap-1">Start (s)
                                <input type="number" min={0} value={startTime} onChange={e => setStartTime(Number(e.target.value) || 0)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            </label>
                            <label className="flex flex-col gap-1">End (s)
                                <input type="number" min={0} value={endTime} onChange={e => setEndTime(Number(e.target.value) || 0)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                            </label>
                        </>
                    )}
                    {format === 'mp4' && (
                        <>
                            <label className="flex flex-col gap-1">Quality Preset
                                <select value={qualityPreset} onChange={e => setQualityPreset(e.target.value as any)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm">
                                    <option value="low">Low</option>
                                    <option value="medium">Medium</option>
                                    <option value="high">High</option>
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">Bitrate (bps)
                                <input type="number" placeholder="(auto)" min={100000} step={100000} value={bitrate} onChange={e => setBitrate(e.target.value === '' ? '' : Number(e.target.value) || 0)} className="bg-neutral-800 border border-neutral-600 rounded px-2 py-1 text-sm" />
                                <span className="text-[10px] opacity-60">Leave blank to use preset.</span>
                            </label>
                            <label className="flex items-center gap-2 col-span-2 mt-1 select-none">
                                <input type="checkbox" checked={includeAudio} onChange={e => setIncludeAudio(e.target.checked)} />
                                <span>Include Audio Track</span>
                            </label>
                        </>
                    )}
                </div>
                <div className="flex gap-2 justify-end mt-2">
                    <button disabled={isExporting} onClick={onClose} className="px-3 py-1 border rounded text-xs font-medium bg-neutral-700 border-neutral-600 text-neutral-200 hover:bg-neutral-600 hover:text-white disabled:opacity-50">Cancel</button>
                    <button disabled={isExporting} onClick={beginExport} className="px-4 py-1 rounded text-xs font-semibold bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white shadow hover:opacity-90 disabled:opacity-50">{isExporting ? 'Starting...' : (format === 'mp4' ? 'Start Video Render' : 'Start PNG Export')}</button>
                </div>
            </div>
        </div>
    );
};

export default RenderModal;
