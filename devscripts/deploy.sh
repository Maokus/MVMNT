#!/bin/bash

# Exit immediately if any command fails
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy_common.sh"

deploy_mvmnt "production" "MVMNT" "deployed_main"