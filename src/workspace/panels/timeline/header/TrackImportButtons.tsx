import React from 'react';
import { FaPlus } from 'react-icons/fa';
import type { ChangeEvent, RefObject } from 'react';

interface TrackImportButtonsProps {
    fileRef: RefObject<HTMLInputElement | null>;
    audioFileRef: RefObject<HTMLInputElement | null>;
    onAddFile: (e: ChangeEvent<HTMLInputElement>) => void;
    onAddAudio: (e: ChangeEvent<HTMLInputElement>) => void;
}

const TrackImportButtons: React.FC<TrackImportButtonsProps> = ({
    fileRef, audioFileRef, onAddFile, onAddAudio,
}) => (
    <div className="flex items-center gap-2">
        <label className="px-2 py-1 border border-neutral-700 rounded cursor-pointer text-xs font-medium bg-neutral-900/50 hover:bg-neutral-800/60 flex items-center gap-1">
            <FaPlus className="text-neutral-300" />
            <span>MIDI</span>
            <input
                ref={fileRef}
                type="file"
                accept=".mid,.midi"
                multiple
                className="hidden"
                onChange={onAddFile}
            />
        </label>
        <label className="px-2 py-1 border border-emerald-700 rounded cursor-pointer text-xs font-medium bg-emerald-900/40 hover:bg-emerald-800/60 flex items-center gap-1" title="Add Audio Track (wav/mp3/ogg)">
            <FaPlus className="text-emerald-300" />
            <span>Audio</span>
            <input
                ref={audioFileRef}
                type="file"
                accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
                className="hidden"
                onChange={onAddAudio}
            />
        </label>
    </div>
);

export default TrackImportButtons;
