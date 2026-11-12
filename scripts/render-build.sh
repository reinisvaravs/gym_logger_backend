#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm ci --include=dev
npm run build

# Keep the frontend in its own repository and fetch it only for the build.
rm -rf .render/frontend
mkdir -p .render
git clone --depth 1 --branch "${FRONTEND_BRANCH:-main}" -- \
  "${FRONTEND_REPO_URL:-https://github.com/reinisvaravs/gym_logger_frontend.git}" \
  .render/frontend
git -C .render/frontend rev-parse HEAD
npm ci --include=dev --prefix .render/frontend
npm run build --prefix .render/frontend
