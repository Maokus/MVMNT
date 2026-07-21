import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { loadPlugin } from '@core/scene/plugins';
import { stageDesktopProjectOpen } from '../desktop/pending-open';
import { stagePendingRender } from '../desktop/pending-automation';
import { writeStoredImportPayload } from '@utils/importPayloadStorage';
import { useVisualAssetRegistryStore } from '@state/visualAssetRegistryStore';
import { DesktopWorkspaceTools } from '../desktop/DesktopWorkspaceTools';
import { importFontFile } from '@fonts/import-font-file';

// Tailwind styles are loaded via index.tsx
const MidiVisualizer = lazy(() => import('@workspace/overlays/MidiVisualizer'));
const AnimationTestPage = lazy(() => import('@pages/AnimationTestPage'));
const AboutPage = lazy(() => import('@pages/AboutPage'));
const ChangelogPage = lazy(() => import('@pages/ChangelogPage'));
const HomePage = lazy(() => import('@pages/HomePage'));
const CommunityPage = lazy(() => import('../community/CommunityPage'));
const ContributePage = lazy(() => import('@pages/ContributePage'));

const DeveloperOverlayLazy = lazy(() =>
  import('@workspace/dev/DeveloperOverlay').then((module) => ({
    default: module.DeveloperOverlay,
  })),
);

const SCREEN_WARNING_MAX_WIDTH = 1200;

const LOADING_SUBTEXTS = [
  'Quashing rebellions...',
  'Choosing a better default song...',
  'Polishing invisible buttons...',
  'Asking chatgpt how to open the app...',
  'Fixing last-minute bugs...',
  'Begging people to beta test the app...',
  'Hiding easter eggs...',
  'Learning how to read MIDI files...',
  'Booting up the studio experience...',
];

const getRandomLoadingSubtext = () => LOADING_SUBTEXTS[Math.floor(Math.random() * LOADING_SUBTEXTS.length)];

const AppLoadingScreen: React.FC<{ message?: string }> = ({ message = 'Loading MVMNT…' }) => {
  const [subtext] = useState(() => getRandomLoadingSubtext());

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="relative">
        <div
          className="pointer-events-none absolute -inset-16 rounded-[44px] bg-gradient-to-br from-indigo-500/25 via-fuchsia-500/20 to-sky-500/25 opacity-70 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative flex w-[min(90vw,22rem)] flex-col items-center gap-5 overflow-hidden rounded-3xl border border-neutral-800/80 bg-neutral-900/85 px-8 py-9 text-center shadow-[0_35px_120px_-40px_rgba(79,70,229,0.55)] backdrop-blur">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute h-12 w-12 animate-ping rounded-full bg-indigo-400/25" aria-hidden="true" />
            <span className="relative h-12 w-12 animate-spin rounded-full border-[3px] border-indigo-300/60 border-t-transparent" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold tracking-tight text-neutral-100">{message}</p>
            <p className="text-sm text-neutral-400">{subtext}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export function App() {
  const [isScreenSmall, setIsScreenSmall] = useState(false);
  const [isScreenWarningDismissed, setIsScreenWarningDismissed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const desktop = window.mvmntDesktop;
    if (!desktop) return;
    const unsubscribe = desktop.automation.onRenderRequest((request) => {
      writeStoredImportPayload(request.bytes);
      sessionStorage.setItem('mvmnt.desktop.pending-open-name', request.inputName);
      stagePendingRender(request);
      navigate('/workspace', { state: { importScene: true, automationRender: true } });
    });
    desktop.automation.ready();
    return unsubscribe;
  }, [navigate]);

  useEffect(() => {
    const desktop = window.mvmntDesktop;
    if (!desktop) return;
    return desktop.automation.onDeepLink((command) => {
      if (command.command === 'show-recovery') window.dispatchEvent(new Event('mvmnt-show-recovery'));
      if (command.command === 'show-storage') window.dispatchEvent(new Event('mvmnt-show-storage'));
      if (command.command === 'open-community') navigate(command.id ? `/community?id=${encodeURIComponent(command.id)}` : '/community');
    });
  }, [navigate]);

  useEffect(() => {
    const desktop = window.mvmntDesktop;
    if (!desktop || location.pathname === '/workspace') return;
    return desktop.documents.onOpenPathRequest((result) => {
      if (result.kind === 'project' && stageDesktopProjectOpen(result)) {
        navigate('/workspace', { state: { importScene: true } });
        return;
      }
      if (result.kind === 'plugin' && result.bytes) {
        const trusted = window.confirm(
          `Install ${result.displayName || 'this plugin'}?\n\nPlugins execute code inside MVMNT. Only install plugins from authors you trust.`,
        );
        if (!trusted) return;
        const bytes = result.bytes;
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        void loadPlugin(buffer).then((pluginResult) => {
          if (!pluginResult.success) alert(pluginResult.error || 'Plugin installation failed.');
        });
      }
    });
  }, [location.pathname, navigate]);

  useEffect(() => {
    const desktop = window.mvmntDesktop;
    if (!desktop || location.pathname === '/workspace') return;
    return desktop.menu.onCommand((command) => {
      if (command === 'new') {
        void desktop.documents.clearActivePath().then(() => {
          navigate('/workspace', { state: { template: 'default', desktopNew: true } });
        });
      }
      if (command === 'open') {
        void desktop.documents.open().then((result) => {
          if (stageDesktopProjectOpen(result)) {
            navigate('/workspace', { state: { importScene: true } });
          }
        });
      }
    });
  }, [location.pathname, navigate]);

  useEffect(() => {
    const preventPinchZoom = (e: any) => {
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };

    const preventGesture = (e: any) => {
      e.preventDefault();
    };

    // For most browsers
    window.addEventListener('touchmove', preventPinchZoom, { passive: false });

    // For Safari (iOS)
    window.addEventListener('gesturestart', preventGesture);
    window.addEventListener('gesturechange', preventGesture);
    window.addEventListener('gestureend', preventGesture);

    return () => {
      window.removeEventListener('touchmove', preventPinchZoom);
      window.removeEventListener('gesturestart', preventGesture);
      window.removeEventListener('gesturechange', preventGesture);
      window.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hasFiles = (dt: DataTransfer | null) => {
      if (!dt) return false;
      if (dt.items && dt.items.length) {
        return Array.from(dt.items).some((item) => item.kind === 'file');
      }
      if (dt.files && dt.files.length) return true;
      const types = dt.types ? Array.from(dt.types) : [];
      return types.includes('Files');
    };

    const isTimelineTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      return !!target.closest('.timeline-panel');
    };

    const handleDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = async (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      if (isTimelineTarget(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const nativeFiles = Array.from(e.dataTransfer?.files ?? []);
      try {
        const dropped = window.mvmntDesktop
          ? await window.mvmntDesktop.droppedFiles.read(nativeFiles)
          : await Promise.all(nativeFiles.map(async (file) => ({
              name: file.name,
              category: (/\.mvt$/i.test(file.name) ? 'project'
                : /\.mvmnt-plugin$/i.test(file.name) ? 'plugin'
                : /\.(mid|midi)$/i.test(file.name) ? 'midi'
                : /\.(wav|mp3|ogg|flac|aac|m4a)$/i.test(file.name) ? 'audio'
                : /\.(ttf|otf|woff2?)$/i.test(file.name) ? 'font' : 'image') as any,
              bytes: new Uint8Array(await file.arrayBuffer()),
            })));
        for (const file of dropped) {
          if (file.category === 'project' || file.category === 'template') {
            writeStoredImportPayload(file.bytes);
            sessionStorage.setItem('mvmnt.desktop.pending-open-name', file.name);
            await window.mvmntDesktop?.documents.clearActivePath();
            navigate('/workspace', { state: { importScene: true } });
          } else if (file.category === 'plugin') {
            const trusted = window.confirm(`Install ${file.name}?\n\nPlugins execute code inside MVMNT. Only install plugins from authors you trust.`);
            if (trusted) {
              const buffer = file.bytes.buffer.slice(file.bytes.byteOffset, file.bytes.byteOffset + file.bytes.byteLength) as ArrayBuffer;
              const result = await loadPlugin(buffer);
              if (!result.success) alert(result.error || 'Plugin installation failed.');
            }
          } else {
            const arrayBuffer = file.bytes.buffer.slice(
              file.bytes.byteOffset,
              file.bytes.byteOffset + file.bytes.byteLength,
            ) as ArrayBuffer;
            const blob = new Blob([arrayBuffer]);
            const browserFile = new File([blob], file.name);
            if (file.category === 'image') useVisualAssetRegistryStore.getState().addAsset(browserFile);
            else if (file.category === 'font') {
              const licensed = window.confirm('Confirm that you have the rights to use and distribute this font within the scene.');
              if (licensed) await importFontFile(browserFile);
            } else window.dispatchEvent(new CustomEvent('mvmnt-dropped-media', { detail: { category: file.category, file: browserFile } }));
          }
        }
      } catch (error) {
        alert(error instanceof Error ? error.message : 'Could not import the dropped files.');
      }
    };

    window.addEventListener('dragover', handleDragOver, { capture: true });
    window.addEventListener('drop', handleDrop, { capture: true });

    return () => {
      window.removeEventListener('dragover', handleDragOver, { capture: true } as any);
      window.removeEventListener('drop', handleDrop, { capture: true } as any);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateScreenSizeState = () => {
      setIsScreenSmall(window.innerWidth <= SCREEN_WARNING_MAX_WIDTH);
    };

    updateScreenSizeState();
    window.addEventListener('resize', updateScreenSizeState);

    return () => {
      window.removeEventListener('resize', updateScreenSizeState);
    };
  }, []);

  return (
    <div className="App">
      {isScreenSmall && !isScreenWarningDismissed ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-[min(90vw,24rem)] rounded-3xl border border-rose-400/60 bg-neutral-900/95 px-8 py-9 text-center shadow-[0_45px_120px_-35px_rgba(244,63,94,0.55)]">
            <p className="mb-6 text-lg font-semibold tracking-tight text-neutral-100">
              your screen size is bogus. expect trouble
            </p>
            <button
              type="button"
              onClick={() => setIsScreenWarningDismissed(true)}
              className="inline-flex items-center justify-center rounded-full bg-rose-500 px-6 py-2 text-sm font-semibold text-white transition hover:bg-rose-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
            >
              ok :(
            </button>
          </div>
        </div>
      ) : null}
      <Suspense fallback={<AppLoadingScreen />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/workspace" element={<MidiVisualizer />} />
          <Route path="/animation-test" element={<AnimationTestPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="/community" element={<CommunityPage />} />
          <Route path="/contribute" element={<ContributePage />} />
        </Routes>
      </Suspense>
      <Suspense fallback={null}>
        <DeveloperOverlayLazy />
      </Suspense>
      <DesktopWorkspaceTools />
    </div>
  );
}

export default App;
