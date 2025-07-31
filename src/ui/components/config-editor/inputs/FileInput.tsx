import React, { useState, useRef } from 'react';

interface FileInputProps {
    id: string;
    value: any;
    schema: any;
    disabled?: boolean;
    title?: string;
    onChange: (value: any) => void;
}

const FileInput: React.FC<FileInputProps> = ({
    id,
    value,
    schema,
    disabled = false,
    title,
    onChange
}) => {
    const [preview, setPreview] = useState<string | null>(null);
    const [currentFileName, setCurrentFileName] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Initialize current file display
    React.useEffect(() => {
        if (value) {
            if (typeof value === 'string' && value.startsWith('data:')) {
                // It's a base64 data URL
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
            // Set appropriate "no file" message based on file type
            if (schema.accept && schema.accept.includes('.mid')) {
                setCurrentFileName('No MIDI file selected');
            } else {
                setCurrentFileName('No file selected');
            }
            setPreview(null);
        }
    }, [value, schema.accept]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Check if it's a MIDI file
            if (schema.accept && schema.accept.includes('.mid')) {
                // For MIDI files, pass the File object directly
                setCurrentFileName(`Selected: ${file.name}`);
                setPreview(null);
                onChange(file);
            } else {
                // For image files, convert to base64
                const reader = new FileReader();
                reader.onload = (e) => {
                    const base64 = e.target?.result as string;
                    setPreview(base64);
                    setCurrentFileName(`Selected: ${file.name}`);
                    onChange(base64);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    // Set label text based on file type
    const getLabelText = () => {
        if (schema.accept && schema.accept.includes('.mid')) {
            return 'Choose MIDI File';
        } else if (schema.accept && schema.accept.includes('image')) {
            return 'Choose Image';
        } else {
            return 'Choose File';
        }
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
                accept={schema.accept || '*/*'}
                disabled={disabled}
                title={title}
                onChange={handleFileChange}
                style={{ display: 'none' }}
            />

            <div className="current-file">
                {currentFileName}
            </div>

            <div className="file-preview">
                {preview && (
                    <img
                        src={preview}
                        alt="Preview"
                        style={{
                            maxWidth: '100px',
                            maxHeight: '100px',
                            objectFit: 'contain'
                        }}
                    />
                )}
            </div>
        </div>
    );
};

export default FileInput;
