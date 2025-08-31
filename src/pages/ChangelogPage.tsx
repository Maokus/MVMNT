import React from 'react';
import '@app/App.css';
import { Link } from 'react-router-dom';

/**
 * Changelog / Updates page. Keep recent notable changes here.
 */
const ChangelogPage: React.FC = () => {
    return (
        <div className="app-container about-page-root">
            <main className="about-container">
                <div className="about-content">
                    <Link to="/" className="btn btn-primary" style={{ float: 'right' }}>Return to App</Link>
                    <h1>Changelog</h1>
                    <p className="lead" style={{ marginLeft: '20px' }}>
                        Recent updates and feature changes for MVMNT v{((import.meta as any).env?.VITE_VERSION)}.
                    </p>

                    <section>
                        <h2>Unreleased / In Progress</h2>
                        <ul className="feature-list">
                            <li>Ctrl z functionality (sorry lol this is actually really hard)</li>
                            <li>Decrease memory consumption leading to crashes/file handling issues (please report if this occurs so I know how widespread it is)</li>
                        </ul>
                    </section>

                    <section>
                        <div style={{ marginBottom: "8px" }}>
                            <h2 style={{ marginBottom: "-3px" }}>v0.11.5</h2>
                            <i>24-08-31</i>
                        </div>
                        <ul className='feature-list'>
                            <li>Added chord estimation element</li>
                            <li>Added played notes tracker element</li>
                            <li>Added playing notes display element</li>
                        </ul>
                    </section>

                    <section>
                        <div style={{ marginBottom: "8px" }}>
                            <h2 style={{ marginBottom: "-3px" }}>v0.11.4</h2>
                            <i>24-08-31</i>
                        </div>
                        <ul className='feature-list'>
                            <li>Changed bounding box handling logic (Created includeInLayoutBounds flag to reduce layout jitter)</li>
                            <li>Cleaned up some renderObject logic</li>

                        </ul>
                    </section>

                    <section>
                        <div style={{ marginBottom: "8px" }}>
                            <h2 style={{ marginBottom: "-3px" }}>v0.11.3</h2>
                            <i>24-08-25</i>
                        </div>
                        <ul className='feature-list'>
                            <li>Added Moving Notes Piano Roll</li>
                            <li>Fixed piano not rendering</li>
                            <li>Some UI Tidy up</li>

                        </ul>
                    </section>
                    <section>
                        <div style={{ marginBottom: "8px" }}>
                            <h2 style={{ marginBottom: "-3px" }}>v0.11.2</h2>
                            <i>17-08-25</i>
                        </div>
                        <ul className='feature-list'>
                            <li>Added gif support</li>
                            <li>Fixed save/load z index functionality</li>
                            <li>Moved image load logic to a separate module.</li>

                        </ul>
                    </section>
                    <section>
                        <div style={{ marginBottom: "8px" }}>
                            <h2 style={{ marginBottom: "-3px" }}>v0.11.1</h2>
                            <i>16-08-25</i>
                        </div>
                        <ul className="feature-list">
                            <li>Bugfixes (properties now actually show u properties. lol)</li>
                            <li>Onboarding</li>
                            <li>SOURCE!!!! THE SOURCE IS OPEN!! GO HACK IT (its in the about page)</li>
                            <li>NICE BUTTON WITH LOGO</li>
                            <li>spacebar now starts playback as expected, corner cases handled properly</li>
                            <li>opengraph</li>
                        </ul>
                    </section>
                    <section>
                        <div style={{ marginBottom: "8px" }}>
                            <h2 style={{ marginBottom: "-3px" }}>v0.11.0</h2>
                            <i>I forgot lol</i>
                        </div>
                        <ul className="feature-list">
                            <li>Initial beta release</li>
                        </ul>
                    </section>
                </div>
            </main>
        </div>
    );
};

export default ChangelogPage;
