#!/bin/sh
# Install git hooks from scripts/githooks/ into .git/hooks/

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOKS_DIR="$REPO_ROOT/scripts/githooks"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"

for hook in "$HOOKS_DIR"/*; do
    name=$(basename "$hook")
    cp "$hook" "$GIT_HOOKS_DIR/$name"
    chmod +x "$GIT_HOOKS_DIR/$name"
    echo "Installed: $name"
done

echo "Git hooks installed."
