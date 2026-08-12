import React from 'react';
// Using Tailwind component classes defined in tailwind.css
import { Link } from 'react-router-dom';
import './aboutpage.css';
import { BUILD_INFO } from '@app/build-info';

const channelLabels = {
    development: 'Development',
    nightly: 'Nightly',
    stable: 'Stable',
} as const;

function updatePolicy(): string {
    if (BUILD_INFO.channel === 'development') return 'Development build — update checks disabled.';
    if (BUILD_INFO.channel === 'nightly') return 'Testing build — install newer testing artifacts manually.';
    return 'Stable build — checks GitHub for new releases; updates are downloaded manually.';
}

/**
 * About / Getting Started page.
 * Reuses MenuBar + global styles for consistency.
 */
const AboutPage: React.FC = () => {
    return (
        <div className="min-h-screen bg-neutral-800 text-neutral-200 px-6 py-10">
            <main className="max-w-5xl mx-auto">
                <div className="flex justify-between items-start mb-10">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white">
                            MVMNT <span className="text-indigo-400">v{BUILD_INFO.displayVersion}</span>
                        </h1>
                        <p className=" text-neutral-400 leading-relaxed max-w-2xl text-sm">
                            Music Visualization & Motion eNgineering Tools
                        </p>
                        <p className="mt-3 text-neutral-400 leading-relaxed max-w-2xl">
                            MVMNT (pronounced movement) is a free, open-source MIDI visualization & rendering tool by{' '}
                            <a
                                className="text-indigo-300 hover:text-indigo-200 underline"
                                href="https://maok.us"
                                target="_blank"
                            >
                                Maokus
                            </a>
                            .{' '}
                        </p>
                    </div>
                    <Link to="/" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">
                        Back to Home
                    </Link>
                </div>

                <div className="about-body">
                    <section className="mb-8 rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
                        <h2 className="mb-3 text-lg font-semibold text-white">Build information</h2>
                        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
                            <dt className="text-neutral-500">Version</dt>
                            <dd>{BUILD_INFO.displayVersion}</dd>
                            <dt className="text-neutral-500">Channel</dt>
                            <dd>{channelLabels[BUILD_INFO.channel]}</dd>
                            <dt className="text-neutral-500">Commit</dt>
                            <dd className="font-mono">{BUILD_INFO.commit}</dd>
                            <dt className="text-neutral-500">Build date</dt>
                            <dd>
                                <time dateTime={BUILD_INFO.builtAt}>{BUILD_INFO.builtAt}</time>
                            </dd>
                        </dl>
                        <p className="mt-3 text-sm text-neutral-400">{updatePolicy()}</p>
                    </section>
                    <div className="acknowledgements-boxes">
                        <section>
                            <h3>Inspirations</h3>
                            <ul>
                                <li>
                                    <a href="https://x.com/Kashiwade_music/status/1931349155101982945" target="_blank">
                                        Kashiwade's
                                    </a>{' '}
                                    custom midi visualiser inspired this whole project!
                                </li>
                                <li>
                                    <a href="https://x.com/vanilagy" target="_blank">
                                        Vanilagy
                                    </a>{' '}
                                    made Mediabunny which powers the rendering system!!!!
                                </li>
                            </ul>
                        </section>
                        <section>
                            <h3>Beta testers</h3>
                            <ul>
                                <li>
                                    <a href="https://www.youtube.com/sunnexo" target="_blank">
                                        Sunnexo
                                    </a>
                                </li>
                                <li>
                                    <a href="https://www.youtube.com/@djebrayass" target="_blank">
                                        Djeb
                                    </a>
                                </li>
                                <li>
                                    <a href="https://www.youtube.com/@2L3L" target="_blank">
                                        2L&L
                                    </a>
                                </li>
                                <li>Weivblank</li>
                                <li>Tnky</li>
                                <li>ivlayz</li>
                                <li>joserizzal</li>
                            </ul>
                        </section>
                        <section>
                            <h3>Supporters</h3>
                            <ul>
                                <li>wolfboy_777</li>
                                <li>geniway</li>
                                <li>gbl08ma</li>
                                <li>djickson</li>
                            </ul>
                        </section>
                    </div>
                    <br />
                    <h2>Motivation</h2>
                    <p>
                        MVMNT aims to fill the void of powerful, general-purpose tools for visualising music
                        information. It aims to be user-friendly for beginners while also providing a flexible platform
                        for advanced users.
                    </p>
                    <br />
                    <div className="flex flex-wrap gap-3 mt-5">
                        <Link
                            to="/"
                            className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium"
                        >
                            Back to Home
                        </Link>
                        <Link
                            to="/contribute"
                            className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-medium"
                        >
                            Ways to Contribute
                        </Link>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AboutPage;
