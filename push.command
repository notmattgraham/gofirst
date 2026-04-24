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
      commit -m "Update app icon and header logo"
fi

echo ""
echo "Remote:  $(git remote get-url origin 2>/dev/null || echo '(not set)')"
echo ""
echo "Force-pushing local main..."
if git push -u origin main --force 2>&1; then
  echo ""
  echo "✓ Pushed. Railway should redeploy in ~30s."
  osascript -e 'display notification "Pushed to GitHub. Railway will redeploy." with title "GoFirst"' 2>/dev/null
else
  echo ""
  echo "✗ Push failed. Try 'gh auth login' in Terminal, or check SSH keys / keychain."
  osascript -e 'display dialog "Push failed — see Terminal for details." with title "GoFirst push" buttons {"OK"} with icon stop' 2>/dev/null
fi

echo ""
read -n 1 -p "Press any key to close this window..."
