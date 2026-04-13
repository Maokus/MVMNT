import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '@assets/Logo_Transparent.png';
import pfp from '@assets/Logo_Pfp_white.png';
import './homepage.css';
import { FaFileCirclePlus } from 'react-icons/fa6';
import { isZipBytes, writeStoredImportPayload } from '@utils/importPayloadStorage';

/**
 * Home / Landing page
 * - Large title (MVMNT)
 * - Load file button (imports scene)
 * - Template cards: Blank, Default, Debug
 * - Quick links (About, Changelog, Discord, GitHub)
 */
const HomePage: React.FC = () => {
    const navigate = useNavigate();

    const handleOpenTemplate = (template: string) => {
        navigate('/workspace', { state: { template } });
    };

    const handleLoadFile = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.mvt,.json';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const buffer = await file.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                if (isZipBytes(bytes)) {
                    writeStoredImportPayload(bytes);
                } else {
                    let text: string;
                    try {
                        text = new TextDecoder().decode(bytes);
                    } catch {
                        text = await file.text();
                    }
                    writeStoredImportPayload(text);
                }
                navigate('/workspace', { state: { importScene: true } });
            } catch (e) {
                alert('Failed to read file');
            }
        };
        input.click();
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-800 text-neutral-200 px-6 py-10">
            <div className="max-w-4xl w-full">
                <div className="flex flex-col items-left mb-10">
                    <p><span className="text-8xl font-extrabold tracking-tight text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.15)]">MVMNT</span><span>v{((import.meta as any).env?.VITE_VERSION)}</span></p>
                    <p className="mt-4 text-neutral-400 text-lg max-w-2xl">Open-source, flexible MIDI visualization & rendering workspace.</p>
                    <div className="mt-6 flex flex-wrap gap-4">
                        <Link to="/workspace" className="tracking-[0.2rem] px-5 py-2.5 rounded text-sm font-medium transition bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-pink-400">
                            ENTER
                        </Link>

                        <Link to="/about" className="px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium">About</Link>
                        <Link to="/contribute" className="px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium">Contribute</Link>
                        <Link to="/changelog" className="px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium">Changelog</Link>
                        <Link to="/community" className="px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium">Community</Link>
                    </div>
                </div>
            </div>
            <DonationNotice />
        </div>
    );
};
interface TemplateCardProps { title: string; desc: string; onClick: () => void }
const TemplateCard: React.FC<TemplateCardProps> = ({ title, desc, onClick, }) => (
    <button
        onClick={onClick}
        className={[
            'group relative flex flex-col items-start text-left p-2 pl-4 rounded-lg border transition focus:outline-none focus:ring-2',
            'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600 hover:bg-neutral-900 focus:ring-indigo-500',
            'max-w-72'
        ].join(' ')}
    >
        <p><FaFileCirclePlus className='inline' /> <span className="text-sm pl-2">{title}</span></p>
    </button>
);

const DonationNotice: React.FC = () => {
    const [dismissed, setDismissed] = React.useState<boolean>(() => {
        try {
            return false;//localStorage.getItem('donationNoticeDismissed') === '1';
        } catch {
            return false;
        }
    });

    if (dismissed) return null;

    const handleDismiss = () => {
        try { localStorage.setItem('donationNoticeDismissed', '1'); } catch { }
        setDismissed(true);
    };

    return (
        <div className="fixed bottom-4 right-4 z-50 flex items-end gap-2">
            <div className="relative">
                <div className="bg-neutral-900/85 backdrop-blur-sm text-neutral-100 p-3 rounded-lg shadow-lg border border-neutral-800 max-w-xs">
                    <div className="text-sm">
                        <div className="font-medium">Welcome!!</div>
                        <div className="text-neutral-300 mt-1">I develop and host this project at my own expense. If you enjoy the app, please consider donating!</div>
                        <div className="mt-2 flex gap-2">
                            <Link to="/contribute" className="px-2 py-1 text-xs bg-indigo-600 hover:bg-indigo-500 rounded">Donate</Link>
                            <button onClick={handleDismiss} className="px-2 py-1 text-xs bg-neutral-800 hover:bg-neutral-700 rounded">Dismiss</button>
                        </div>
                    </div>
                </div>
                <div className="absolute -right-2 bottom-3 w-3 h-3 bg-neutral-900/85 border border-neutral-800 rotate-45" aria-hidden="true" />
            </div>

            <img src={pfp} alt="Maokus avatar" className="w-10 h-10 rounded-full border-2 border-neutral-800 object-cover" />
        </div>
    );
};

export default HomePage;
