# Deprecated Code Tracker

Updated: 2026-04-30

## Status Key

- ✅ Done — migrated in this session
- 🔜 Pending — straightforward, queued
- ⏸ Deferred — requires schema/data migration or removal of compat layer
- 🔒 Keep — backwards-compat shim that must stay until plugin ecosystem catches up

---

## 1. VisualMedia: `includeInLayoutBounds` → `layoutBoundsMode`

**Deprecated:** `VisualMediaOptions.includeInLayoutBounds?: boolean` (`visual-media.ts:94`)  
**Replace with:** `layoutBoundsMode: 'none'` (for `false`) or `layoutBoundsMode: 'container'` (for `true`)  
**Note:** Only deprecated on `VisualMedia`. Other render objects (Rect, Poly, etc.) use `includeInLayoutBounds` natively — do NOT change those.

| File                                                                             | Status  |
| -------------------------------------------------------------------------------- | ------- |
| `src/core/scene/elements/misc/image.ts:81`                                       | ✅ Done |
| `src/core/scene/elements/_templates/image-atlas.ts:33,34`                        | ✅ Done |
| `src/core/scene/elements/_templates/image-simple.ts:19`                          | ✅ Done |
| `src/core/scene/elements/_templates/bundled-image.ts:28`                         | ✅ Done |
| `src/core/scene/elements/midi-displays/note-animations/cytusish.ts:97`           | ✅ Done |
| `src/core/scene/elements/midi-displays/notes-playing-display.ts:164,173,196,208` | ✅ Done |
| `src/plugins/boinker/boinker.ts:43,48,53,58,63,68`                               | ✅ Done |
| `src/plugins/midipack1/popcat-midi-display.ts:231`                               | ✅ Done |
| `src/plugins/atlastest/my-atlas-element.ts:33,34`                                | ✅ Done |

---

## 2. RenderObject base: `setPivot` / `setPivotFraction` → `setOrigin` / `setOriginFraction`

**Deprecated:** `setPivot(x, y)` (`base.ts:106`) and `setPivotFraction(x, y)` (`base.ts:111`)  
**Replace with:** `setOrigin(x, y)` / `setOriginFraction(x, y)`  
**Also deprecated on VisualMedia:** `setPivotFraction` (`visual-media.ts:245`)

| File                                 | Status  |
| ------------------------------------ | ------- |
| `src/plugins/boinker/boinker.ts:145` | ✅ Done |

---

## 3. VisualMedia: Deprecated anchor/pivot props in `VisualMediaOptions`

**Deprecated:** `pivotFractionX`, `pivotFractionY` → use `originX`, `originY`  
**Deprecated:** `contentAnchorX/Y`, `frameAnchorX/Y` → use `framePlacement`  
**Deprecated methods:** `setContentAnchor()`, `setFrameAnchor()` on VisualMedia

No external callers found passing these via options. The compat layer in `visual-media.ts` constructor handles any serialised state that might reference them. Keep compat layer.

| Item                                                    | Status                                     |
| ------------------------------------------------------- | ------------------------------------------ |
| `VisualMediaOptions.pivotFractionX/Y`                   | 🔒 Keep (compat for serialised scene data) |
| `VisualMediaOptions.contentAnchorX/Y`, `frameAnchorX/Y` | 🔒 Keep (compat for serialised scene data) |
| `setContentAnchor()`, `setFrameAnchor()` on VisualMedia | 🔒 Keep (compat for serialised scene data) |

---

## 4. VisualMedia: `fitMode: 'none'` → `fitMode: 'clip'`

**Deprecated:** `fitMode: 'none'` is an alias for `'clip'` (`visual-media.ts:90,157`)  
No external callers found using `'none'`. Keep compat in renderer.

| Item                    | Status                                     |
| ----------------------- | ------------------------------------------ |
| `fitMode: 'none'` alias | 🔒 Keep (compat for serialised scene data) |

---

## 5. Plugin Manifest: `mvmntVersion` → `apiVersion`

**Deprecated:** `PluginManifest.mvmntVersion` (`pluginStore.ts:10`, `dev-plugin-loader.ts:28`)  
Runtime warns at load time (`plugin-loader.ts:192`).  
Cannot remove until external plugin authors have updated their manifests.

| Item                                | Status                           |
| ----------------------------------- | -------------------------------- |
| `PluginManifest.mvmntVersion` field | 🔒 Keep (external plugin compat) |

---

## 6. Automation: `AutomationChannel.interpolation` → per-keyframe `segmentInterpolation`

**Deprecated:** `AutomationChannel.interpolation: AutomationInterpolation` (`automation/types.ts:126`)  
Per `automation-system-thoughts.md`: replacement is per-keyframe `segmentInterpolation`.  
This requires a data migration for saved projects. Complex — deferred.

| Item                              | Status                                        |
| --------------------------------- | --------------------------------------------- |
| `AutomationChannel.interpolation` | ⏸ Deferred (requires saved-project migration) |

---

## 7. Persistence: Legacy inline JSON export/import

**Deprecated:** `ExportSceneResultInline` interface (`export.ts:156`), `parseLegacyInlineScene()` (`scene-package.ts:176`), `'inline-json'` storage mode (`audio-asset-export.ts:11`), `AudioAssetRecord.dataBase64` (`audio-asset-export.ts:23`)  
Runtime warns on import (`import.ts:67,109`) and export (`export.ts:677`).  
Cannot remove until all user scenes have been re-exported as packaged `.mvt` files.

| Item                             | Status                     |
| -------------------------------- | -------------------------- |
| Inline JSON import/export compat | 🔒 Keep (user data compat) |

---

## 8. Audio: `channelAliases` → `channelLayout.aliases`

**Deprecated:** `channelAliases?: string[] | null` on track info (`audioFeatureTypes.ts:104`)  
Used as a fallback in `audioDiagnosticsStore.ts:292` and several audio-debug elements.  
These are debug/display elements reading both old and new fields — compat fallback is appropriate.

| Item                            | Status                                   |
| ------------------------------- | ---------------------------------------- |
| `channelAliases` fallback reads | 🔒 Keep (compat for older analysis data) |

---

## 9. `publishAnalysisIntent` legacy function signature

**Deprecated:** Old 5-argument call signature (`analysisIntents.ts:185`)  
Runtime warns in non-production builds.

| Item                                 | Status                           |
| ------------------------------------ | -------------------------------- |
| Old `publishAnalysisIntent` overload | 🔒 Keep (external plugin compat) |

---

## 10. Easy Mode UI

**Deprecated:** Entire Easy Mode flagged as deprecated in UI (`EasyModeLayout.tsx:181`)  
Removal is a product decision — deferred.

| Item      | Status                        |
| --------- | ----------------------------- |
| Easy Mode | ⏸ Deferred (product decision) |
