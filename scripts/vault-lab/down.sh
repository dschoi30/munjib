#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"
vault_lab_require_image
vault_lab_cleanup
