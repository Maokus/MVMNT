## 🎛 UX Flow: Audio-Reactive Elements (ARE)

### 1. **Adding Audio to the Scene**

-   **Action:** The user imports or drags an audio track into the timeline.
-   **Result:** The audio track lane appears in the timeline, showing waveform and playback alignment.
-   **System State:**

    -   No _Audio-Reactive Elements (AREs)_ are present.
    -   Therefore, **no feature analyses** are required yet.
    -   The track’s status chip reads: **“Analyzed”** (if analysis cache exists) or **“Idle”** (if not needed).

---

### 2. **Adding an Audio-Reactive Element**

-   **Action:** The user adds a new ARE from the element list (e.g., “Oscilloscope”, “Spectrum”).
-   **Result:**

    -   The ARE is added to the scene graph/element list.
    -   The properties panel for the ARE becomes active.

---

### 3. **Assigning an Audio Source**

-   **Action:**

    -   In the ARE’s properties, the user selects an audio source via a dropdown similar to MIDI input assignment.
    -   The dropdown lists all available audio tracks in the scene.

-   **Result:**

    -   Once an audio source is assigned, the system checks which **audio features** (e.g., RMS, spectrogram) the ARE needs for its behavior.
    -   If one or more required feature tracks are missing, the system triggers a **notice**.

---

### 4. **Feature Analysis Notice & Prompt**

-   **Notice:**

    -   Appears in the **bottom-left corner** of the UI:

        > “<Audiotrack>/<Feature Name>, <Audiotrack>/<Feature Name>, etc analysis required. Analyse?”

    -   Includes a button: **[Analyse]**

-   **Visual Feedback:**

    -   The status chip on the corresponding audio track changes from **“Analyzed” → “Pending”**.
    -   Hovering over it shows which features are pending analysis.
    -   The analyse button triggers all pending analyses

-   **Action:**

    -   Clicking **Analyse** runs the required feature track calculations in the background.

---

### 5. **Monitoring Analysis Progress**

-   **Primary View:**

    -   Progress bar appears directly on the audio track lanes (no change from current)

-   **Secondary View – “Caches” Tab:**

    -   Located in **Scene Settings → Caches**.
    -   Lists all analyzed feature tracks (e.g., “Track 1 → Spectral Flux”).
    -   Shows status: _Analyzed_, _Pending_, _Outdated_.
    -   Displays progress percentage for each running analysis.

---

### 6. **Tweaking Analysis Parameters**

-   **Action:**

    -   Inside the **Caches tab**, the user can tweak parameters that affect analysis results (e.g., FFT window size, hop length, smoothing).

-   **System Behavior:**

    -   Changing any parameter **does not immediately re-run analysis**.
    -   Instead, the affected analyses are flagged as **“Pending”**, and a new notice appears:

        > “Analysis parameters changed. Re-analysis required.”

    -   Includes a **[Analyse]** button that triggers all pending recalculations at once.

---

### 7. **Internal Feature Dependency Management**

-   **Concept:**

    -   The user never manually selects which feature tracks an ARE depends on.
    -   Instead, the ARE’s internal logic requests the appropriate features based on high-level user selections (e.g., "mode": "mid/side", "channel": "mono", etc).

-   **UX Benefit:**

    -   Simplifies setup, making the ARE behave intelligently without requiring deep technical knowledge of feature extraction.
    -   Keeps the property interface clean and intuitive.

---

### 8. **Visual & Style Consistency**

-   **Guideline:**

    -   Controls related to audio features should **not have differentiated or special “audio binding” styles**.
    -   All controls retain the same design language as other reactive element controls for consistency.
    -   Audio-based linking or responsiveness should be implied through behavior (e.g., live visual response) rather than unique UI decoration.

---

### 9. **Final thoughts**

-   less performance heavy calculations (like the conversion from L/R channels to M/S channels) should be done within the scene element rather than by creating a new feature track
-   Analysed features could have their own return types to reduce clutter (rather than having the spectrogram return 1024 channels, it could return one SpectrogramFrame object that has numBins and a data array).
-   Ensure the developer interface for scene element developers is also intuitive.
-   add explicit UI feedback (“Analysis failed — Retry / View log”).
-   Multi source AREs are currently out of scope, there is no need to worry about them.
