import { FloatingFocusManager, FloatingOverlay, useFloating } from '@floating-ui/react';
import { useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';

const sections = [
    {
        title: 'Preview',
        rows: [
            ['Shift + 1', 'Fit canvas and visible artwork'],
            ['Shift + 2', 'Fit selected elements'],
            ['⌘/Ctrl + 0', 'Reset zoom and pan'],
            ['⌘/Ctrl + scroll', 'Zoom around pointer'],
            ['Two-finger scroll', 'Pan preview'],
            ['Middle-button drag', 'Pan preview'],
            ['Double middle-click', 'Reset zoom and pan'],
            ['Shift + A', 'Add element'],
            ['I', 'Add keyframe to selected element'],
            ['Alt + drag', 'Duplicate selected element'],
            ['Shift + rotate', 'Snap rotation'],
            ['⌘/Ctrl + drag', 'Bypass snapping'],
        ],
    },
    {
        title: 'Timeline',
        rows: [
            ['← / →', 'Move one beat'],
            ['⌘/Ctrl + ← / →', 'Move one tick'],
            ['Shift + 1', 'Fit all timeline content'],
            ['Shift + 2', 'Fit timeline selection'],
            ['F', 'Frame selection, or center on playhead'],
            ['J / K', 'Previous / next automation keyframe'],
            ['+ / −', 'Zoom timeline'],
            ['S', 'Toggle snapping'],
            ['⌘/Ctrl + C / V / X', 'Copy / paste / cut selected clips'],
            ['⌘/Ctrl + C / V', 'Copy / paste automation keyframes'],
            ['⌘/Ctrl + D', 'Duplicate selected clips'],
            ['Space', 'Play / pause'],
        ],
    },
    {
        title: 'Scene and project',
        rows: [
            ['⌘/Ctrl + G', 'Group selected elements'],
            ['⌘/Ctrl + Shift + G', 'Ungroup selected elements'],
            ['⌘/Ctrl + D', 'Duplicate selected elements'],
            ['Arrow keys', 'Nudge selected elements'],
            ['Shift + arrows', 'Nudge selected elements by 10'],
            ['Delete', 'Delete selection'],
            ['⌘/Ctrl + A', 'Select all in scene tree'],
            ['Esc', 'Clear selection'],
            ['⌘/Ctrl + Z', 'Undo'],
            ['⌘/Ctrl + Shift + Z', 'Redo'],
            ['⌘/Ctrl + S', 'Save'],
            ['⌘/Ctrl + Shift + S', 'Save as'],
            ['⌘/Ctrl + O', 'Open'],
            ['⌘/Ctrl + N', 'New scene'],
            ['⌘/Ctrl + ,', 'Scene settings'],
        ],
    },
];

export function ControlsModal({ onClose }: { onClose: () => void }) {
    const { refs, context } = useFloating({ open: true, onOpenChange: (open) => !open && onClose() });
    useGlobalShortcut({
        id: 'modal.controls',
        domain: 'modal',
        matches: () => true,
        handle: (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
            if ((event.ctrlKey || event.metaKey) && ['s', 'o', 'n', 'z', 'y'].includes(event.key.toLowerCase())) {
                event.preventDefault();
            }
            return true;
        },
    });
    return (
        <FloatingOverlay
            lockScroll
            className="z-[9000] flex items-center justify-center bg-black/65 p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <FloatingFocusManager context={context} outsideElementsInert returnFocus>
                <section
                    ref={refs.setFloating}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="controls-title"
                    className="flex max-h-[85vh] w-[760px] max-w-[95vw] flex-col rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-100 shadow-2xl"
                >
                    <div className="flex items-center justify-between border-b border-neutral-700 px-5 py-4">
                        <div>
                            <h2 id="controls-title" className="m-0 text-xl font-semibold">
                                Controls
                            </h2>
                            <p className="m-0 mt-1 text-xs text-neutral-400">Shortcuts apply to the focused panel.</p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close controls"
                            className="rounded px-2 py-1 text-lg text-neutral-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                            ×
                        </button>
                    </div>
                    <div className="grid gap-6 overflow-y-auto p-5 sm:grid-cols-2">
                        {sections.map((section) => (
                            <div key={section.title}>
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
                                    {section.title}
                                </h3>
                                <dl className="m-0 space-y-2">
                                    {section.rows.map(([keys, label]) => (
                                        <div key={keys} className="flex items-start justify-between gap-3 text-xs">
                                            <dt className="text-neutral-300">{label}</dt>
                                            <dd className="m-0 shrink-0 rounded border border-neutral-600 bg-neutral-800 px-1.5 py-0.5 font-mono text-[11px] text-white">
                                                {keys}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>
                        ))}
                    </div>
                    <p className="m-0 border-t border-neutral-700 px-5 py-3 text-xs text-neutral-400">
                        Press ? to open this guide and Esc to close it.
                    </p>
                </section>
            </FloatingFocusManager>
        </FloatingOverlay>
    );
}
