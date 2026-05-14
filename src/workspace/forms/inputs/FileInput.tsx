import React, { useEffect, useRef, useState } from 'react';

interface FileInputProps {
    id: string;
    value: any;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: any) => void;
}

const FileInput: React.FC<FileInputProps> = ({ id, value, schema, disabled = false, title, onChange }) => {
    const [preview, setPreview] = useState<string | null>(null);
    const [currentFileName, setCurrentFileName] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (value) {
            if (typeof value === 'string' && value.startsWith('data:')) {
                if (value.startsWith('data:image')) {
                    setPreview(value);
                    setCurrentFileName('Current: Base64 image');
                } else {
                    setCurrentFileName('Current: Base64 file');
                }
            } else if (typeof value === 'string') {
                setCurrentFileName(`Current: ${value}`);
            } else if (value instanceof File) {
                setCurrentFileName(`Current: ${value.name}`);
            }
        } else {
            if (schema?.accept && schema.accept.includes('.mid')) {
                setCurrentFileName('No MIDI file selected');
            } else {
                setCurrentFileName('No file selected');
            }
            setPreview(null);
        }
    }, [value, schema?.accept]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (schema?.accept && schema.accept.includes('.mid')) {
            setCurrentFileName(`Selected: ${file.name}`);
            setPreview(null);
            onChange(file);
        } else {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const base64 = ev.target?.result as string;
                setPreview(base64);
                setCurrentFileName(`Selected: ${file.name}`);
                onChange(base64);
            };
            reader.readAsDataURL(file);
        }
    };

    const getLabelText = () => {
        if (schema?.accept && schema.accept.includes('.mid')) return 'Choose MIDI File';
        if (schema?.accept && schema.accept.includes('image')) return 'Choose Image';
        return 'Choose File';
    };

    return (
        <div className="file-input-container">
            <label
                className="file-input-label"
                htmlFor={id}
                style={{ pointerEvents: disabled ? 'none' : 'auto', opacity: disabled ? 0.6 : 1 }}
            >
                {getLabelText()}
            </label>

            <input
                ref={fileInputRef}
                type="file"
                id={id}
                accept={schema?.accept || '*/*'}
                disabled={disabled}
                title={title}
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            <div className="current-file">{currentFileName}</div>

            <div className="file-preview">
                {preview && (
                    <img
                        src={preview}
                        alt="Preview"
                        style={{ maxWidth: '100px', maxHeight: '100px', objectFit: 'contain' }}
                    />
                )}
            </div>
        </div>
    );
};

export default FileInput;
