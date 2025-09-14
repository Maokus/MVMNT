Whenever you run a command in the terminal, pipe the output to a file, output.txt, that you can read from. Make sure to overwrite each time so that it doesn't grow too big. There is a bug in the current version of Copilot that causes it to not read the output of commands correctly. This workaround allows you to read the output from the temporary file instead.

When you want to run npm test or npm build, use the vscode tasks defined in .vscode/tasks.json. This ensures that the output is captured correctly and can be read by Copilot.
