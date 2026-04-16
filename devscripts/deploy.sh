#!/bin/bash

# Exit immediately if any command fails
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy_common.sh"

# Confirmation guard for production deployment
echo "⚠️  WARNING: You are about to deploy to PRODUCTION"
read -p "Type 'yes' to confirm: " confirmation
if [[ "$confirmation" != "yes" ]]; then
  echo "Deployment cancelled."
  exit 1
fi

deploy_mvmnt "production" "MVMNT" "deployed_main"