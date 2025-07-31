// Image Sequence Generator Module
// Generates PNG image sequences instead of video files

interface ImageBlobData {
  blob: Blob;
  frameNumber: number;
  filename: string;
}

interface GenerationMetadata {
  sceneName: string;
  totalFrames: number;
  format: string;
  generatedAt: string;
  software: string;
}

interface GenerateSequenceOptions {
  fps?: number;
  width?: number;
  height?: number;
  sceneName?: string;
  maxFrames?: number | null;
  onProgress?: (progress: number, text?: string) => void;
  onComplete?: (blob: Blob) => void;
}

// Type for JSZip global
declare global {
  interface Window {
    JSZip: any;
  }
}

export class ImageSequenceGenerator {
  private canvas: HTMLCanvasElement;
  private visualizer: any; // Keep as any for now since visualizer is still JS
  private isGenerating: boolean = false;
  private imageBlobs: ImageBlobData[] = [];

  constructor(canvas: HTMLCanvasElement, visualizer: any) {
    this.canvas = canvas;
    this.visualizer = visualizer;
  }

  async generateImageSequence(options: GenerateSequenceOptions = {}): Promise<void> {
    const {
      fps = 30,
      width = 1500,
      height = 1500,
      sceneName = 'My Scene',
      maxFrames = null, // null = unlimited (full duration)
      onProgress = () => { },
      onComplete = () => { }
    } = options;

    if (this.isGenerating) {
      throw new Error('Image sequence generation already in progress');
    }

    // Store original canvas dimensions at the start
    const originalWidth = this.canvas.width;
    const originalHeight = this.canvas.height;

    this.isGenerating = true;
    this.imageBlobs = [];

    try {
      // Resize canvas to target resolution
      this.canvas.width = width;
      this.canvas.height = height;
      this.visualizer.resize(width, height);

      const duration = this.visualizer.getDuration();
      const totalFrames = Math.ceil(duration * fps);

      // Get maximum frames from options, default to unlimited (full duration)
      const actualMaxFrames = maxFrames || totalFrames;
      const limitedFrames = Math.min(totalFrames, actualMaxFrames);

      if (totalFrames > actualMaxFrames && actualMaxFrames !== totalFrames) {
        console.warn(`Limiting frames from ${totalFrames} to ${limitedFrames} based on maxFrames setting`);
      }

      console.log(`Starting image sequence generation: ${limitedFrames} frames at ${fps}fps (${(limitedFrames / fps).toFixed(2)}s)`);
      console.log(`Resolution: ${width}x${height}`);

      onProgress(0);

      // Step 1: Render all frames to PNG images (80% of progress)
      console.log('Phase 1: Rendering frames to PNG images...');
      await this.renderFramesToPNG(duration, fps, limitedFrames, onProgress);

      // Step 2: Create ZIP file with all images (20% of progress)
      console.log('Phase 2: Creating ZIP file...');
      const zipBlob = await this.createZipFile(sceneName, onProgress);

      // Step 3: Download the ZIP
      this.downloadImageSequence(zipBlob, `${sceneName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_sequence.zip`);

      // Restore original canvas size
      this.canvas.width = originalWidth;
      this.canvas.height = originalHeight;
      this.visualizer.resize(originalWidth, originalHeight);

      onComplete(zipBlob);
      this.isGenerating = false;
      this.imageBlobs = []; // Clear memory

    } catch (error) {
      this.isGenerating = false;
      this.imageBlobs = []; // Clear memory
      // Restore original canvas size on error
      this.canvas.width = originalWidth;
      this.canvas.height = originalHeight;
      this.visualizer.resize(originalWidth, originalHeight);
      throw error;
    }
  }

  private async renderFramesToPNG(duration: number, fps: number, totalFrames: number, onProgress: (progress: number, text?: string) => void): Promise<void> {
    const frameInterval = 1 / fps;

    console.log('Rendering frames to PNG...');
    for (let frame = 0; frame < totalFrames; frame++) {
      const currentTime = frame * frameInterval;

      // Use the stateless rendering method from the visualizer
      this.visualizer.renderAtTime(currentTime);

      // Update the played note events counter
      this.visualizer.noteManager.updatePlayedNoteEvents(this.visualizer.events, currentTime);

      // Debugging logs to verify events and currentTime
      console.log('Debug: Events:', this.visualizer.events);
      console.log('Debug: Current Time:', this.visualizer.currentTime);

      // Convert canvas to PNG blob
      const blob = await this.canvasToPngBlob();

      // Store the blob with frame information
      this.imageBlobs.push({
        blob: blob,
        frameNumber: frame,
        filename: `frame_${String(frame).padStart(5, '0')}.png`
      });

      // Update progress for frame rendering (80% of total progress)
      const renderProgress = (frame / totalFrames) * 80;
      onProgress(renderProgress);

      // Small delay to prevent UI blocking
      if (frame % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    console.log(`Rendered ${totalFrames} PNG frames`);
  }

  private async canvasToPngBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to PNG blob'));
        }
      }, 'image/png', 1.0); // Maximum quality
    });
  }

  private async createZipFile(sceneName: string, onProgress: (progress: number, text?: string) => void): Promise<Blob> {
    // Load JSZip library dynamically
    const JSZip = await this.loadJSZip();

    const zip = new JSZip();

    // Create a folder for the sequence
    const folderName = `${sceneName}_sequence`.replace(/[^a-zA-Z0-9_]/g, '_');
    const folder = zip.folder(folderName);

    // Add metadata file
    const metadata: GenerationMetadata = {
      sceneName: sceneName,
      totalFrames: this.imageBlobs.length,
      format: 'PNG',
      generatedAt: new Date().toISOString(),
      software: 'MIDI Social Media Visualizer'
    };

    folder.file('metadata.json', JSON.stringify(metadata, null, 2));

    // Add all PNG images to the ZIP
    for (let i = 0; i < this.imageBlobs.length; i++) {
      const imageData = this.imageBlobs[i];
      folder.file(imageData.filename, imageData.blob);

      // Update progress for ZIP creation (80% + 20% of remaining)
      const zipProgress = 80 + ((i / this.imageBlobs.length) * 20);
      onProgress(zipProgress);

      // Small delay every 20 files to prevent blocking
      if (i % 20 === 0) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // Generate the ZIP file
    console.log('Generating ZIP file...');
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: {
        level: 6 // Good balance between size and speed
      }
    });

    onProgress(100);
    console.log(`ZIP file created: ${zipBlob.size} bytes`);
    return zipBlob;
  }

  private async loadJSZip(): Promise<any> {
    if (window.JSZip) {
      return window.JSZip;
    }

    console.log('Loading JSZip library...');
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = () => {
        if (window.JSZip) {
          console.log('✅ JSZip loaded successfully');
          resolve(window.JSZip);
        } else {
          reject(new Error('JSZip not available after script load'));
        }
      };
      script.onerror = () => {
        reject(new Error('Failed to load JSZip library'));
      };
      document.head.appendChild(script);
    });
  }

  stop(): void {
    this.isGenerating = false;
    this.imageBlobs = []; // Clear memory
    console.log('Image sequence generation stopped');
  }

  isGeneratingSequence(): boolean {
    return this.isGenerating;
  }

  private downloadImageSequence(zipBlob: Blob, filename: string = 'image-sequence.zip'): void {
    try {
      console.log(`Downloading image sequence: ${filename} (${zipBlob.size} bytes)`);

      // Create download link
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';

      // Trigger download
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up object URL after a delay
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      console.log('Image sequence download initiated');
    } catch (error) {
      console.error('Error downloading image sequence:', error);
      throw new Error(`Download failed: ${(error as Error).message}`);
    }
  }
}

// Export for use in other modules
declare global {
  interface Window {
    ImageSequenceGenerator: typeof ImageSequenceGenerator;
  }
}

window.ImageSequenceGenerator = ImageSequenceGenerator;
