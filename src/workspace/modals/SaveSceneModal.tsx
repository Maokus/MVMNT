import { useEffect, useRef, useState } from 'react';
import { useSceneMetadataStore } from '@state/sceneMetadataStore';
import { Button } from '@workspace/components/Button';
import { ModalShell } from './ModalShell';
import { PROJECT_NAME_REQUIRED } from '@workspace/userMessages';

interface SaveSceneModalProps {
    initialName: string;
    onCancel: () => void;
    onConfirm: (
        name: string,
        options: { embedPlugins: boolean; description: string; author: string }
    ) => void | Promise<void>;
}

export function SaveSceneModal({ initialName, onCancel, onConfirm }: SaveSceneModalProps) {
    const metadata = useSceneMetadataStore((s) => s.metadata);
    const [name, setName] = useState(initialName);
    const [error, setError] = useState<string | null>(null);
    const [embedPlugins, setEmbedPlugins] = useState(true);
    const [description, setDescription] = useState(metadata.description);
    const [author, setAuthor] = useState(metadata.author);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setName(initialName);
        setError(null);
        setEmbedPlugins(true);
        setDescription(metadata.description);
        setAuthor(metadata.author);
    }, [initialName, metadata.description, metadata.author]);

    useEffect(() => {
        inputRef.current?.focus();
        if (inputRef.current) {
            const length = inputRef.current.value.length;
            inputRef.current.setSelectionRange(length, length);
        }
    }, []);

    const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
        event.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            setError(PROJECT_NAME_REQUIRED);
            inputRef.current?.focus();
            return;
        }
        onConfirm(trimmed, { embedPlugins, description, author });
    };

    return (
        <ModalShell shortcutId="modal.save-scene.escape" label="Save Project" onCancel={onCancel}>
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
                        className="rounded border border-neutral-800 bg-neutral-800 px-3 py-2 text-[13px] text-white outline-none focus:border-blue-400"
                        placeholder="Enter a name"
                    />
                </label>
                <div className="flex flex-col gap-0">
                    <Button variant="faint" size="full" onClick={() => setIsAdvancedOpen((prev) => !prev)}>
                        <svg
                            className={`h-3 w-3 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`}
                            viewBox="0 0 12 12"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                        >
                            <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Advanced
                    </Button>
                    {isAdvancedOpen && (
                        <div className="mt-3 flex flex-col gap-3 rounded border border-neutral-800 bg-neutral-800 p-3">
                            <label className="flex flex-col gap-1.5 text-[12px] text-neutral-300">
                                Description
                                <textarea
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    rows={2}
                                    className="resize-none rounded border border-neutral-800 bg-neutral-800 px-3 py-2 text-[13px] text-white outline-none focus:border-blue-400"
                                    placeholder="Optional description"
                                />
                            </label>
                            <label className="flex flex-col gap-1.5 text-[12px] text-neutral-300">
                                Author
                                <input
                                    type="text"
                                    value={author}
                                    onChange={(event) => setAuthor(event.target.value)}
                                    className="rounded border border-neutral-800 bg-neutral-800 px-3 py-2 text-[13px] text-white outline-none focus:border-blue-400"
                                    placeholder="Optional author name"
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
                        </div>
                    )}
                </div>
                {error && <p className="m-0 text-[12px] text-blue-400">{error}</p>}
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="md" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        size="md"
                        type="submit"
                        className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
                    >
                        Save
                    </Button>
                </div>
            </form>
        </ModalShell>
    );
}
