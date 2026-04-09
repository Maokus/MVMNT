import { useEffect, useRef, useState } from 'react';

interface SaveSceneModalProps {
    initialName: string;
    onCancel: () => void;
    onConfirm: (name: string, options: { embedPlugins: boolean }) => void | Promise<void>;
}

export function SaveSceneModal({ initialName, onCancel, onConfirm }: SaveSceneModalProps) {
    const [name, setName] = useState(initialName);
    const [error, setError] = useState<string | null>(null);
    const [embedPlugins, setEmbedPlugins] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setName(initialName);
        setError(null);
        setEmbedPlugins(false);
    }, [initialName]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCancel();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onCancel]);

    useEffect(() => {
        inputRef.current?.focus();
        if (inputRef.current) {
            const length = inputRef.current.value.length;
            inputRef.current.setSelectionRange(length, length);
        }
    }, []);

    const handleModalClick: React.MouseEventHandler<HTMLDivElement> = (event) => {
        event.stopPropagation();
    };

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setError('Please provide a project name before saving.');
            inputRef.current?.focus();
            return;
        }
        onConfirm(trimmed, { embedPlugins });
    };

    return (
        <div className="fixed inset-0 z-[9900] flex items-center justify-center" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
            <div
                className="relative w-[360px] max-w-[90vw] rounded-lg border border-neutral-700 bg-neutral-900/95 p-5 text-sm text-neutral-200 shadow-2xl"
                onClick={handleModalClick}
            >
                <h2 className="m-0 mb-3 text-lg font-semibold text-white">Save Project</h2>
                <p className="m-0 mb-4 text-[13px] text-neutral-400">
                    Name your project before downloading the scene file. You can change this later from the menu bar.
                </p>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <label className="flex flex-col gap-2 text-[12px] text-neutral-300">
                        Project name
                        <input
                            ref={inputRef}
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            className="rounded border border-neutral-700 bg-neutral-800/80 px-3 py-2 text-[13px] text-white outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
                            placeholder="Enter a name"
                        />
                    </label>
                    <label className="flex items-start gap-2 text-[12px] text-neutral-300">
                        <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={embedPlugins}
                            onChange={(event) => setEmbedPlugins(event.target.checked)}
                        />
                        <span>
                            Embed required plugins in this file
                            <span className="block text-[11px] text-neutral-500">
                                Plugin bundles are stored inside the .mvt export for easier sharing.
                            </span>
                        </span>
                    </label>
                    {error && <p className="m-0 text-[12px] text-blue-400">{error}</p>}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="rounded border border-transparent px-3 py-1.5 text-[13px] font-medium text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="rounded bg-blue-500 px-3 py-1.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
