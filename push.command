#!/bin/bash
cd "$HOME/Documents/Claude/Projects/GoFirstApp" || exit 1

echo "=== GoFirst push — $(date) ==="
echo ""

rm -f .git/*.lock 2>/dev/null

# Make sure everything is committed
git add -A
if ! git diff --cached --quiet 2>/dev/null; then
  git -c user.email=notmattgraham@gmail.com -c user.name="Matt Graham" \
      commit -m "Wire up backend + auth" || true
fi

# Set origin if missing
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin https://github.com/notmattgraham/gofirst.git
  echo "Added remote: $(git remote get-url origin)"
else
  CURRENT=$(git remote get-url origin)
  echo "Origin already set: $CURRENT"
fi

echo ""
echo "Pushing to origin/main..."
if git push -u origin main 2>&1; then
  echo ""
  echo "✓ Pushed. Railway should redeploy in ~30s."
  osascript -e 'display notification "Pushed to GitHub. Railway will redeploy." with title "GoFirst"' 2>/dev/null
else
  echo ""
  echo "✗ Push failed. Most common cause: auth."
  echo "  Try running 'gh auth login' in Terminal, or check your SSH keys."
  osascript -e 'display dialog "Push failed — see Terminal for details." with title "GoFirst push" buttons {"OK"} with icon stop' 2>/dev/null
fi

echo ""
read -n 1 -p "Press any key to close this window..."
