import React from 'react';

import { Button } from '@workspace/components/Button';

interface SmallScreenWarningProps {
    onProceed: () => void;
}

const SmallScreenWarning: React.FC<SmallScreenWarningProps> = ({ onProceed }) => {
    return (
        <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9500]"
            role="dialog"
            aria-modal="true"
        >
            <div className="border rounded-lg max-w-[560px] w-[92vw] p-6 [background-color:var(--twc-menubar)] [border-color:var(--twc-border)] shadow-2xl">
                <h2 className="m-0 text-xl font-semibold mb-2">Best viewed on a larger screen</h2>
                <p className="opacity-80 text-sm leading-relaxed">
                    This app is intended for desktop use and works best at widths of 1200px or more. Some layouts may
                    not function correctly on smaller screens.
                </p>
                <div className="flex gap-2 mt-4">
                    <Button variant="navy" size="full" onClick={onProceed}>
                        Proceed anyway
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default SmallScreenWarning;
