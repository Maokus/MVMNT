import React from 'react';
import '@app/App.css';
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
                        <h2>Contributing / Feedback</h2>
                        <p>
                            Contributions, ideas, and bug reports are welcome! Feel free to open issues or suggest enhancements on the discord.
                        </p>
                        <p>
                            Can't guarantee when I'll get to it though lol
                        </p>
                    </section>

                    <div className="about-actions" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                        <Link to="/" className="btn btn-primary">Return to App</Link>
                        <a
                            href='https://maok.us/discord'
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{
                                margin: '4px 0',
                                backgroundColor: '#5865F2', // Discord blurple
                                color: 'white',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: 600
                            }}
                            aria-label="Join the Discord server"
                        >
                            <svg width="18" height="18" viewBox="0 0 71 55" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path d="M60.1045 4.8978C55.5792 2.8214 50.7265 1.2916 45.6527 0.41542C45.5603 0.39851 45.468 0.440769 45.4204 0.525289C44.7963 1.6353 44.105 3.0834 43.6209 4.2216C38.1637 3.4046 32.7345 3.4046 27.3892 4.2216C26.905 3.0581 26.1886 1.6353 25.5617 0.525289C25.5141 0.443589 25.4218 0.40133 25.3294 0.41542C20.2586 1.288 15.4059 2.8178 10.8776 4.8978C10.8384 4.9147 10.8048 4.9429 10.7825 4.9795C1.57795 18.7309 -0.943561 32.1443 0.293408 45.3914C0.299005 45.4562 0.335386 45.5182 0.385761 45.5576C6.45866 50.0174 12.3413 52.7249 18.1147 54.5195C18.2071 54.5477 18.3051 54.5138 18.3638 54.4378C19.7295 52.5728 20.9469 50.6063 21.9907 48.5383C22.0523 48.4172 21.9936 48.2735 21.8676 48.2256C19.9366 47.4931 18.0979 46.6 16.3292 45.5858C16.1893 45.5041 16.1781 45.304 16.3068 45.2082C16.679 44.9293 17.0513 44.6391 17.4067 44.3461C17.471 44.2926 17.5606 44.2813 17.6362 44.3152C29.2558 49.6202 41.8354 49.6202 53.3179 44.3152C53.3935 44.2786 53.4831 44.2899 53.5502 44.3434C53.9057 44.6364 54.2779 44.9293 54.6529 45.2082C54.7816 45.304 54.7732 45.5041 54.6333 45.5858C52.8646 46.6197 51.0259 47.4931 49.0921 48.2229C48.9661 48.2708 48.9102 48.4172 48.9718 48.5383C50.038 50.6036 51.2554 52.5691 52.5959 54.434C52.6519 54.5127 52.7526 54.5465 52.845 54.5183C58.6464 52.7236 64.529 50.0161 70.6019 45.5576C70.6551 45.5182 70.6887 45.459 70.6943 45.3942C72.1747 30.0791 68.2147 16.7757 60.1968 4.9821C60.1772 4.9429 60.1437 4.9147 60.1045 4.8978ZM23.7259 37.3253C20.2276 37.3253 17.3451 34.1136 17.3451 30.1693C17.3451 26.225 20.1717 23.0133 23.7259 23.0133C27.308 23.0133 30.1626 26.2532 30.1068 30.1693C30.1068 34.1136 27.28 37.3253 23.7259 37.3253ZM47.3178 37.3253C43.8196 37.3253 40.9371 34.1136 40.9371 30.1693C40.9371 26.225 43.7636 23.0133 47.3178 23.0133C50.9 23.0133 53.7545 26.2532 53.6987 30.1693C53.6987 34.1136 50.9 37.3253 47.3178 37.3253Z" fill="white" />
                            </svg>
                            Join Discord
                        </a>
                        <a
                            href='https://github.com/Maokus/mvmnt'
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-secondary"
                            style={{
                                margin: '4px 0',
                                backgroundColor: '#24292f', // GitHub dark
                                color: 'white',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontWeight: 600
                            }}
                            aria-label="View project on GitHub"
                        >
                            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                <path fillRule="evenodd" clipRule="evenodd" d="M8 0C3.58 0 0 3.58 0 8C0 11.54 2.29 14.53 5.47 15.59C5.87 15.66 6.02 15.42 6.02 15.21C6.02 15.02 6.01 14.39 6.01 13.72C4 14.09 3.48 13.23 3.32 12.78C3.23 12.55 2.84 11.84 2.5 11.65C2.22 11.5 1.82 11.13 2.49 11.12C3.12 11.11 3.57 11.7 3.72 11.94C4.44 13.15 5.59 12.81 6.05 12.6C6.12 12.08 6.33 11.73 6.56 11.53C4.78 11.33 2.92 10.64 2.92 7.58C2.92 6.71 3.23 5.99 3.74 5.43C3.66 5.23 3.38 4.41 3.82 3.31C3.82 3.31 4.49 3.1 6.02 4.13C6.66 3.95 7.34 3.86 8.02 3.86C8.7 3.86 9.38 3.95 10.02 4.13C11.55 3.09 12.22 3.31 12.22 3.31C12.66 4.41 12.38 5.23 12.3 5.43C12.81 5.99 13.12 6.7 13.12 7.58C13.12 10.65 11.25 11.33 9.47 11.53C9.76 11.78 10.01 12.26 10.01 13.05C10.01 14.16 10 14.94 10 15.21C10 15.42 10.15 15.67 10.55 15.59C12.98 14.77 15 12.52 15 8C15 3.58 11.42 0 8 0Z" fill="white" />
                            </svg>
                            GitHub Repo
                        </a>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default AboutPage;
