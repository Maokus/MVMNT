# Import Order Check: src/animation/note-animations

## base.ts
- All imports already follow the required grouping order.

## debug.ts
- Relative imports (`./base`, `./registry`) run directly after an alias import without a separating newline.
- Suggested order:
  ```ts
  import { Rectangle, RenderObject, Text } from '@core/render/render-objects';

  import { BaseNoteAnimation, type AnimationContext } from './base';
  import { registerAnimation } from './registry';
  ```

## expand.ts
- Relative imports appear before alias imports.
- Suggested order:
  ```ts
  import easingFunctions from '@animation/easing';
  import { Rectangle, RenderObject } from '@core/render/render-objects';

  import { BaseNoteAnimation, type AnimationContext } from './base';
  import { registerAnimation } from './registry';
  ```

## explode.ts
- External dependency (`seedrandom`) is listed after alias and relative imports.
- Alias imports are interleaved with relative imports.
- Suggested order:
  ```ts
  import seedrandom from 'seedrandom';

  import * as af from '@animation/anim-math.js';
  import easingFunctions from '@animation/easing.js';
  import { RenderObject, EmptyRenderObject, Poly, Rectangle, Text } from '@core/render/render-objects';

  import { BaseNoteAnimation, type AnimationContext } from './base.js';
  import { registerAnimation } from './registry.js';
  ```

## fade.ts
- Alias import (`@animation/anim-math.js`) comes after relative imports.
- Suggested order:
  ```ts
  import * as af from '@animation/anim-math.js';
  import easingFunctions from '@animation/easing';
  import { Rectangle, RenderObject } from '@core/render/render-objects';

  import { BaseNoteAnimation, type AnimationContext } from './base';
  import { registerAnimation } from './registry';
  ```

## index.ts
- All imports/exports already comply (no static imports in this file).

## press.ts
- Alias imports (`@animation/...`) are placed after relative imports.
- Suggested order:
  ```ts
  import * as af from '@animation/anim-math';
  import easingFunctions from '@animation/easing';
  import { Text, Rectangle, RenderObject } from '@core/render/render-objects';

  import { BaseNoteAnimation, type AnimationContext } from './base';
  import { registerAnimation } from './registry';
  ```

## registry.ts
- All imports already follow the required grouping order.

## scale.ts
- Alias imports are split by relative imports; alias imports should precede the relative group.
- Suggested order:
  ```ts
  import * as af from '@animation/anim-math';
  import easingFunctions from '@animation/easing';
  import { Rectangle, RenderObject } from '@core/render/render-objects';

  import { BaseNoteAnimation, type AnimationContext } from './base';
  import { registerAnimation } from './registry';
  ```

## slide.ts
- Relative imports follow alias imports without an empty line separating the groups.
- Suggested order:
  ```ts
  import { Rectangle, RenderObject } from '@core/render/render-objects';
  import * as af from '@animation/anim-math.js';
  import easingFunctions from '@animation/easing';

  import { BaseNoteAnimation, type AnimationContext } from './base';
  import { registerAnimation } from './registry';
  ```

## template.ts
- External dependency (`seedrandom`) is placed after alias and relative imports.
- Relative imports are mixed into the alias group.
- Suggested order:
  ```ts
  import seedrandom from 'seedrandom';

  import * as af from '@animation/anim-math';
  import easingFunctions from '@animation/easing';
  import { Text, Rectangle, RenderObject } from '@core/render/render-objects';

  import { BaseNoteAnimation, type AnimationContext } from './base';
  import { registerAnimation } from './registry';
  ```

# Import Order Check: src/core/timing

## __tests__/bbt.test.ts
- Relative import (`../bbt`) directly follows an external dependency without a separating newline.
- Suggested order:
  ```ts
  import { describe, it, expect } from 'vitest';

  import { formatTickAsBBT, parseBBT, getBeatGridInTicks, DEFAULT_TICKS_PER_QUARTER } from '../bbt';
  ```

## __tests__/note-query.test.ts
- External dependency, alias imports, and relative import are not separated by blank lines.
- Suggested order:
  ```ts
  import { describe, it, expect, beforeEach } from 'vitest';

  import { useTimelineStore } from '@state/timelineStore';
  import { CANONICAL_PPQ } from '@core/timing/ppq';

  import { noteQueryApi } from '../note-query';
  ```

## __tests__/tempo-mapper.service.test.ts
- All imports already follow the required grouping order.

## __tests__/tempo-utils.phase0.test.ts
- Relative imports (`../tempo-utils`, `../types`) follow an external dependency without a separating newline.
- Suggested order:
  ```ts
  import { describe, it, expect } from 'vitest';

  import { beatsToSeconds, secondsToBeats } from '../tempo-utils';
  import type { TempoMapEntry } from '../types';
  ```

## __tests__/time-domain.conversions.test.ts
- Alias and relative imports are not separated from the external dependency by blank lines.
- Suggested order:
  ```ts
  import { describe, it, expect } from 'vitest';

  import { CANONICAL_PPQ } from '@core/timing/ppq';

  import { TimingManager } from '../timing-manager';
  ```

## __tests__/timeline-mapping.test.ts
- Alias imports are not separated from the external dependency by a blank line.
- Suggested order:
  ```ts
  import { describe, it, expect } from 'vitest';

  import {
      noteQueryApi,
      trackBeatsToTimelineSeconds,
      timelineToTrackSeconds,
      timelineSecondsToTrackBeats,
  } from '@core/timing/note-query';
  import { useTimelineStore } from '@state/timelineStore';
  import { CANONICAL_PPQ } from '@core/timing/ppq';
  import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
  import type { MIDIData, MIDIEvent } from '@core/types';
  ```

## __tests__/timeline-phase5.test.ts
- Alias imports are not separated from the external dependency by a blank line.
- Suggested order:
  ```ts
  import { describe, it, expect } from 'vitest';

  import { noteQueryApi } from '@core/timing/note-query';
  import { CANONICAL_PPQ } from '@core/timing/ppq';
  import { useTimelineStore } from '@state/timelineStore';
  import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
  import type { MIDIData, MIDIEvent } from '@core/types';
  ```

## __tests__/timeline-service.test.ts
- Alias imports are not separated from the external dependency by a blank line.
- Suggested order:
  ```ts
  import { describe, it, expect } from 'vitest';

  import { CANONICAL_PPQ } from '@core/timing/ppq';
  import { noteQueryApi } from '@core/timing/note-query';
  import { useTimelineStore } from '@state/timelineStore';
  import { buildNotesFromMIDI } from '@core/midi/midi-ingest';
  import type { MIDIData, MIDIEvent } from '@core/types';
  ```

## __tests__/timing-manager.test.ts
- Alias import (`@core/timing`) follows the external dependency without a blank line.
- Suggested order:
  ```ts
  import { describe, it, expect } from 'vitest';

  import { TimingManager, TempoMapEntry } from '@core/timing';
  ```

## debug-tools.ts
- Relative imports follow an alias import without a separating newline.
- Suggested order:
  ```ts
  import { useTimelineStore } from '@state/timelineStore';

  import type { TempoMapEntry } from './types';
  import { TimingManager } from './timing-manager';
  import { secondsToBeats, beatsToSeconds } from './tempo-utils';
  ```

## index.ts
- All exports/imports already comply (no static imports in this file).

## note-query.ts
- Relative imports follow an alias import without a separating newline.
- Suggested order:
  ```ts
  import type { TimelineState, TimelineTrack } from '@state/timelineStore';

  import type { TempoMapEntry } from './types';
  import { beatsToSeconds, secondsToBeats } from './tempo-utils';
  import { CANONICAL_PPQ } from './ppq';
  ```

## offset-utils.ts
- All imports already follow the required grouping order.

## playback-clock.ts
- All imports already follow the required grouping order.

## ppq.ts
- No imports in this file.

## tempo-mapper.ts
- All imports already follow the required grouping order.

## tempo-utils.ts
- All imports already follow the required grouping order.

## time-domain.ts
- No imports in this file.

## timing-manager.ts
- All imports already follow the required grouping order.

## types.ts
- No imports in this file.
