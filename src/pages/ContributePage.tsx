import React from 'react';
import { Link } from 'react-router-dom';
import { FaPatreon, FaYoutube, FaXTwitter, FaDiscord, FaGithub, FaStar } from 'react-icons/fa6';
import kofi from '@assets/kofi.png';

const ContributePage: React.FC = () => {
    return (
        <div className="min-h-screen bg-neutral-800 text-neutral-200 px-6 py-10">
            <main className="max-w-3xl mx-auto">
                <div className="flex justify-between items-start mb-10">
                    <div>
                        <h1 className="text-4xl font-extrabold tracking-tight text-white">Contribute</h1>
                        <p className="mt-3 text-neutral-400 leading-relaxed max-w-2xl">
                            MVMNT is a passion project developed and hosted entirely at my own expense.
                            Your support keeps the app running, builds new features, and motivates continued development.
                        </p>
                    </div>
                    <Link to="/" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium shrink-0">Back to Home</Link>
                </div>

                <div className="space-y-8">

                    {/* Spread the word */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-1">Spread the word</h2>
                        <p className="text-neutral-400 text-sm mb-4">
                            The best way to support MVMNT is to make something cool and share it with others!!
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <a
                                href="https://github.com/Maokus/mvmnt"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium"
                            >
                                <FaGithub />
                                Star on GitHub
                            </a>
                            <a
                                href="https://youtube.com/@maokus"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium"
                            >
                                <FaYoutube className="text-[#FF0000]" />
                                Subscribe on YouTube
                            </a>
                            <a
                                href="https://x.com/maokaros"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium"
                            >
                                <FaXTwitter />
                                Follow on X
                            </a>
                            <a
                                href="https://maok.us/discord"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium"
                            >
                                <FaDiscord />
                                Join Discord
                            </a>
                        </div>
                    </section>

                    {/* Beta testing */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-1">Beta testing</h2>
                        <p className="text-neutral-400 text-sm mb-4">
                            Beta testers help catch bugs early and shape the direction of new features.
                            If you're interested in testing, drop me a dm on Discord.
                        </p>
                        <a
                            href="https://maok.us/discord"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium"
                        >
                            <FaDiscord />
                            Message on Discord
                        </a>
                    </section>

                    {/* Financial support */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-1">Financial support</h2>
                        <p className="text-neutral-400 text-sm mb-4">
                            Server costs, domain fees, and development time all add up. Financial contributions
                            go directly towards keeping the infrastructure online and making future development possible.
                        </p>
                        <div className="flex flex-wrap gap-3">
                            <a
                                href="https://patreon.com/maokus"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-[#F96854] hover:bg-[#F96854]/80 border border-neutral-700 text-sm font-medium"
                            >
                                <FaPatreon className="text-[#FFF]" />
                                Join Patreon
                            </a>
                            <a
                                href="https://ko-fi.com/maokus"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium"
                            >
                                <img src={kofi} alt="Ko-fi" style={{ width: '22px', height: '18px' }} />
                                Buy a Ko-fi
                            </a>
                        </div>
                    </section>

                    {/* Building Plugins */}
                    <section>
                        <h2 className="text-xl font-bold text-white mb-1">Building Plugins</h2>
                        <p className="text-neutral-400 text-sm mb-4">
                            It literally takes 15 minutes to build a plugin!! Please give it a try.
                        </p>
                        <a
                            href="https://github.com/Maokus/MVMNT/blob/main/docs/plugin-quickstart.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded bg-neutral-900 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium"
                        >
                            <FaGithub />
                            Read quickstart guide
                        </a>
                    </section>


                </div>

                <div className="mt-12">
                    <Link to="/" className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium">Back to Home</Link>
                </div>
            </main>
        </div>
    );
};

export default ContributePage;
