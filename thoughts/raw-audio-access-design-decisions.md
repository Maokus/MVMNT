1. Option A
2. The raw API should enforce a maximum returned sample count. It should not silently downsample. If callers need fewer points than the raw window contains, they should either request a smaller window, use a dedicated helper such as getRmsInWindow, or use the calculator/cache pipeline.
3. Option A
4. Go with recommendation
5. audio-waveform should not drop the feature requirement, as for large window sizes the waveform calculated feature is still relevant. However, for small window sizes, it should instead swap to directly reading sample data for more accuracy. audio-volume-meter should drop the feature requirement, as getting the rms in window should be done by a helper function rather than by a calculator. The RMS calculator should also be removed. Still keep the feature pipeline in general.
6. Include getRMSInWindow.
7. Go with recommendation
