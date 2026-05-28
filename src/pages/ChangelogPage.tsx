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
                    <Link to="/" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">Back to Home</Link>
                </div>

                <div className="space-y-10">

                    <ChangelogEntry version="0.15.1" date="15-5-28" notes={[
                        "Bugfixes", [
                            "Fixed a bug where japanese characters broke save/load system",

                        ]
                    ]}

                    <ChangelogEntry version="0.15.0" date="15-5-27" notes={[
                        "AUTOMATION.",
                        [
                            "Full automation editor with easing & custom beziers.",
                            "Tempo automation (finally!)",
                            "Blender-like autokey",
                            "Press I on properky to keyframe, or in preview to open keyframe menu (try typing: x, y, sx, sy, r, t)"
                        ],
                        "Community page",
                        [
                            "Explore, install and share plugins in one place!",
                            "Search and filter by tags (only admins can make tags for now)",
                            "I'm not going to talk about the boring authentication and database stuff but its there",
                        ],
                        "Builtin content improvements",
                        [
                            "New note animations",
                            "Basic shapes element, MIDI CC monitor",
                            "Notes Playing Display given two new display modes inspired by tn-shi and ableton push respectively",
                            "Stabilise layout bounds",
                            "Implemented musicpy-like algo for Chord Estimate Display",
                            "Rework audio reactive elements for accuracy and flexibility",
                            "Notes played tracker is formattable now"
                        ],
                        "Custom element system",
                        [
                            "Implemented API (Data access, helpers, asset management, etc)",
                            "Wrote documentation and quickstart guides. Shouldn't take more than 15 minutes to make a simple element.",
                            "Added helper scripts for templates and compilation",
                            "Version conflict management (elements specify compatible API versions, and the host will load the closest match available)",
                        ],
                        "General UX",
                        [
                            "Many, many changes but I'll only put the bigger ones here",
                            "Browser, indexeddb based saving (no more infinite downloaded copies!)",
                            "Implemented property tabs for better organisation of complex elements",
                            "Remember opened property groups",
                            "Edit metadata in export modal",
                            "Make builtin element property taxonomy more consistent",
                            "Remove easy mode",
                            "Rework selection system for predictability (delete works as expected! wow!)",
                            "Added multiline string prop",
                        ],
                        "Timeline UX",
                        [
                            "The timeline panel alone has over 7k lines of code now. I hate it.",
                            "Improved timeline navigation (scroll in peace!)",
                            "Navigation shortcuts (shift 1, shift 2, +, -, arrows, ...)",
                            "Adaptive snapping based on zoom (S to toggle)",
                        ],
                        "Render Object improvements",
                        [
                            "Support for blend modes, filters and layers",
                            "Improved glow logic (offscreen rendering, separate glow pass to avoid per-shape compositing artifacts)",
                            "Implemented origin calculations for more intuitive rotation and scaling",
                        ],
                        "Image and asset management",
                        [
                            "Explicit lifecycle management",
                            "Drag and drop image creation",
                            "Support for sparrow atlases (like FNF!)",
                            "Generalised image render object to VisualMedia for better flexibility and atlas support",
                        ],
                        "Internals",
                        [
                            "Reduced compute load of MIDI Preview",
                            "Allow elements to access raw audio data",
                        ]
                    ]} />

                    <ChangelogEntry version="0.14.0" date="20-1-26" notes={[
                        'Implemented audio feature extraction and analysis',
                        'Added audio elements (volume meter, oscilloscope, spectrum analyzer)',
                        'Overhauled properties system for improved UX and template compatibility',
                        'Improved responsiveness through lazy loading and user indicators',
                        'Added new templates',
                        'Improved chord estimation controls',
                        'Improved color selection with picker and alpha support',
                        'Bugfixes (weird midi parser issues, negative offsets, scroll desync)',
                    ]} />

                    <ChangelogEntry version="0.13.0" date="05-10-25" notes={[
                        'Added audio track support: playback, export, mixing',
                        'Added custom font upload manager in scene settings',
                        'Various UI/UX improvements',
                        'Added video codec selection (AVC, VP8, VP9, AV1, HEVC, etc)',
                        'Reworked entire document store system for improved reliability and modularity',
                        'Allowed panel dragging and resizing',
                        'Added easy mode',
                        'Midi track visual aid',
                        'Save files now embed audio and midi data, and compress to radically reduce file sizes.'
                    ]} />
                    <ChangelogEntry version="0.12.1" date="19-09-25" notes={[
                        'Improved undo stack reliability and snapshot creation',
                        'fixed various minor ui/ux issues (scrolling disabled, unreliable ',
                        'Developed ptsd from trying to improve the ctrl z feature',
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

const ChangelogEntry: React.FC<{ version: string; date: string; notes: (string | string[])[]; }> = ({ version, date, notes }) => (
    <section className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800">
        <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">v{version}</h2>
            <span className="text-xs text-neutral-500 font-mono">{date}</span>
        </div>
        <ul className="list-disc list-inside space-y-1 text-sm text-neutral-300">
            {notes.map((n, i) =>
                Array.isArray(n)
                    ? <ul key={i} className="list-disc list-inside space-y-1 ml-5 mt-1">
                        {n.map(sub => <li key={sub}>{sub}</li>)}
                    </ul>
                    : <li key={n}>{n}</li>
            )}
        </ul>
    </section>
);

export default ChangelogPage;
