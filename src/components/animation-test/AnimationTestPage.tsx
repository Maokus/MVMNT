import React, { useState, useMemo } from 'react';
import easings from '../../visualizer/utils/easings';

interface PhaseConfig {
    name: string;
    duration: number; // ms
    easing: string;
}

const defaultPhases: PhaseConfig[] = [
    { name: 'Intro', duration: 500, easing: 'easeOutCubic' },
    { name: 'Middle', duration: 1000, easing: 'linear' },
    { name: 'Outro', duration: 500, easing: 'easeInCubic' }
];

const EASING_NAMES = Object.keys(easings);

const AnimationTestPage: React.FC = () => {
    const [phases, setPhases] = useState<PhaseConfig[]>(defaultPhases);
    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(true);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [localNow, setLocalNow] = useState(0);
    const [scrubTime, setScrubTime] = useState<number | null>(null);

    // total duration
    const total = useMemo(() => phases.reduce((a, p) => a + p.duration, 0), [phases]);

    React.useEffect(() => {
        if (!playing) return;
        let frame: number;
        const tick = (t: number) => {
            if (startTime == null) setStartTime(t);
            const base = startTime ?? t;
            let elapsed = t - base;
            if (elapsed > total) {
                if (loop) {
                    setStartTime(t);
                    elapsed = 0;
                } else {
                    elapsed = total;
                    setPlaying(false);
                }
            }
            setLocalNow(elapsed);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing, startTime, total, loop]);

    const effectiveTime = scrubTime != null ? scrubTime : localNow;

    // compute phase progress
    let acc = 0;
    let currentPhaseIndex = phases.length - 1;
    for (let i = 0; i < phases.length; i++) {
        if (effectiveTime < acc + phases[i].duration) { currentPhaseIndex = i; break; }
        acc += phases[i].duration;
    }
    const phase = phases[currentPhaseIndex];
    const phaseElapsed = Math.min(phase.duration, Math.max(0, effectiveTime - acc));
    const rawProgress = phaseElapsed / phase.duration;
    const easingFn = easings[phase.easing] || ((x: number) => x);
    const eased = easingFn(rawProgress);

    const addPhase = () => {
        setPhases(p => [...p, { name: `Phase ${p.length + 1}`, duration: 500, easing: 'linear' }]);
    };
    const updatePhase = (i: number, patch: Partial<PhaseConfig>) => setPhases(ps => ps.map((p, idx) => idx === i ? { ...p, ...patch } : p));
    const removePhase = (i: number) => setPhases(ps => ps.filter((_, idx) => idx !== i));

    const handleScrub = (v: number) => {
        setScrubTime(v);
        setLocalNow(v);
    };

    const commitScrub = () => {
        if (scrubTime != null) {
            setStartTime(performance.now() - scrubTime);
        }
        setScrubTime(null);
    };

    const stepPhase = (dir: 1 | -1) => {
        // move to start of next/prev phase
        let accum = 0;
        for (let i = 0; i < phases.length; i++) {
            const end = accum + phases[i].duration;
            if (effectiveTime < end + 0.5) { // found current
                let targetIndex = i + dir;
                if (targetIndex < 0) targetIndex = 0;
                if (targetIndex >= phases.length) targetIndex = phases.length - 1;
                const newTime = phases.slice(0, targetIndex).reduce((a, p) => a + p.duration, 0);
                handleScrub(newTime);
                commitScrub();
                break;
            }
            accum = end;
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', padding: 16, gap: 16, fontFamily: 'sans-serif' }}>
            <h1>Animation Test</h1>
            <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                    <h2>Phases</h2>
                    {phases.map((p, i) => (
                        <div key={i} style={{ border: '1px solid #555', padding: 8, marginBottom: 8, background: i === currentPhaseIndex ? '#223' : '#111', color: '#eee' }}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input style={{ flex: 1 }} value={p.name} onChange={e => updatePhase(i, { name: e.target.value })} />
                                <button onClick={() => removePhase(i)} disabled={phases.length === 1}>x</button>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                <label style={{ fontSize: 12 }}>Duration <input type="number" value={p.duration} onChange={e => updatePhase(i, { duration: Math.max(1, parseInt(e.target.value) || 0) })} style={{ width: 80 }} /></label>
                                <label style={{ fontSize: 12 }}>Easing
                                    <select value={p.easing} onChange={e => updatePhase(i, { easing: e.target.value })}>
                                        {EASING_NAMES.map(n => <option key={n}>{n}</option>)}
                                    </select>
                                </label>
                            </div>
                        </div>
                    ))}
                    <button onClick={addPhase}>Add Phase</button>
                </div>
                <div style={{ flex: 2 }}>
                    <h2>Timeline</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => { if (!playing) { setStartTime(performance.now() - effectiveTime); } setPlaying(p => !p); }}>{playing ? 'Pause' : 'Play'}</button>
                        <button onClick={() => { setStartTime(performance.now()); setLocalNow(0); setPlaying(true); }}>Restart</button>
                        <button onClick={() => stepPhase(-1)} title="Previous phase">◀︎ Phase</button>
                        <button onClick={() => stepPhase(1)} title="Next phase">Phase ▶︎</button>
                        <label style={{ fontSize: 12 }}><input type="checkbox" checked={loop} onChange={e => setLoop(e.target.checked)} /> Loop</label>
                        <div style={{ fontSize: 12 }}>t = {Math.round(effectiveTime)} ms / {total} ms</div>
                        <div style={{ fontSize: 12 }}>Phase: {phase.name} ({currentPhaseIndex + 1}/{phases.length})</div>
                        <div style={{ fontSize: 12 }}>Phase progress raw {rawProgress.toFixed(3)} eased {eased.toFixed(3)}</div>
                    </div>
                    <input type="range" min={0} max={total} value={effectiveTime} onChange={e => handleScrub(parseInt(e.target.value))} onMouseUp={commitScrub} onTouchEnd={commitScrub} style={{ width: '100%' }} />
                    <div style={{ position: 'relative', height: 40, border: '1px solid #444', background: '#181818', marginTop: 8 }}>
                        {phases.reduce<{ start: number, el: React.ReactElement }[]>((accum, p, i) => {
                            const start = accum.length ? accum[accum.length - 1].start + phases[i - 1].duration : 0;
                            const width = (p.duration / total) * 100;
                            const active = i === currentPhaseIndex;
                            accum.push({ start, el: <div key={i} style={{ position: 'absolute', left: `${(start / total) * 100}%`, top: 0, bottom: 0, width: `${width}%`, background: active ? '#3477ff' : '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{p.name}</div> });
                            return accum;
                        }, []).map(o => o.el)}
                        <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: '#fff', left: `${(effectiveTime / total) * 100}%` }} />
                    </div>
                    <h2 style={{ marginTop: 24 }}>Preview</h2>
                    <div style={{ width: 300, height: 200, border: '1px solid #555', position: 'relative', background: '#000', overflow: 'hidden' }}>
                        {/* Example preview: a box scaling & moving through phases */}
                        <BoxPreview phases={phases} time={effectiveTime} total={total} />
                    </div>
                    <EasingCurve easingName={phase.easing} progress={rawProgress} />
                </div>
                <div style={{ flex: 1 }}>
                    <h2>Utilities</h2>
                    <ul style={{ fontSize: 12, lineHeight: 1.4 }}>
                        <li>Scrub with slider to inspect easing curve at any time.</li>
                        <li>Add/remove phases and change easings live.</li>
                        <li>Loop or single run.</li>
                        <li>Use as a sandbox to prototype animation phase parameters.</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

const BoxPreview: React.FC<{ phases: PhaseConfig[]; time: number; total: number; }> = ({ phases, time, total }) => {
    // Derive a normalized 0..1 master progress and compute a compound transform
    const p = total ? Math.min(1, Math.max(0, time / total)) : 0;
    // We'll map phases to some arbitrary properties for visual feedback.
    let scale = 1;
    let x = 0;
    let rotation = 0;
    let acc = 0;
    phases.forEach(ph => {
        const start = acc;
        const end = acc + ph.duration;
        const localRaw = time <= start ? 0 : time >= end ? 1 : (time - start) / ph.duration;
        const eased = (easings[ph.easing] || ((x: number) => x))(localRaw);
        // Compose: scale oscillates, x moves, rotation spins in last phase
        scale += eased * 0.2;
        x += eased * 40 / phases.length;
        rotation += eased * (ph === phases[phases.length - 1] ? 360 : 45 / phases.length);
        acc = end;
    });
    return <div style={{ position: 'absolute', width: 50, height: 50, background: '#4af', left: '50%', top: '50%', transform: `translate(-50%, -50%) translateX(${x}px) scale(${scale.toFixed(3)}) rotate(${rotation.toFixed(1)}deg)`, borderRadius: 8, boxShadow: '0 0 12px #4af8' }} />
};

const EasingCurve: React.FC<{ easingName: string; progress: number; }> = ({ easingName, progress }) => {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width = 300;
        const h = canvas.height = 120;
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h - 0.5);
        ctx.lineTo(w, h - 0.5);
        ctx.stroke();
        const fn = (easings as any)[easingName] || ((x: number) => x);
        ctx.strokeStyle = '#4af';
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
            const x = i / 100;
            const y = fn(x);
            const px = x * w;
            const py = h - y * h;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        // progress marker
        ctx.strokeStyle = '#fff';
        ctx.beginPath();
        const pmx = progress * w;
        ctx.moveTo(pmx, 0);
        ctx.lineTo(pmx, h);
        ctx.stroke();
    }, [easingName, progress]);
    return (
        <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, marginBottom: 4 }}>Easing curve: {easingName}</div>
            <canvas ref={canvasRef} style={{ width: 300, height: 120, background: '#111', border: '1px solid #333' }} />
        </div>
    );
};

export default AnimationTestPage;
