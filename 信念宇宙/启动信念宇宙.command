#!/bin/zsh
set -euo pipefail

project_dir=${0:A:h}
bundled_root="/Users/lcmaimac/.cache/codex-runtimes/codex-primary-runtime/dependencies"
bundled_node="$bundled_root/node/bin/node"
bundled_pnpm="$bundled_root/bin/fallback/pnpm"

if [[ -x "$bundled_node" ]]; then
  node_executable="$bundled_node"
else
  node_executable=$(command -v node || true)
fi

if [[ -z "${node_executable:-}" ]]; then
  print -u2 "未找到 Node.js 22 或更新版本。请先在 Codex 中重新打开此项目，或安装 Node.js。"
  read -r "?按回车关闭…"
  exit 1
fi

cd "$project_dir"

if [[ ! -d node_modules ]]; then
  if [[ -x "$bundled_pnpm" ]]; then
    "$bundled_pnpm" install --frozen-lockfile
  else
    print -u2 "依赖尚未安装，且未找到 Codex 自带 pnpm。"
    read -r "?按回车关闭…"
    exit 1
  fi
fi

exec "$node_executable" "$project_dir/scripts/start-local.mjs"
