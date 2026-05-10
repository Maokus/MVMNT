Make the neccessary code changes in line with the following comments:

Moving notes piano roll/ Time unit piano roll:

- Change "reference" tab name to "annotation"

Progress display:

- Make right align move the text to the right side and center alignment move the text to the center of the progress bar.

Notes Played Tracker:

- Expand the "events played" to also include any events in the midi file (like cc events).
- Add a tooltip for the format string which explains what symbols are substituted out.

Property consistency audit:

- Ensure the property schemas of ALL builtin elements conform with the idea "parts of an element which are visible by default have colors available to change in appearance>colors. parts of an element which are not visible by default will have their color settings in the group where they are toggled to be visible".
- Ensure appearance tab>appearance group is actually renamed colors group in all builtin elements

System behaviour

- When I make a new default scene with the button in the menu bar, do not create it with the "default" name but instead use the scene name generator to generate a unique scene name.

Additional feature research:

- Check whether the midi ingest pipeline allows for reading MPE data. Write up a document on the midi ingestion capability in thoughts.
