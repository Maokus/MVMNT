import React, { useCallback, useState } from 'react';
import { TemplateBrowserModal } from './TemplateBrowserModal';
import type { TemplateDefinition } from './types';

export interface BrowseTemplatesButtonProps
    extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
    templates: TemplateDefinition[];
    onTemplateSelect: (template: TemplateDefinition) => Promise<boolean | void> | boolean | void;
    buttonText?: React.ReactNode;
}

export const BrowseTemplatesButton: React.FC<BrowseTemplatesButtonProps> = ({
    templates,
    onTemplateSelect,
    buttonText = 'Browse Templates',
    children,
    disabled,
    className,
    type,
    ...rest
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const isDisabled = disabled || templates.length === 0;

    const handleOpen = useCallback(() => {
        if (isDisabled) return;
        setIsOpen(true);
    }, [isDisabled]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleSelect = useCallback(
        async (template: TemplateDefinition) => {
            try {
                const result = await onTemplateSelect(template);
                if (result !== false) {
                    setIsOpen(false);
                }
            } catch (error) {
                console.error('Failed to apply template', error);
            }
        },
        [onTemplateSelect]
    );

    return (
        <>
            <button
                {...rest}
                type={type ?? 'button'}
                className={className}
                disabled={isDisabled}
                onClick={handleOpen}
            >
                {children ?? buttonText}
            </button>
            {isOpen && (
                <TemplateBrowserModal templates={templates} onClose={handleClose} onSelect={handleSelect} />
            )}
        </>
    );
};

export default BrowseTemplatesButton;
