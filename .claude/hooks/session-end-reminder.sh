#!/usr/bin/env bash
# Fires on Stop — reminds about doc sync if code changed but docs didn't.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

if git rev-parse --git-dir >/dev/null 2>&1; then
  changed=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
  docs_changed=$(git status --porcelain 2>/dev/null | grep -cE 'CLAUDE\.md|docs/|specs/' || true)
  if [ "$changed" -gt 0 ] && [ "$docs_changed" -eq 0 ]; then
    echo "[hook] Uncommitted changes exist but no docs/specs were updated. Run /end-session (coordinator + commit) before closing."
  fi
fi
exit 0
