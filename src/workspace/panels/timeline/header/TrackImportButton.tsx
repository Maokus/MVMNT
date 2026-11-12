import { FaPlus } from 'react-icons/fa';
import type { ChangeEventHandler, RefObject } from 'react';
import { Button } from '@workspace/components/Button';
import { MEDIA_FILE_ACCEPT } from '../utils/fileTypeUtils';

interface TrackImportButtonProps {
    fileRef: RefObject<HTMLInputElement | null>;
    onChange: ChangeEventHandler<HTMLInputElement>;
    busy: boolean;
}

export function TrackImportButton({ fileRef, onChange, busy }: TrackImportButtonProps) {
    return (
        <>
            <Button
                type="button"
                variant="panel"
                size="sm"
                disabled={busy}
                className="flex items-center gap-1"
                title="Import MIDI and audio files"
                data-tutorial-target="import-files"
                onClick={() => fileRef.current?.click()}
            >
                <FaPlus size={14} aria-hidden="true" />
                Import files
            </Button>
            <input
                ref={fileRef}
                type="file"
                accept={MEDIA_FILE_ACCEPT}
                multiple
                className="hidden"
                aria-label="MIDI and audio files"
                onChange={onChange}
                disabled={busy}
            />
        </>
    );
}
