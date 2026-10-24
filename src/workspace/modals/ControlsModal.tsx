import { FloatingFocusManager, FloatingOverlay, useFloating } from '@floating-ui/react';
import { useGlobalShortcut } from '@context/shortcuts/shortcutRegistry';
import { Button } from '@workspace/components/Button';

const sections = [
    {
        title: 'Preview',
        rows: [
            ['Shift + 1', 'Fit canvas and visible artwork'],
            ['Shift + 2', 'Fit selected elements'],
            ['Shift + 0', 'Reset zoom and pan'],
            ['⌘/Ctrl + 0', 'Reset zoom and pan'],
            ['⌘/Ctrl + scroll', 'Zoom around pointer'],
            ['Two-finger scroll', 'Pan preview'],
            ['Middle-button drag', 'Pan preview'],
            ['Double middle-click', 'Reset zoom and pan'],
            ['Shift + A', 'Add element'],
            ['I', 'Insert keyframe for the selected node'],
            ['Alt + drag element', 'Duplicate dragged selection'],
            ['Alt + drag scale handle', 'Scale around the pivot'],
            ['Shift + drag rotation handle', 'Snap rotation to 15°'],
            ['⌘/Ctrl + drag element', 'Bypass move snapping'],
            ['Arrow keys', 'Nudge selected elements by 1'],
            ['Shift + arrows', 'Nudge selected elements by 10'],
            ['Right-click', 'Clear preview selection'],
        ],
    },
    {
        title: 'Timeline',
        rows: [
            ['← / →', 'Move one beat'],
            ['⌘/Ctrl + ← / →', 'Move playhead one tick (any editor)'],
            ['Shift + 1', 'Fit all timeline content'],
            ['Shift + 2', 'Fit timeline selection'],
            ['F', 'Frame selection, or center on playhead'],
            ['J / K', 'Previous / next keyframe (automation pane)'],
            ['= / + / −', 'Zoom timeline'],
            ['S', 'Toggle snapping'],
            ['⌘/Ctrl + A', 'Select all clips (clip pane)'],
            ['⌘/Ctrl + C / V / X', 'Copy / paste / cut clips (clip pane)'],
            ['⌘/Ctrl + D', 'Duplicate clips (clip pane)'],
            ['⌘/Ctrl + C / V', 'Copy / paste keyframes (automation pane)'],
            ['⌘/Ctrl + D', 'Duplicate selected keyframes (automation pane)'],
            ['Space', 'Play / pause'],
            ['Middle-button drag', 'Pan timeline'],
            ['Horizontal scroll', 'Pan timeline'],
            ['⌘/Ctrl + scroll', 'Zoom timeline around pointer'],
        ],
    },
    {
        title: 'Scene editing',
        rows: [
            ['↑ / ↓', 'Move selection in the scene hierarchy'],
            ['← / →', 'Collapse, expand, or step in and out of a group'],
            ['Home / End', 'Jump to the first or last hierarchy row'],
            ['F2', 'Rename the selected hierarchy row'],
            ['⌘/Ctrl + G', 'Group selected elements'],
            ['⌘/Ctrl + Shift + G', 'Ungroup selected elements'],
            ['⌘/Ctrl + D', 'Duplicate selected elements'],
            ['Delete / Backspace', 'Delete selection in the active editor'],
            ['⌘/Ctrl + A', 'Select all in scene tree'],
            ['Esc', 'Clear scene selection (tree or preview)'],
        ],
    },
    {
        title: 'Project and help',
        rows: [
            ['⌘/Ctrl + Z', 'Undo'],
            ['⌘/Ctrl + Shift + Z', 'Redo'],
            ['⌘/Ctrl + Y', 'Redo'],
            ['⌘/Ctrl + S', 'Save'],
            ['⌘/Ctrl + Shift + S', 'Save as'],
            ['⌘/Ctrl + O', 'Open'],
            ['⌘/Ctrl + N', 'New scene'],
            ['⌘/Ctrl + ,', 'Scene settings'],
            ['?', 'Open controls'],
            ['Ctrl + Shift + D', 'Toggle developer overlay (when enabled)'],
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
            <FloatingFocusManager context={context} outsideElementsInert returnFocus initialFocus={refs.floating}>
                <section
                    ref={refs.setFloating}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="controls-title"
                    tabIndex={-1}
                    className="flex max-h-[85vh] w-[1040px] max-w-[95vw] flex-col overflow-hidden rounded border border-neutral-800 bg-neutral-900 text-neutral-100 outline-none"
                >
                    <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
                        <h2 id="controls-title" className="m-0 text-lg font-semibold">
                            Controls
                        </h2>
                        <div className="flex items-center gap-2">
                            <kbd className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400">
                                Esc
                            </kbd>
                            <Button variant="ghost" size="full" onClick={onClose} aria-label="Close controls">
                                ×
                            </Button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-4 overflow-y-auto p-5 lg:grid-cols-4">
                        {sections.map((section) => (
                            <div key={section.title}>
                                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-blue-300">
                                    {section.title}
                                </h3>
                                <dl className="m-0 space-y-1.5">
                                    {section.rows.map(([keys, label]) => (
                                        <div
                                            key={`${keys}:${label}`}
                                            className="flex items-start justify-between gap-3 text-xs"
                                        >
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
                </section>
            </FloatingFocusManager>
        </FloatingOverlay>
    );
}
