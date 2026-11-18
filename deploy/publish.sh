#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (GitHub Pages: Deploy from branch → gh-pages / root).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
touch dist/.nojekyll
cp dist/index.html dist/404.html
REMOTE=$(git remote get-url origin)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="Jiya Singh" -c user.email="151902492+JiyaSingh18@users.noreply.github.com" commit -qm "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git push -f "$REMOTE" gh-pages
rm -rf .git
