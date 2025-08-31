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
        <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <div className="onboarding-modal">
                <h2 id="onboarding-title">Welcome to MVMNT</h2>
                <p style={{ opacity: 0.85, lineHeight: 1.4 }}>
                    This tool lets you build animated visualizations from MIDI files and custom scene elements.
                    Here are a few quick tips to get started:
                </p>
                <ul className="onboarding-list">
                    <li>Use the menu bar to save / load / create new scenes.</li>
                    <li>Double‑click the scene name to rename it.</li>
                    <li>Import a MIDI file to populate notes for animations.</li>
                    <li>Select elements in the canvas to edit their properties in the side panels.</li>
                    <li>Export an image sequence or video once you're happy with the animation.</li>
                </ul>
                <div className="onboarding-actions">
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
                <p className="onboarding-footer-hint">(You can open the About page any time via the logo in the top right.)</p>
            </div>
        </div>
    );
};

export default OnboardingOverlay;
