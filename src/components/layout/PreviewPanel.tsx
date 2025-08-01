import React from 'react';

interface PreviewPanelProps {
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    isPlaying: boolean;
    onPlayPause: () => void;
    onStop: () => void;
    onStepForward: () => void;
    onStepBackward: () => void;
    currentTime: string;
    resolution: number;
}

const PreviewPanel: React.FC<PreviewPanelProps> = ({
    canvasRef,
    isPlaying,
    onPlayPause,
    onStop,
    onStepForward,
    onStepBackward,
    currentTime,
    resolution
}) => {
    return (
        <div className="preview-panel">
            <div className="canvas-container">
                <canvas
                    id='canvas'
                    ref={canvasRef}
                    width={resolution}
                    height={resolution}
                    style={{
                        maxWidth: '100%',
                        maxHeight: '100%',
                        aspectRatio: '1/1'
                    }}
                ></canvas>
            </div>

            <div className="playback-controls">
                <button className="btn btn-secondary" onClick={onStepBackward}>⏪</button>
                <button className="btn btn-primary" onClick={onPlayPause}>
                    {isPlaying ? '⏸️' : '▶️'}
                </button>
                <button className="btn btn-secondary" onClick={onStepForward}>⏩</button>
                <button className="btn btn-secondary" onClick={onStop}>⏹️</button>
                <span className="time-display">{currentTime}</span>
                <div className="progress-bar-container">
                    <div className="progress-bar-fill"></div>
                </div>
            </div>
        </div>
    );
};

export default PreviewPanel;
