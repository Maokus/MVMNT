🧱 Basic Layout Structure
☐ Separate scrollable areas:
☐ Horizontal scroll: time/ruler/track content
☐ Vertical scroll: track list + content
☐ Pinned track labels (scroll vertically)
☐ Pinned ruler (scrolls horizontally)
☐ Track content area (scrolls both)

🔄 Scroll Sync

☐ Sync horizontal scroll between:
☐ Ruler
☐ Track content
☐ Sync vertical scroll between:
☐ Track labels
☐ Track content

📏 Ruler and Grid

☐ Dynamically render tick marks based on zoom level
☐ Show bars, beats, or subdivisions
☐ Snap logic for note/clip movement
☐ Optional: loop region markers

🔍 Zoom & Pan

☐ Zoom with Ctrl + Mouse Wheel or Pinch gesture
☐ Zoom centered on cursor
☐ Panning via scrollbars or dragging
☐ Prevent zooming too far in/out
☐ only zoom on time axis

🎹 Track Content & Clips

☐ Render MIDI notes/clips in correct track row
☐ Position by startTime \* zoom
☐ Width = duration \* zoom
☐ Support overlapping clips/notes

🕒 Playback & Interaction

☐ Show playhead (scrolls or stays centered)
☐ Realtime sync to playback time
☐ Click/drag to select notes
☐ Drag clips to move (with snapping)
☐ Resize clips (drag edges)

🧠 UX Expectations

☐ Allow scroll before time 0 (negative scroll area)
☐ Allow scroll past end (padding or infinite canvas)
☐ Smooth interactions (no jank)
☐ Maintain sync at all times
☐ Hover/tooltip info (note pitch, time, etc.)
