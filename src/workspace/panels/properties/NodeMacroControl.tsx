import { useEffect, useRef, useState } from 'react';
import { FaLink } from 'react-icons/fa';
import { useSceneStore } from '@state/sceneStore';

export function NodeMacroControl({
    path,
    bindingMacroId,
    macros,
    options,
    onAssign,
    hasAssignment = Boolean(bindingMacroId),
}: {
    path: string;
    bindingMacroId?: string;
    macros: ReturnType<typeof useSceneStore.getState>['macros'];
    options: string[];
    onAssign: (macroId: string) => void;
    hasAssignment?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    return (
        <div ref={rootRef} className="ae-macro-assignment">
            <button
                type="button"
                className={`ae-macro-trigger${hasAssignment ? ' assigned' : ''}`}
                title={
                    bindingMacroId
                        ? `Macro: ${macros.byId[bindingMacroId]?.name ?? bindingMacroId}`
                        : hasAssignment
                          ? 'Mixed macro assignments'
                          : 'Assign macro'
                }
                aria-label={`${path} macro`}
                onClick={() => setOpen((value) => !value)}
            >
                <span className="ae-macro-label-text">
                    {bindingMacroId ? (
                        `🎵 ${macros.byId[bindingMacroId]?.name ?? bindingMacroId}`
                    ) : hasAssignment ? (
                        '🎵 Mixed'
                    ) : (
                        <FaLink />
                    )}
                </span>
                {(options.length > 0 || hasAssignment) && <span className="ae-macro-caret">▼</span>}
            </button>
            {open ? (
                <div className="ae-macro-menu">
                    <div className="ae-macro-options">
                        {options.map((id) => (
                            <button
                                key={id}
                                type="button"
                                className="ae-macro-option"
                                onClick={() => {
                                    onAssign(id);
                                    setOpen(false);
                                }}
                            >
                                {macros.byId[id]?.name ?? id}
                            </button>
                        ))}
                        {hasAssignment ? (
                            <>
                                <div className="ae-macro-divider" />
                                <button
                                    type="button"
                                    className="ae-macro-option danger"
                                    onClick={() => {
                                        onAssign('');
                                        setOpen(false);
                                    }}
                                >
                                    Remove Macro
                                </button>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
}
