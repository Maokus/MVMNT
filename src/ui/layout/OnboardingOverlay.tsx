import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

interface OnboardingOverlayProps {
    onClose: () => void;
}

// Simple first-time onboarding overlay. Appears only if localStorage key not set.
const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onClose }) => {
    // Allow ESC key to close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(30,30,30,.95),rgba(0,0,0,.95))] flex items-center justify-center z-[9000] animate-[fadeIn_.4s_ease]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="onboarding-title"
        >
            <div className="border rounded-[10px] px-9 py-8 max-w-[640px] w-[92vw] shadow-2xl [background-color:var(--twc-menubar)] [border-color:var(--twc-border)]">
                <h2 id="onboarding-title" className="m-0 mb-4 text-2xl font-semibold tracking-wide">Welcome to MVMNT</h2>
                <p style={{ opacity: 0.85, lineHeight: 1.4 }}>
                    This tool lets you build animated visualizations from MIDI files and custom scene elements.
                    Here are a few quick tips to get started:
                </p>
                <ul className="list-disc pl-5 my-3 flex flex-col gap-1.5 text-sm">
                    <li>Use the menu bar to save / load / create new scenes.</li>
                    <li>Double‑click the scene name to rename it.</li>
                    <li>Import a MIDI file to populate notes for animations.</li>
                    <li>Select elements in the canvas to edit their properties in the side panels.</li>
                    <li>Export an image sequence or video once you're happy with the animation.</li>
                </ul>
                <div className="flex gap-3 mt-2">
                    <button
                        className="px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-[#0e639c] border-[#1177bb] text-white hover:bg-[#1177bb] hover:border-[#1890d4]"
                        onClick={onClose}
                    >
                        Got it
                    </button>
                    <Link
                        to="/about"
                        onClick={onClose}
                        className="px-3 py-1 border rounded cursor-pointer text-xs font-medium transition inline-flex items-center justify-center bg-neutral-600 border-neutral-500 text-neutral-100 hover:bg-neutral-500 hover:border-neutral-400"
                    >
                        More Info
                    </Link>
                </div>
                <p className="text-[11px] opacity-60 mt-[18px]">(You can open the About page any time via the logo in the top right.)</p>
            </div>
        </div>
    );
};

export default OnboardingOverlay;
