import React from 'react';
// Using Tailwind component classes defined in tailwind.css
import { Link } from 'react-router-dom';

/**
 * Changelog / Updates page. Keep recent notable changes here.
 */
const ChangelogPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-neutral-800 text-neutral-200 px-6 py-10">
            <main className="max-w-4xl mx-auto">
                <div className="flex justify-between items-start mb-10">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white">Changelog</h1>
                        <p className="mt-3 text-neutral-400 text-sm">Recent updates for MVMNT v{((import.meta as any).env?.VITE_VERSION)}.</p>
                    </div>
                    <Link to="/workspace" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">Back to Workspace</Link>
                </div>

                <div className="space-y-10">
                    <section className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800">
                        <h2 className="text-xl font-semibold mb-3 text-white">Unreleased / In Progress</h2>
                        <ul className="list-disc list-inside space-y-1 text-sm text-neutral-300">
                            <li>Video?</li>
                            <li>Tracker style text elements</li>
                        </ul>
                    </section>

                    <ChangelogEntry version="0.13.0" date="19-09-25" notes={[
                        'Added audio track support: playback, export, mixing',
                        'Various ui/ux improvments',
                        'Added video codec selection (avc, vp8, vp9, av1, hevc, etc)',
                    ]} />
                    <ChangelogEntry version="0.12.1" date="19-09-25" notes={[
                        'Improved undo stack reliability and snapshot creation',
                        'fixed various minor ui/ux issues (scrolling disabled, unreliable ',
                        'Developed trauma from trying to improve the ctrl z feature',
                    ]} />

                    <ChangelogEntry version="0.12.0" date="12-09-25" notes={[
                        'Overhauled timing & MIDI system (timeline panel, better arrangement)',
                        'Improved save/load format',
                        'Added the legendary ctrl z',
                        'Added homepage, improved styling',
                        'Migrated to MediaBunny for faster exports & responsiveness',
                        'Partial migration to Zustand (more responsive UI)',
                        'TailwindCSS adoption for consistency & dev speed'
                    ]} />
                    <ChangelogEntry version="0.11.5" date="24-08-25" notes={[
                        'Added chord estimation element',
                        'Added played notes tracker element',
                        'Added playing notes display element'
                    ]} />
                    <ChangelogEntry version="0.11.4" date="24-08-25" notes={[
                        'Changed bounding box handling logic (includeInLayoutBounds flag)',
                        'Cleaned up some renderObject logic'
                    ]} />
                    <ChangelogEntry version="0.11.3" date="24-08-25" notes={[
                        'Added Moving Notes Piano Roll',
                        'Fixed piano not rendering',
                        'General UI tidy-up'
                    ]} />
                    <ChangelogEntry version="0.11.2" date="17-08-25" notes={[
                        'Added GIF support',
                        'Fixed save/load z-index functionality',
                        'Refactored image load logic'
                    ]} />
                    <ChangelogEntry version="0.11.1" date="16-08-25" notes={[
                        'Bugfixes (properties panel actually shows properties)',
                        'Onboarding overlay',
                        'Source opened publicly',
                        'UI improvements (logo button)',
                        'Spacebar playback control corner cases handled',
                        'OpenGraph meta'
                    ]} />
                    <ChangelogEntry version="0.11.0" date="—" notes={['Initial beta release']} />
                </div>
            </main>
        </div>
    );
};

const ChangelogEntry: React.FC<{ version: string; date: string; notes: string[]; }> = ({ version, date, notes }) => (
    <section className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800">
        <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">v{version}</h2>
            <span className="text-xs text-neutral-500 font-mono">{date}</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-sm text-neutral-300">
            {notes.map(n => <li key={n}>{n}</li>)}
        </ul>
    </section>
);

export default ChangelogPage;
