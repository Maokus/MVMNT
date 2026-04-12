#!/bin/bash

# Exit immediately if any command fails
set -e

# Compute paths relative to this script — no hardcoded user paths needed.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MVMNT_PATH="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_FOLDER="$MVMNT_PATH/build"
DEPLOYED_FILE="$SCRIPT_DIR/deployed_versions.txt"

# PROFILE_SITE_PATH: the Hugo site that MVMNT is deployed into.
# Defaults to a sibling layout (../../MISC/HugoProfileSite relative to this repo),
# but can be overridden via environment variable before running the script:
#   export PROFILE_SITE_PATH=/path/to/your/hugo/site
if [ -z "$PROFILE_SITE_PATH" ]; then
	PROFILE_SITE_PATH="$(cd "$MVMNT_PATH/../../MISC/HugoProfileSite" 2>/dev/null && pwd || true)"
fi

if [ -z "$PROFILE_SITE_PATH" ] || [ ! -d "$PROFILE_SITE_PATH" ]; then
	echo "Error: Could not locate the Hugo profile site."
	echo "Set PROFILE_SITE_PATH before running:"
	echo "  export PROFILE_SITE_PATH=/path/to/your/hugo/site"
	exit 1
fi

update_deployed_version() {
	local key="$1"
	local hash="$2"
	if [ -f "$DEPLOYED_FILE" ]; then
		if grep -q "^$key=" "$DEPLOYED_FILE"; then
			local tmp_file
			tmp_file=$(mktemp)
			awk -v key="$key" -v hash="$hash" 'BEGIN{FS=OFS="="} $1==key {$2=hash} {print}' "$DEPLOYED_FILE" > "$tmp_file"
			mv "$tmp_file" "$DEPLOYED_FILE"
		else
			printf "%s=%s\n" "$key" "$hash" >> "$DEPLOYED_FILE"
		fi
	else
		printf "%s=%s\n" "$key" "$hash" > "$DEPLOYED_FILE"
	fi
}

deploy_mvmnt() {
	local mode="$1"
	local target_suffix="$2"
	local deployed_key="$3"

	echo "🔨 Building MVMNT project..."
	cd "$MVMNT_PATH"
	local current_hash
	current_hash=$(git rev-parse HEAD)
	npm run build -- --mode "$mode"

	local target_folder="$PROFILE_SITE_PATH/static/playbox/projects/$target_suffix"

	echo "🧹 Removing old MVMNT static files..."
	echo "placeholder: $target_folder"
	rm -rf "$target_folder"

	echo "📦 Copying new build to Hugo site..."
	echo "placeholder: $BUILD_FOLDER"
	mkdir -p "$target_folder"
	cp -R "$BUILD_FOLDER/" "$target_folder"

	echo "🌐 Building Hugo site..."
	cd "$PROFILE_SITE_PATH"
	hugo

	echo "🚀 Deploying site..."
	./sc deploy

	echo "📝 Recording deployed commit hash..."
	update_deployed_version "$deployed_key" "$current_hash"

	echo "✅ Done!"
}
