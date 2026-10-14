# GitNexus Engineering Plan

> Task: Flat-design cleanup of all workspace chrome, dedupe buttons, exclude video elements.
> Evidence verified at commit 2ed8c781e406474a845214fdf3fba9865773dd9c; GitNexus index not used (fallback source-derived).
> Evidence provenance schema 2; helper unavailable on win32 (snapshot failed: Git index changed while descriptor opened); cited paths source-verified below.

## 1. Objective

Replace sloppy repeated button/chrome code across `src/workspace` (plus workspace-adjacent `src/components`, `src/community`) with one flat design system. No gradients, glows, `shadow-*`, translucency (`bg-*/95`, `bg-*/60`), or `backdrop-blur`. Do NOT touch anything that appears in videos: `src/core/scene/built-ins/`, `src/core/scene/runtime/`, `packages/plugin-sdk`, `src/templates/*.mvt` content, canvas render path.

## 2. Current Behaviour

[verified] `src/workspace/components/Button.tsx:3-58` defines 19 variants but only ~18 call sites use it; ~150+ raw `<button>` copies remain (modal footers, icon buttons x6/file, toolbar pills, solid CTAs, outline danger/success ternaries, list rows). [verified] `ModalShell.tsx:51` hardcodes `bg-neutral-900/95 shadow-2xl rounded-lg`; `MenuBar.tsx:254,267,327,331` mixes inline styles + raw classes; `TransportControls.tsx:22-64` already uses `Button transport`; `HeaderRightControls.tsx:202-236` uses `bg-neutral-900/60`, `bg-blue-600/70`, `shadow-lg:339`. [verified] `shadow-lg` in `AssetManagerPanel.tsx:210`, `TempoAutomationLane.tsx:309`, `ElementDropdown.tsx:117`; `shadow-2xl` in `ModalShell`, `TemplateLoadingOverlay.tsx:24`, `CommunityUploadModal.tsx:131`.

## 3. Relevant Architecture

Workspace follows store-first + command-gateway (`timelineStore`, `sceneStore`, `dispatchSceneCommand`). This change is pure presentational: no store, gateway, timing (`CANONICAL_PPQ`), persistence schema, or SDK contract changes. Boundary: chrome (layout, panels, modals, forms, timeline header/lanes containers) IN; scene element visuals + canvas output OUT. Per `docs/current-state.md`, MVMNT 0.16 + SDK 2.2 + schema v10 contracts preserved by avoiding those paths.

## 4. GitNexus Findings

Fallback mode — no graph calls (index runner not resolved on win32, budget reserved for execution). Source-derived findings from prior inventory + targeted reads:
- `Button.tsx` (primary symbol): 19 variants incl. `transport|toolbar|icon|navy|indigo|info|panel` — callers: `TransportControls`, `HeaderRightControls:368,379,390`, `SaveSceneModal`, `MidiImportModeModal`, `ScenePluginsTab`.
- `ModalShell.tsx:16-58` (primary): all modals funnel through `cardClassName ??` default — single flatten point.
- `MenuBar.tsx:156-338` (related): inline-style help/controls/community + raw settings/ellipsis + Browse/Render buttons.
- `HeaderRightControls.tsx:202-339` (related): snap pill, selects, overflow `shadow-lg` menu.
- Tests: `src/workspace/components/__tests__/Button.test.tsx`, `ButtonCatalog.test.tsx` pin exact class strings — must update once.

## 5. Statement-Level PDG Findings

No PDG layer indexed; source reasoning only. `Button()` is pure string concat (`VARIANT_CLASSES[variant] + SIZE_CLASSES[size] + className`) — no control dependence beyond defaults; safe to extend. `ModalShell` Escape shortcut (`useGlobalShortcut modal`) and backdrop `onClick={onCancel}` are orthogonal to `cardClassName` — flattening classes cannot break dismissal. `MenuBar` scene-menu open state and `HeaderRightControls` quantize state mutate only on click handlers — class swaps preserve behavior.

## 6. Proposed Changes

- `src/workspace/components/Button.tsx` [verified]: prune to ~8 flat variants (`primary|secondary|danger|ghost|icon|toolbar|menu|list-row`), flat fills (`bg-blue-600`, no `/70`, no gradients), `1px solid #2a2a2a`-equivalent `border-neutral-800`, no `shadow-*`, add `danger-outline|success-outline`, `IconButton` (`w-7 h-7`), `ListRowButton`. Delete `solid-blue|solid-emerald|solid-amber|navy|indigo|info|accent|faint|quiet|neutral|muted` aliases (codemod to survivors).
- `src/workspace/modals/ModalShell.tsx` [verified]: default card `rounded border border-neutral-800 bg-neutral-900 p-5` (no `/95`, no `shadow-2xl`, `rounded-lg`→`rounded`); overlay `bg-black/60`→`bg-black`.
- `src/workspace/layout/MenuBar.tsx` [verified]: replace inline styles `:174-213` + raw buttons `:254,267,327,331` with `Button ghost|icon|primary|secondary`.
- `src/workspace/panels/timeline/header/HeaderRightControls.tsx` [verified]: snap pill + selects to `bg-neutral-900`, active `bg-blue-600`, dividers `bg-neutral-800`; overflow menu remove `shadow-lg`, `bg-panel/95`→`bg-neutral-900`.
- Timeline chrome (`TimelinePanel.tsx:120`, `TrackList.tsx:33`, `TrackEditorRow.tsx:93,110`, `AutomationTrackLabels.tsx:279,294`, `TempoAutomationLane.tsx:309`, `SidePanels.tsx:251`, `AssetManagerPanel.tsx:108,175,185,210`): swap raw pills/icons to `Button toolbar|transport|icon|panel`, strip `shadow-lg`, `bg-*/50|/60`→solid.
- Modals/forms/menus (`RenderModal.tsx:319,338,721,728`, `SaveSceneModal.tsx:72,129,132`, `MidiImportModeModal.tsx:61-71`, `MidiTempoImportModal.tsx:35-47`, `TemplateBrowserModal.tsx:67,86`, `ControlsModal.tsx:122`, `SceneSettingsModal.tsx:398,412`, `SceneAnalysisCachesTab.tsx:303-519`, `SceneFontManager.tsx:160,170,247,280,326`, `ScenePluginsTab.tsx:141-300`, `FontInput.tsx:316,339,373`, `ColorPicker.tsx:326,369,458,492`, `ElementDropdown.tsx:117,125,162`, `CreateElementPopup.tsx:98`, `TrackImportButtons.tsx:14,22` labels→buttons, `CommandContextMenu`, `CacheDiagnosticsPopup`, `TrackInputAssignPopup`): same codemod; `linear-gradient` in `ColorPicker.tsx:326` → flat swatch.
- Explicitly OUT: `src/core/scene/built-ins/**`, `src/core/scene/runtime/**`, `packages/plugin-sdk/**`, `src/templates/**`, `src/export/**`, canvas/preview renderers.

## 7. Implementation Sequence

1. `Button.tsx` — prune/extend variants + update `Button.test.tsx` + `ButtonCatalog.test.tsx` goldens. Risk: golden churn; keep names stable where possible.
2. `ModalShell.tsx` + all `modals/*` footers/close buttons — one visual pass, verify Escape/backdrop still dismisses.
3. `MenuBar.tsx` + `SidePanels.tsx` + `CommandContextMenu` — header chrome flat.
4. Timeline header + lanes (`HeaderRightControls`, `TransportControls`, `TrackList`, `TrackEditorRow`, `Automation*`, `TempoAutomationLane`) — container chrome only, never clip/curve rendering colors.
5. Scene-element TAB CONTAINER only (`ElementListItem`, `SceneNodeTree`, `ElementDropdown`, `CreateElementPopup` list rows) — icons/rows flat; do not touch element inspectors that affect video output beyond button chrome.
6. Remaining panels/forms/community (`AssetManagerPanel`, `Scene*Tab`, `SceneFontManager`, `FontInput`, `ColorPicker`, `RenderModal`, `TemplateBrowserModal`, `ExportProgressOverlay`, `OnboardingOverlay`, `MissingFontsBanner`, `MacroConfig`) + global CSS tokens (`border-border/bg-panel`→flat hex).
7. Final: `npx prettier --write .`, `npm run test`, `npm run build`, `npm run compile`; regenerate Button catalog snapshot once.

## 8. Test Strategy

- Update: `Button.test.tsx`, `ButtonCatalog.test.tsx` (new variant map, no shadows/translucency).
- Add: `FlatChrome.test.tsx` — assert (a) no `shadow-*|backdrop-blur|gradient|/95|/60` in `Button.tsx` + `ModalShell.tsx` snapshots; (b) modal footers render `Button`; (c) grep-gate on `src/workspace` for banned tokens excluding element-render paths.
- Manual: open each modal, timeline zoom/snap/follow, element tab expand/collapse, render modal — confirm flat, no glow, dismissal intact.
- Commands (exist per root `package.json`): `npx prettier --write .`, `npm run test` (`vitest run`), `npm run build`, `npm run compile` (`tsc --noEmit` x2).

## 9. Risk and Impact Analysis

- High-risk: `Button.tsx` is shared — every direct dependent (18 call sites + ~150 migrated) inherits class change; mitigated by keeping `variant/size/children` API stable.
- `ModalShell` default affects all modals — single revert point via `cardClassName` override.
- Compatibility: none on SDK 2.2 / schema v10 / timeline PPQ — no data or runtime changes.
- Perf: flat (fewer blurs/shadows) is neutral-to-faster.
- Observability: visual only; no telemetry change. Biggest risk is scope creep into element visuals — enforced by OUT list + test gate.

## 10. Files Expected to Change

| File | Symbols | Reason |
| ---- | ------- | ------ |
| `src/workspace/components/Button.tsx` | `Button`, `VARIANT_CLASSES`, `IconButton`, `ListRowButton` | single flat system |
| `src/workspace/components/__tests__/Button.test.tsx`, `ButtonCatalog.test.tsx` | goldens | variant map change |
| `src/workspace/modals/ModalShell.tsx` | `ModalShell` | flat card/overlay |
| `src/workspace/layout/MenuBar.tsx` | `MenuBar`, `DocumentSaveStatus` | dedupe header buttons |
| `src/workspace/panels/timeline/header/HeaderRightControls.tsx` | snap/zoom/follow/menu | flat pill + menu |
| `src/workspace/panels/timeline/*` (`TimelinePanel`, `TrackList`, `TrackEditorRow`, `Automation*`, `TempoAutomationLane`) | lane/header chrome | flat containers |
| `src/workspace/panels/scene-element/*` (containers only) | list rows, icon buttons | flat rows |
| `src/workspace/modals/*`, `forms/inputs/*`, `scene-settings/*`, `asset-manager/*`, `templates/BrowseTemplatesButton.tsx` | footers, inputs, tabs | codemod to `Button` |

## 11. Reusable Implementation Context

```json
{
  "task": "flat-design workspace chrome cleanup, exclude video elements",
  "pinned_commit": "2ed8c781e406474a845214fdf3fba9865773dd9c",
  "evidence_provenance": {
    "schema_version": 2,
    "status": "helper-unavailable-win32-fallback-source-verified",
    "global_dirty_digest": "unavailable (helper failed)",
    "cited_path_manifest": [
      "src/workspace/components/Button.tsx",
      "src/workspace/modals/ModalShell.tsx",
      "src/workspace/layout/MenuBar.tsx",
      "src/workspace/panels/timeline/TransportControls.tsx",
      "src/workspace/panels/timeline/header/HeaderRightControls.tsx"
    ]
  },
  "boundaries": {
    "in": ["src/workspace/**", "src/components/**", "src/community/**", "src/pages/**"],
    "out": ["src/core/scene/built-ins/**", "src/core/scene/runtime/**", "packages/plugin-sdk/**", "src/templates/**", "src/export/**"]
  },
  "flat_rules": ["no shadow-*", "no backdrop-blur", "no gradient", "no bg-opacity /95 /60 /50 (use solid)", "1px neutral-800 borders", "rounded (not rounded-lg/xl) for cards", "solid active states"],
  "verify": ["npx prettier --write .", "npm run test", "npm run build", "npm run compile"]
}
```

## 12. Assumptions and Open Questions

- Assumes "glowing borders in timelines, element tab" means container/chrome glow, not clip/curve/selection colors that render into video — confirm at gate.
- Assumes `border-neutral-800` + solid `bg-neutral-900` is acceptable flat token; unique redesign later.
- Deferred: dark/light theming, new design tokens, element-visual redesign, non-button typography/spacing pass (§12 follow-ups).
- Open: should `src/community` + `src/pages` be included? Plan includes them as chrome; exclude on request.

## 13. Definition of Done

- Zero `shadow-*`, `backdrop-blur`, `gradient`, `bg-*/95|/60|/50` in `Button.tsx` + `ModalShell.tsx`; no new ones in `src/workspace` chrome (test gate passes).
- All raw modal-footer/icon/toolbar/solid-CTA/outline/list-row copies migrated to `Button` family; `~150 raw <button>` → negligible outside element-render code.
- `prettier + test + build + compile` green; Button goldens updated once.
- No diffs in `src/core/scene/built-ins`, `runtime`, `packages/plugin-sdk`, `src/export`, `src/templates/*.mvt`.
