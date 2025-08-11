// Modular Renderer - works with RenderObjects for clean separation of concerns
export class ModularRenderer {
    /**
     * Main render method - renders an array of RenderObjects
     * @param {CanvasRenderingContext2D} ctx - Canvas context
     * @param {Array} renderObjects - Array of RenderObject instances to render
     * @param {Object} config - Configuration object containing rendering settings
     * @param {number} currentTime - Current time for animation calculations
     */
    render(ctx, renderObjects, config, currentTime) {
        // Clear canvas first (should be done by background RenderObject, but this is a fallback)
        const first = renderObjects[0];
        const hasExplicitBg =
            first && typeof first.fillColor !== 'undefined' && first.fillColor === config.backgroundColor;
        if (!renderObjects.length || !hasExplicitBg) {
            this.clearCanvas(ctx, config.canvas.width, config.canvas.height, config.backgroundColor);
        }

        // Render all objects in order
        for (const renderObject of renderObjects) {
            if (renderObject && typeof renderObject.render === 'function') {
                renderObject.render(ctx, config, currentTime);
            }
        }
    }

    /**
     * Clear the canvas with the background color (fallback)
     */
    clearCanvas(ctx, width, height, backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
    }

    /**
     * Render frame for video generation
     */
    renderFrame(ctx, renderObjects, config, timestamp) {
        this.render(ctx, renderObjects, config, timestamp);
    }

    /**
     * Get frame data for video generation
     */
    getFrameData(canvas, renderObjects, config, timestamp, outputFormat = 'imageData') {
        // Create a temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Render frame
        this.render(tempCtx, renderObjects, { ...config, canvas: tempCanvas }, timestamp);

        // Get frame data
        let frameData;
        switch (outputFormat) {
            case 'imageData':
                frameData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                break;
            case 'dataURL':
                frameData = tempCanvas.toDataURL();
                break;
            case 'blob':
                frameData = new Promise((resolve) => {
                    tempCanvas.toBlob(resolve);
                });
                break;
            default:
                frameData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        }

        return frameData;
    }

    /**
     * Render frame sequence for video generation
     */
    renderFrameSequence(canvas, sceneBuilder, config, startTime, endTime, frameRate) {
        const frames = [];
        const frameDuration = 1 / frameRate;

        for (let time = startTime; time <= endTime; time += frameDuration) {
            // Create a new canvas for this frame
            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = canvas.width;
            frameCanvas.height = canvas.height;
            const frameCtx = frameCanvas.getContext('2d');

            // Build scene for this timestamp
            const renderObjects = sceneBuilder.buildScene({ ...config, canvas: frameCanvas }, time);

            // Render this frame
            this.render(frameCtx, renderObjects, { ...config, canvas: frameCanvas }, time);

            // Convert to data URL
            frames.push({
                time: time,
                dataURL: frameCanvas.toDataURL(),
            });
        }

        return frames;
    }
}
