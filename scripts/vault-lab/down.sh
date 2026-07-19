#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"
unset VAULT_LAB_PRIVATE_DIR VAULT_LAB_OVERRIDE
vault_lab_cleanup
