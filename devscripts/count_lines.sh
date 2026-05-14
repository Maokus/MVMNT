#!/bin/bash

# Set the directory to scan - default to src/ or use provided argument
PROJECT_DIR="${1:-src}"

# Check if directory exists
if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: Directory '$PROJECT_DIR' does not exist."
  exit 1
fi

# File extensions to include (you can modify this list)
INCLUDE_EXTENSIONS=("*.c" "*.cpp" "*.h" "*.hpp" "*.py" "*.js" "*.jsx" "*.ts" "*.tsx" "*.java" "*.rb" "*.go" "*.sh" "*.php")

# Directories to exclude (optional)
EXCLUDE_DIRS=("node_modules" ".git" "vendor" "dist" "build")

# Build the find command
FIND_CMD=(find "$PROJECT_DIR")

# Include file types
FIND_CMD+=(
  \( 
)
for ext in "${INCLUDE_EXTENSIONS[@]}"; do
  FIND_CMD+=(-name "$ext" -o)
done
unset 'FIND_CMD[${#FIND_CMD[@]}-1]' # Remove last -o
FIND_CMD+=(\))

# Exclude specific directories
for dir in "${EXCLUDE_DIRS[@]}"; do
  FIND_CMD+=(-not -path "*/$dir/*")
done

# Run the command and count lines
echo "Counting lines of code in: $PROJECT_DIR"
echo "Including file types: ${INCLUDE_EXTENSIONS[*]}"
echo "Excluding directories: ${EXCLUDE_DIRS[*]}"

TOTAL_LINES=0
while IFS= read -r file; do
  FILE_LINES=$(wc -l < "$file")
  TOTAL_LINES=$((TOTAL_LINES + FILE_LINES))
done < <("${FIND_CMD[@]}")

echo "-----------------------------------"
echo "Total lines of code: $TOTAL_LINES"