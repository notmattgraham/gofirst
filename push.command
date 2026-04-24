#!/bin/bash
cd "$HOME/Documents/Claude/Projects/GoFirstApp" || exit 1

echo "=== GoFirst push — $(date) ==="
echo ""

rm -f .git/*.lock 2>/dev/null

echo "Staging changes..."
git add -A

if git diff --cached --quiet 2>/dev/null; then
  echo "(nothing new to commit)"
else
  echo "Committing..."
  git -c user.email=notmattgraham@gmail.com -c user.name="Matt Graham" \
      commit -m "Add Express backend, Google OAuth, Postgres, cloud-synced tasks + streaks"
fi

# Resolve the GitHub remote if we don't have one yet.
if ! git remote get-url origin >/dev/null 2>&1; then
  echo ""
  echo "No origin remote configured. Trying to find your gofirst repo..."

  FOUND=""
  if command -v gh >/dev/null 2>&1; then
    GH_USER=$(gh api user --jq .login 2>/dev/null)
    if [ -n "$GH_USER" ]; then
      for name in gofirst GoFirst GoFirstApp gofirst-app; do
        if gh repo view "$GH_USER/$name" >/dev/null 2>&1; then
          FOUND="https://github.com/$GH_USER/$name.git"
          echo "  Found via gh CLI: $FOUND"
          break
        fi
      done
    fi
  fi

  if [ -z "$FOUND" ]; then
    URL=$(osascript -e 'display dialog "Paste the GitHub URL for your gofirst repo (e.g. https://github.com/you/gofirst.git):" default answer "" with title "GoFirst push" with icon note' -e 'text returned of result' 2>/dev/null)
    if [ -z "$URL" ]; then
      echo "Aborted — no URL provided."
      read -n 1 -p "Press any key to close..."
      exit 1
    fi
    FOUND="$URL"
  fi

  git remote add origin "$FOUND"
fi

echo ""
echo "Remote: $(git remote get-url origin)"
echo ""
echo "Pushing to origin/main..."
if git push -u origin main 2>&1; then
  echo ""
  echo "✓ Pushed. Railway should pick it up in ~30s."
  osascript -e 'display notification "Pushed to GitHub. Railway will redeploy." with title "GoFirst"' 2>/dev/null
else
  echo ""
  echo "✗ Push failed. If it says auth is required, run 'gh auth login' in Terminal first, then re-run this script."
  osascript -e 'display dialog "Push failed — see Terminal for details." with title "GoFirst push" buttons {"OK"} with icon stop' 2>/dev/null
fi

echo ""
read -n 1 -p "Press any key to close this window..."
