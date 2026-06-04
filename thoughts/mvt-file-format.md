# MVMNT .mvt File Format

This document describes the `.mvt` file format well enough to build an external tool that produces files importable into MVMNT.

---

## Overview

A `.mvt` file is a **ZIP archive** (deflate level 6) containing one required JSON document and zero or more binary asset files.

- **Format identifier:** `"mvmnt.scene"`
- **Current schema version:** `6`
- **Minimum MVMNT version to open V6 files:** `0.15.0`
- **File extension:** `.mvt`

---

## ZIP Archive Layout

```
scene.mvt  (ZIP)
├── document.json                                    ← required; the scene envelope (JSON)
├── Icon.icns                                        ← optional app icon (ignored on import)
│
├── assets/
│   ├── audio/{assetId}/{filename}                   ← audio files (mp3, wav, etc.)
│   ├── midi/{assetId}/track.mid                     ← MIDI files (Standard MIDI, SMF)
│   ├── fonts/{assetId}/{filename}                   ← font files (ttf, woff2, etc.)
│   ├── visual/{assetId}/{filename}                  ← image files (png, jpg, etc.)
│   ├── waveforms/{assetId}/waveform.json            ← waveform display metadata
│   ├── waveforms/{assetId}/*.f32                    ← waveform binary peak data
│   ├── audio-features/{assetId}/feature_caches.json ← audio analysis metadata
│   └── audio-features/{assetId}/*.f32               ← audio feature binary data
│
└── plugins/{pluginId}.mvmnt-plugin                  ← embedded plugin bundles (optional)
```

The `assetId` is a UUID string without hyphens that you generate. It must match the corresponding record in `document.json`.

---

## `document.json` Structure

`document.json` is a single JSON object of type `SceneExportEnvelopeV6`:

```jsonc
{
  "schemaVersion": 6,
  "format": "mvmnt.scene",
  "metadata": { ... },
  "plugins": [ ... ],          // optional
  "scene": { ... },
  "timeline": { ... },
  "assets": { ... },
  "references": { ... },       // optional
  "visualAssetRegistry": { ... }, // optional
  "compatibility": { ... }     // optional
}
```

---

## `metadata`

```jsonc
{
  "id": "scene-uuid-here",          // unique scene ID (UUIDv4 recommended)
  "name": "My Scene",
  "createdAt": "2026-06-04T12:00:00.000Z",   // ISO 8601
  "modifiedAt": "2026-06-04T12:00:00.000Z",
  "format": "scene",
  "description": "Optional description",
  "author": "Author Name"
}
```

---

## `scene`

Contains the visual elements, their property bindings, automation channel data, macro definitions, and font assets.

```jsonc
{
  "elements": {
    "elem_abc123": {
      "id": "elem_abc123",
      "type": "audio-spectrum",          // element type identifier
      "properties": {
        "barColor": { "type": "constant", "value": "#FF5500" },
        "opacity":  { "type": "constant", "value": 1 },
        "scale":    { "type": "macro",    "macroId": "macro_xyz" },
        "rotationDegrees": { "type": "keyframes", "channelId": "elem_abc123.rotationDegrees" }
      }
    }
  },
  "elementsOrder": ["elem_abc123"],      // defines render/layer order (back to front)
  "sceneSettings": {
    "fps": 60,
    "width": 1920,
    "height": 1080,
    "tempo": 120,
    "beatsPerBar": 4
  },
  "macros": { ... },                     // optional; see Macro System below
  "fontAssets": { ... },                 // optional; see Font Assets below
  "fontLicensingAcknowledgedAt": 1717459200000, // optional; epoch ms
  "automation": { ... }                  // optional; see Automation below
}
```

### Property Binding Types

Each property value in `properties` is one of three binding variants:

| Type | Fields | Meaning |
|---|---|---|
| `"constant"` | `value: any` | Static value; never changes |
| `"macro"` | `macroId: string` | Linked to a macro by ID |
| `"keyframes"` | `channelId: string` | Animated; references an automation channel |

The `channelId` for a keyframe binding follows the convention `"{elementId}.{propertyKey}"`, e.g. `"elem_abc123.rotationDegrees"`.

---

## `scene.automation`

Stores all keyframe animation data. Only present if at least one property is animated.

```jsonc
{
  "channels": {
    "elem_abc123.rotationDegrees": {
      "id": "elem_abc123.rotationDegrees",
      "elementId": "elem_abc123",
      "propertyKey": "rotationDegrees",
      "interpolation": "eased",        // legacy channel-level mode; "linear" | "stepped" | "eased"
      "valueType": "number",           // "number" | "color" | "boolean" | "string"
      "keyframes": [
        {
          "tick": 0,
          "value": 0,
          "easingId": "linear",        // legacy field; keep for compat
          "segmentInterpolation": {
            "mode": "cubic",           // see Interpolation Modes below
            "direction": "ease_in_out" // "auto" | "ease_in" | "ease_out" | "ease_in_out"
          },
          "leftHandleType": "auto_clamped",
          "rightHandleType": "auto_clamped"
        },
        {
          "tick": 480,
          "value": 360,
          "easingId": "linear",
          "segmentInterpolation": { "mode": "cubic", "direction": "ease_in_out" },
          "leftHandleType": "auto_clamped",
          "rightHandleType": "auto_clamped"
        }
      ]
    }
  }
}
```

### Tick Units

Ticks use MVMNT's canonical PPQ (pulses per quarter note). The PPQ constant is defined in `src/core/timing/ppq.ts` — at time of writing it is **480 PPQ**. A timeline position of one beat at 120 BPM = tick 480.

### Interpolation Modes (`segmentInterpolation.mode`)

`"constant"`, `"linear"`, `"bezier"`, `"sine"`, `"quad"`, `"cubic"`, `"quart"`, `"quint"`, `"expo"`, `"circ"`, `"back"`, `"bounce"`, `"elastic"`

The `direction` field applies to all non-`constant`/`linear`/`bezier` modes: `"auto"`, `"ease_in"`, `"ease_out"`, `"ease_in_out"`. `"auto"` resolves to `ease_in_out` for smooth families.

### Bezier Handles (optional, for `"bezier"` mode)

```jsonc
{
  "leftHandle":  { "dt": -60, "dv": 0 },   // tick and value offset from keyframe
  "rightHandle": { "dt":  60, "dv": 0 },
  "leftHandleType":  "free",  // "free" | "aligned" | "vector" | "auto" | "auto_clamped"
  "rightHandleType": "free"
}
```

### Parameterized Easing (optional, for `"back"` / `"elastic"` modes)

```jsonc
"segmentInterpolation": {
  "mode": "back",
  "direction": "ease_out",
  "params": {
    "overshoot": 1.70158,   // back mode
    "amplitude": 1.0,       // elastic mode
    "period": 0.3           // elastic mode
  }
}
```

---

## `scene.macros`

Macros are named, typed values that can be linked to element properties as a single control.

```jsonc
{
  "macros": {
    "macro_xyz": {
      "name": "Scale",
      "type": "number",        // see Macro Types below
      "value": 1.0,
      "defaultValue": 1.0,
      "options": {
        "min": 0,
        "max": 5,
        "step": 0.01
      },
      "createdAt": 1717459200000,
      "lastModified": 1717459200000
    }
  },
  "macrosOrder": ["macro_xyz"],
  "bindings": {
    "byElement": {
      "elem_abc123": { "scale": true }    // element ID → property key → true
    }
  }
}
```

### Macro Types

`"number"`, `"string"`, `"boolean"`, `"color"`, `"colorAlpha"`, `"select"`, `"file"`, `"file-midi"`, `"file-image"`, `"font"`, `"timelineTrackRef"`, `"assetRef"`

---

## `scene.fontAssets`

Optional. Declares font files used by text elements. Binary data lives in `assets/fonts/`.

```jsonc
{
  "font-asset-id-1": {
    "id": "font-asset-id-1",
    "name": "Inter Regular",
    "mimeType": "font/ttf",
    "byteLength": 123456,
    "hash": "sha256hexhere"
  }
}
```

---

## `timeline`

Contains the playback timeline, tempo map, and track definitions.

```jsonc
{
  "timeline": {
    "id": "timeline-uuid",
    "name": "Main Timeline",
    "globalBpm": 120,
    "beatsPerBar": 4,
    "masterTempoMap": [
      { "tick": 0, "bpm": 120.0 }      // array of { tick, bpm } entries
    ],
    "tempoAutomation": {
      "enabled": false,
      "keyframes": [],
      "laneVisible": false
    }
  },
  "tracks": {
    "track-1": {
      "id": "track-1",
      "name": "Piano",
      "type": "midi",
      "enabled": true,
      "mute": false,
      "solo": false,
      "offsetTicks": 0,
      "regionStartTick": 0,
      "regionEndTick": 3840,
      "midiSourceId": "midi-asset-id-1"
    },
    "track-2": {
      "id": "track-2",
      "name": "Backing",
      "type": "audio",
      "enabled": true,
      "mute": false,
      "solo": false,
      "offsetTicks": 0,
      "sourceId": "audio-asset-id-1"
    }
  },
  "tracksOrder": ["track-1", "track-2"],
  "playbackRange": { "startTick": 0, "endTick": 9600 },
  "playbackRangeUserDefined": false,
  "rowHeight": 48,
  "midiCache": {
    "midi-asset-id-1": {
      "assetId": "midi-asset-id-1",
      "assetRef": "assets/midi/midi-asset-id-1/track.mid",
      "ticksPerQuarter": 480,
      "notes": { "count": 64 }
    }
  },
  "audioFeatureCaches": {},
  "audioFeatureCacheStatus": {}
}
```

The `masterTempoMap` array drives tempo changes over time. If it is absent or empty, `globalBpm` is used as a constant tempo. Entries are sorted ascending by tick.

---

## `assets`

Declares all binary assets and their metadata. Binaries live at the paths in the ZIP described above.

```jsonc
{
  "storage": "zip-package",
  "createdWith": "external-tool/1.0.0",
  "minAppVersion": "0.15.0",
  "audio": {
    "byId": {
      "audio-asset-id-1": {
        "byteLength": 4567890,
        "channels": 2,
        "durationSamples": 220500,
        "durationSeconds": 5.0,
        "filename": "backing.mp3",
        "hash": "sha256hexhere",
        "kind": "original",
        "mimeType": "audio/mpeg",
        "sampleRate": 44100
      }
    }
  },
  "waveforms": {
    "byAudioId": {}
  },
  "fonts": {
    "byId": {}
  },
  "visual": {
    "byId": {
      "visual-asset-id-1": {
        "id": "visual-asset-id-1",
        "byteLength": 98765,
        "hash": "sha256hexhere",
        "mimeType": "image/png",
        "originalFileName": "background.png"
      }
    }
  }
}
```

The `hash` field is a lowercase hex SHA-256 of the raw binary file. MVMNT uses it for deduplication and cache busting; it is required.

---

## `plugins` (optional)

Lists plugins whose element types appear in the scene. If a plugin is embedded in the ZIP under `plugins/`, set `embedded: true`.

```jsonc
[
  {
    "pluginId": "com.example.my-plugin",
    "version": "^1.2.0",        // semver range
    "hash": "sha256hexhere",    // optional; SHA-256 of the embedded bundle
    "elementTypesUsed": ["my-custom-element"],
    "embedded": false
  }
]
```

Built-in element types (e.g. `"audio-spectrum"`, `"audio-waveform"`) do not need a plugin entry.

---

## `references` (optional)

```jsonc
{
  "audioIdMap": {
    "legacy-id": "audio-asset-id-1"
  }
}
```

Used internally for audio ID migration between schema versions. Leave empty or omit for new files.

---

## `visualAssetRegistry` (optional)

Display-order registry for visual assets shown in the UI. Omit if no visual assets are present.

```jsonc
{
  "assets": {
    "visual-asset-id-1": {
      "id": "visual-asset-id-1",
      "name": "Background",
      "filename": "background.png"
    }
  },
  "assetsOrder": ["visual-asset-id-1"]
}
```

---

## `compatibility` (optional)

Forward-compatibility warning messages shown to the user on import.

```jsonc
{
  "warnings": [
    { "message": "This file uses features from MVMNT 2.0 and may not render correctly." }
  ]
}
```

---

## Minimal Valid File

The smallest importable `.mvt` file must contain `document.json` with at minimum:

```json
{
  "schemaVersion": 6,
  "format": "mvmnt.scene",
  "metadata": {
    "id": "00000000-0000-0000-0000-000000000001",
    "name": "Empty Scene",
    "createdAt": "2026-06-04T00:00:00.000Z",
    "modifiedAt": "2026-06-04T00:00:00.000Z",
    "format": "scene"
  },
  "scene": {
    "elements": {},
    "elementsOrder": [],
    "sceneSettings": {
      "fps": 60,
      "width": 1920,
      "height": 1080,
      "tempo": 120,
      "beatsPerBar": 4
    }
  },
  "timeline": {
    "timeline": {
      "id": "tl-1",
      "name": "Main Timeline",
      "globalBpm": 120,
      "beatsPerBar": 4
    },
    "tracks": {},
    "tracksOrder": [],
    "playbackRangeUserDefined": false,
    "rowHeight": 48,
    "midiCache": {}
  },
  "assets": {
    "storage": "zip-package",
    "createdWith": "my-tool/1.0.0",
    "audio": { "byId": {} }
  }
}
```

This produces an importable empty scene with no elements or media.

---

## Implementation Notes

- **JSON key ordering:** Use stable/deterministic JSON serialization (alphabetical or insertion-ordered). MVMNT's importer does not require a specific order, but it aids file diffing.
- **ZIP compression:** Use deflate. Level 6 is MVMNT's default.
- **Asset IDs:** Any unique string works, but UUID (without hyphens) is conventional. IDs must match exactly between the asset record in `assets`, the track's `midiSourceId`/`sourceId`, and the ZIP path.
- **Ticks:** Use MVMNT's canonical 480 PPQ. One bar at 4/4 = 1920 ticks. Be consistent across `masterTempoMap`, keyframe ticks, and track region boundaries.
- **`createdWith`:** Identify your tool name and version here so MVMNT can attribute the origin in diagnostics.
- **Schema versions 2, 4, 5 are readable** by MVMNT but produce legacy import paths. Always write V6.
