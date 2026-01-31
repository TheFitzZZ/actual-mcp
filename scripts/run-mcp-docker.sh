#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.test}"
IMAGE_NAME="${2:-actual-mcp-local}"
PORT="${MCP_PORT:-3000}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

docker build -t "$IMAGE_NAME" .

DOCKER_ARGS=(
  run
  --rm
  -i
  -p "${PORT}:3000"
  --env-file "$ENV_FILE"
  "$IMAGE_NAME"
  --sse
  --enable-write
)

BEARER_TOKEN_VALUE=$(grep -E '^BEARER_TOKEN=' "$ENV_FILE" | sed 's/^BEARER_TOKEN=//' || true)
if [[ -n "$BEARER_TOKEN_VALUE" ]]; then
  DOCKER_ARGS+=(--enable-bearer)
fi

docker "${DOCKER_ARGS[@]}"
