import React from 'react';
// Using Tailwind component classes defined in tailwind.css
import { Link } from 'react-router-dom';
import "./aboutpage.css"
import pain from '@assets/pain.png'
import senile from '@assets/senile.png'

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
                        <h1 className="text-4xl font-extrabold tracking-tight text-white">MVMNT <span className="text-indigo-400">v{((import.meta as any).env?.VITE_VERSION)}</span></h1>
                        <p className=" text-neutral-400 leading-relaxed max-w-2xl text-sm">Music Visualization & Motion eNgineering Tools</p>
                        <p className="mt-3 text-neutral-400 leading-relaxed max-w-2xl">MVMNT (pronounced movement) is a free, open-source MIDI visualization & rendering tool by <a className="text-indigo-300 hover:text-indigo-200 underline" href='https://maok.us' target='_blank'>Maokus</a>. </p>
                    </div>
                    <Link to="/" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">Back to Home</Link>
                </div>

                <div className="about-body">
                    <div className="acknowledgements-boxes">
                        <section>
                            <h3>Inspirations</h3>
                            <ul>
                                <li><a href="https://x.com/Kashiwade_music/status/1931349155101982945" target="_blank">Kashiwade's</a> custom midi visualiser inspired this whole project!</li>
                                <li><a href="https://x.com/vanilagy" target="_blank">Vanilagy</a> made Mediabunny which powers the rendering system!!!!</li>
                            </ul>
                        </section>
                        <section>
                            <h3>Beta testers</h3>
                            <ul>
                                <li><a href="https://www.youtube.com/sunnexo" target="_blank">Sunnexo</a></li>
                                <li><a href="https://www.youtube.com/@djebrayass" target="_blank">Djeb</a></li>
                                <li><a href="https://www.youtube.com/@2L3L" target="_blank">2L&L</a></li>
                                <li>Weivblank</li>
                                <li>Tnky</li>
                            </ul>
                        </section>
                        <section>
                            <h3>Supporters</h3>
                            <ul>
                                <li>wolfboy_777</li>
                                <li>geniway</li>
                            </ul>
                        </section>
                    </div>
                    <br />
                    <h2>Motivation</h2>
                    <p>MVMNT aims to fill the void of powerful, general-purpose tools for visualising MIDI data.
                        It aims to be user-friendly for beginners while also providing a flexible platform for advanced users.</p>
                    <br />
                    <div className="flex flex-wrap gap-3 mt-5">
                        <Link to="/" className="px-4 py-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium">Back to Home</Link>
                        <Link to="/contribute" className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-medium">Ways to Contribute</Link>
                    </div>
                </div>

            </main>
        </div>
    );
};

export default AboutPage;
