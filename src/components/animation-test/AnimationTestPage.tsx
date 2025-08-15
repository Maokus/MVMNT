import React, { useState, useMemo, useRef, useEffect } from 'react';
import easings from '@animation/easings';
import { ModularRenderer } from '../../core/render/modular-renderer';
import { createAnimationInstance, getAnimationSelectOptions } from '@animation/note-animations';
import type { AnimationPhase } from '@animation/note-animations';
import { NoteBlock } from '@core/scene/elements/time-unit-piano-roll/note-block';
import { RenderObject } from '@core/index';
import './animationTest.css';

interface PhaseConfig {
    name: string;
    duration: number; // ms
    easing: string;
}

// Repurpose the existing phase UI to represent an ADSR envelope for note animations
const defaultPhases: PhaseConfig[] = [
    { name: 'Attack', duration: 1000, easing: 'linear' },
    { name: 'Decay', duration: 1000, easing: 'linear' },
    { name: 'Sustain', duration: 1000, easing: 'linear' }, // visualized as static full value
    { name: 'Release', duration: 1000, easing: 'linear' }
];

const EASING_NAMES = Object.keys(easings);

const AnimationTestPage: React.FC = () => {
    const [phases, setPhases] = useState<PhaseConfig[]>(defaultPhases);
    const [playing, setPlaying] = useState(false);
    const [loop, setLoop] = useState(true);
    const [startTime, setStartTime] = useState<number | null>(null);
    const [localNow, setLocalNow] = useState(0);
    const [scrubTime, setScrubTime] = useState<number | null>(null);
    const [animationType, setAnimationType] = useState<string>('expand');
    // User adjustable note block + visual params
    const [blockNote, setBlockNote] = useState(60);
    const [blockVelocity, setBlockVelocity] = useState(90);
    const [blockChannel, setBlockChannel] = useState(0);
    const [blockDuration, setBlockDuration] = useState(1); // seconds (synthetic)
    const [blockWidth, setBlockWidth] = useState(180);
    const [blockHeight, setBlockHeight] = useState(40);
    const [blockColor, setBlockColor] = useState('#4af');
    const [canvasWidth, setCanvasWidth] = useState(360);
    const [canvasHeight, setCanvasHeight] = useState(140);

    // Modular Renderer setup for note animation preview
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rendererRef = useRef(new ModularRenderer());
    const animationInstanceRef = useRef<ReturnType<typeof createAnimationInstance> | null>(null);

    // (Re)create animation instance when type changes
    useEffect(() => {
        try {
            animationInstanceRef.current = createAnimationInstance(animationType);
        } catch (e) {
            animationInstanceRef.current = null;
        }
    }, [animationType]);

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

    // Derive ADSR timing for animation preview (seconds)
    const attackMs = phases.find(p => p.name.toLowerCase() === 'attack')?.duration ?? 0;
    const decayMs = phases.find(p => p.name.toLowerCase() === 'decay')?.duration ?? 0;
    const sustainMs = phases.find(p => p.name.toLowerCase() === 'sustain')?.duration ?? 0;
    const releaseMs = phases.find(p => p.name.toLowerCase() === 'release')?.duration ?? 0;

    const attackEnd = attackMs;
    const decayEnd = attackEnd + decayMs;
    const sustainEnd = decayEnd + sustainMs; // sustain occupies explicit duration in this sandbox
    const releaseEnd = sustainEnd + releaseMs;

    // Map effectiveTime (ms) to animation phase + normalized progress
    const ms = effectiveTime;
    let notePhase: AnimationPhase = 'static';
    let noteProgress = 0;
    if (ms < attackEnd && attackMs > 0) {
        notePhase = 'attack';
        noteProgress = attackMs ? ms / attackMs : 1;
    } else if (ms < decayEnd && decayMs > 0) {
        notePhase = 'decay';
        noteProgress = decayMs ? (ms - attackEnd) / decayMs : 1;
    } else if (ms < sustainEnd && sustainMs > 0) {
        notePhase = 'sustain';
        noteProgress = 1; // sustain treated as full
    } else if (ms < releaseEnd && releaseMs > 0) {
        notePhase = 'release';
        noteProgress = releaseMs ? (ms - sustainEnd) / releaseMs : 1;
    } else if (ms >= releaseEnd) {
        notePhase = 'release';
        noteProgress = 1;
    }

    // Render animated note preview via modular renderer
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = canvasWidth; // ensure backing store matches
        canvas.height = canvasHeight;
        const width = canvasWidth;
        const height = canvasHeight;
        ctx.clearRect(0, 0, width, height);
        const inst = animationInstanceRef.current;
        if (!inst) return;

        // Build a synthetic AnimationContext for a single note block
        const baseX = Math.max(0, (width - blockWidth) / 2);
        const baseY = Math.max(0, (height - blockHeight) / 2);
        const color = blockColor;
        const ro: RenderObject[] = inst.render({
            // @ts-expect-error minimal stub for block (only fields used by animations)
            block: {
                note: blockNote,
                velocity: blockVelocity,
                startTime: 0,
                endTime: blockDuration,
                duration: blockDuration,
                channel: blockChannel,
                // deterministic ids like real NoteBlock for seeded randomness
                baseNoteId: baseNoteIdRef.current,
                noteId: baseNoteIdRef.current,
            },
            x: baseX,
            y: baseY,
            width: blockWidth,
            height: blockHeight,
            color,
            progress: noteProgress,
            phase: notePhase,
            currentTime: ms / 1000,
        });

        const modularRenderer = rendererRef.current;
        modularRenderer.render(ctx as any, ro as any, {
            backgroundColor: '#000',
            canvas: { width, height },
        }, ms / 1000);
    }, [noteProgress, notePhase, animationType, effectiveTime, blockNote, blockVelocity, blockChannel, blockDuration, blockWidth, blockHeight, blockColor, canvasWidth, canvasHeight]);

    // Stable baseNoteId (and noteId) to mimic real NoteBlock identity so seeded RNG remains deterministic
    const baseNoteIdRef = useRef<string>('');
    const noteIdentityDeps = [blockNote, blockChannel, blockDuration, blockVelocity];
    useEffect(() => {
        baseNoteIdRef.current = NoteBlock.fastHashToHex(blockNote, blockChannel, 0, blockDuration, blockVelocity);
    }, noteIdentityDeps); // recompute when identity-affecting fields change

    return (
        <div className="animation-test-page" style={{ display: 'flex', flexDirection: 'column', padding: 16, gap: 16 }}>
            <div style={{ display: 'flex', gap: 24 }}>
                <div style={{ flex: 1 }}>
                    <h2>Phases</h2>
                    {phases.map((p, i) => (
                        <div key={i} className={"phase-card" + (i === currentPhaseIndex ? ' active' : '')}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input className="text-input" style={{ flex: 1 }} value={p.name} onChange={e => updatePhase(i, { name: e.target.value })} />
                                <button className="btn small" onClick={() => removePhase(i)} disabled={phases.length === 1}>x</button>
                            </div>
                            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                                <label className="field-label">Duration <input className="number-input" type="number" value={p.duration} onChange={e => updatePhase(i, { duration: Math.max(1, parseInt(e.target.value) || 0) })} style={{ width: 80 }} /></label>
                                <label className="field-label">Easing
                                    <select className="select-input" value={p.easing} onChange={e => updatePhase(i, { easing: e.target.value })}>
                                        {EASING_NAMES.map(n => <option key={n}>{n}</option>)}
                                    </select>
                                </label>
                            </div>
                        </div>
                    ))}
                    <div style={{ marginTop: 12 }}>
                        <label className="field-label" style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            Note Animation Type
                            <select className="select-input" value={animationType} onChange={e => setAnimationType(e.target.value)}>
                                {getAnimationSelectOptions().map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>
                <div style={{ flex: 2 }}>
                    <h2>Timeline</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn" onClick={() => { if (!playing) { setStartTime(performance.now() - effectiveTime); } setPlaying(p => !p); }}>{playing ? 'Pause' : 'Play'}</button>
                        <button className="btn" onClick={() => { setStartTime(performance.now()); setLocalNow(0); setPlaying(true); }}>Restart</button>
                        <button className="btn" onClick={() => stepPhase(-1)} title="Previous phase">◀︎ Phase</button>
                        <button className="btn" onClick={() => stepPhase(1)} title="Next phase">Phase ▶︎</button>
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
                    <h2>Note Animation Preview (Modular Renderer)</h2>
                    <div className="grid-inputs">
                        <label className="field-label">Canvas W
                            <input className="number-input" type="number" value={canvasWidth} onChange={e => setCanvasWidth(Math.max(50, parseInt(e.target.value) || 0))} />
                        </label>
                        <label className="field-label">Canvas H
                            <input className="number-input" type="number" value={canvasHeight} onChange={e => setCanvasHeight(Math.max(50, parseInt(e.target.value) || 0))} />
                        </label>
                        <label className="field-label">Block W
                            <input className="number-input" type="number" value={blockWidth} onChange={e => setBlockWidth(Math.max(1, parseInt(e.target.value) || 0))} />
                        </label>
                        <label className="field-label">Block H
                            <input className="number-input" type="number" value={blockHeight} onChange={e => setBlockHeight(Math.max(1, parseInt(e.target.value) || 0))} />
                        </label>
                        <label className="field-label">Color
                            <input className="color-input" type="color" value={blockColor} onChange={e => setBlockColor(e.target.value)} />
                        </label>
                        <label className="field-label">Note
                            <input className="number-input" type="number" value={blockNote} onChange={e => setBlockNote(Math.max(0, Math.min(127, parseInt(e.target.value) || 0)))} />
                        </label>
                        <label className="field-label">Velocity
                            <input className="number-input" type="number" value={blockVelocity} onChange={e => setBlockVelocity(Math.max(0, Math.min(127, parseInt(e.target.value) || 0)))} />
                        </label>
                        <label className="field-label">Channel
                            <input className="number-input" type="number" value={blockChannel} onChange={e => setBlockChannel(Math.max(0, Math.min(15, parseInt(e.target.value) || 0)))} />
                        </label>
                        <label className="field-label">Duration (s)
                            <input className="number-input" type="number" step="0.1" value={blockDuration} onChange={e => setBlockDuration(Math.max(0.01, parseFloat(e.target.value) || 0))} />
                        </label>
                    </div>
                    <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} style={{ width: canvasWidth, height: canvasHeight, border: '1px solid #555', background: '#000' }} />
                    <div style={{ fontSize: 12, marginTop: 4, color: '#ccc' }}>Phase: {notePhase} progress {noteProgress.toFixed(2)}</div>
                    <EasingCurve easingName={phase.easing} progress={rawProgress} />
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
