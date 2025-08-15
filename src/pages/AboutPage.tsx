import React from 'react';
import 'App.css';
import { Link } from 'react-router-dom';

/**
 * About / Getting Started page.
 * Reuses MenuBar + global styles for consistency.
 */
const AboutPage: React.FC = () => {
    return (
        <div className="app-container about-page-root">
            <main className="about-container">
                <div className="about-content">
                    <Link to="/" className="btn btn-primary" style={{ float: 'right' }}>Return to App</Link>
                    <h1>MVMNT v{((import.meta as any).env?.VITE_VERSION)}</h1>
                    <p className="lead" style={{ marginLeft: "20px" }}>
                        MVMNT (Pronounced movement) is a free and open-source MIDI Visualization tool by <a href='https://maok.us' target='_blank'>Maokus</a>.
                    </p>

                    <section>
                        <h2>Motivation</h2>
                        <p>Two months ago, I saw a <a target="_blank" href="https://x.com/Kashiwade_music/status/1931349155101982945">really beautiful MIDI visualizer</a> by kashiwade on twitter. I asked them how they made it, and this was the response: </p>
                        <img src='./assets/pain.png' width={400} style={{ margin: "auto", display: "block" }}></img>
                        <p style={{ textAlign: "center" }}><i>Figure 1: Why would you say this</i></p>
                        <p>The moment I saw that response I knew I had to make a decision. </p>
                        <ol style={{ marginLeft: "48px", paddingBottom: "12px" }}>
                            <li>Accept that Kashiwade doesn't want to share how they made the visualizer</li>
                            <li>Spend two spite-fuelled months of my life making a piece of freeware so I can make it myself</li>
                        </ol>
                        <p>The rest, as they say, is history.</p>
                    </section>

                    <section>
                        <h2>Getting Started</h2>
                        <ol className="getting-started-list">
                            <li><strong>Load a MIDI File</strong>: In the macros, click the "Load MIDI" button and select your file.</li>
                            <li><strong>Create / Edit Scene</strong>: Add scene elements (text, images, overlays) and adjust their properties in the right-hand panels.</li>
                            <li><strong>Arrange & Animate</strong>: Use macros / property bindings for dynamic changes or timing-based effects.</li>
                            <li><strong>Preview Playback</strong>: Use the transport controls below the canvas to scrub and preview synced visuals.</li>
                            <li><strong>Export</strong>: Trigger export to generate image frames or a compiled video; watch progress in the overlay.</li>
                        </ol>
                    </section>

                    <section>
                        <h2>Tips</h2>
                        <ul className="feature-list">
                            <li>Double–click the scene name in the menu bar to rename your scene.</li>
                            <li>Use the scene menu (⋯) to save / load / clear / create default scenes.</li>
                        </ul>
                    </section>

                    <section>
                        <h2>Customization</h2>
                        <p>
                            MVMNT has a modular design which can be easily extended with new features and functionality. If you're a developer, you can create your own custom elements, effects, and integrations.
                        </p>
                        <p>
                            If you have any questions or need assistance, feel free to reach out!
                        </p>

                    </section>

                    <section>
                        <h2>Contributing / Feedback</h2>
                        <p>
                            Contributions, ideas, and bug reports are welcome! Feel free to open issues or suggest enhancements on the discord.
                        </p>
                        <p>
                            Can't guarantee when I'll get to it though lol
                        </p>
                    </section>

                    <div className="about-actions">
                        <Link to="/" className="btn btn-primary">Return to App</Link>
                        <a href='https://maok.us/discord' className="btn btn-secondary" style={{ margin: '4px 12px' }}>Join the discord</a>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AboutPage;
