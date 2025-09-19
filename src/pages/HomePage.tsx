import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import logo from '@assets/Logo_Transparent.png';
import "./homepage.css"

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
        input.accept = '.json';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const text = await file.text();
                sessionStorage.setItem('mvmnt_import_scene_payload', text);
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
                        <button onClick={handleLoadFile} className="px-5 py-2.5 rounded bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 transition font-medium text-sm">Load Scene (.json)</button>

                        <Link to="/about" className="px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium">About</Link>
                        <Link to="/changelog" className="px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium">Changelog</Link>
                        <Link to="https://maok.us/discord" target="_blank" rel="noreferrer" className="px-5 py-2.5 rounded bg-[#5865F2] hover:brightness-110 text-sm font-medium">Discord</Link>
                        <Link to="https://github.com/Maokus/mvmnt" target="_blank" rel="noreferrer" className="px-5 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-sm font-medium">GitHub</Link>
                    </div>
                </div>

                <section>
                    <h2 className="text-xl font-semibold mb-4 text-neutral-300">New File</h2>
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        <TemplateCard title="Blank" desc="Empty workspace – start from scratch." onClick={() => handleOpenTemplate('blank')} />
                        <TemplateCard
                            featured
                            title="Default"
                            desc="Starter scene with piano roll, HUD overlays, and macros bound."
                            onClick={() => handleOpenTemplate('default')}
                        />
                        <TemplateCard title="Debug" desc="Every scene element placed for exploration." onClick={() => handleOpenTemplate('debug')} />
                    </div>
                </section>
            </div>
        </div>
    );
};
interface TemplateCardProps { title: string; desc: string; onClick: () => void; featured?: boolean }
const TemplateCard: React.FC<TemplateCardProps> = ({ title, desc, onClick, featured }) => (
    <button
        onClick={onClick}
        className={[
            'group relative flex flex-col items-start text-left p-5 rounded-lg border transition focus:outline-none focus:ring-2',
            'border-neutral-800 bg-neutral-900/60 hover:border-neutral-600 hover:bg-neutral-900 focus:ring-indigo-500',
            featured ? 'ring-2 ring-indigo-500/40 shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_0_25px_-5px_rgba(99,102,241,0.5)]' : ''
        ].join(' ')}>
        {featured && (
            <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full tracking-wide shadow">
                Start here!
            </span>
        )}
        <h3 className={`text-lg font-semibold mb-2 ${featured ? 'text-indigo-300 group-hover:text-indigo-200' : 'text-white group-hover:text-indigo-300'}`}>{title}</h3>
        <p className="text-sm text-neutral-400 leading-snug">{desc}</p>
        <span className={`mt-4 inline-flex items-center text-xs font-medium px-3 py-1 rounded tracking-wide uppercase ${featured ? 'bg-indigo-600/80 text-white group-hover:bg-indigo-500' : 'bg-neutral-800 text-neutral-300 group-hover:bg-indigo-600 group-hover:text-white'}`}>Open</span>
    </button>
);

export default HomePage;
