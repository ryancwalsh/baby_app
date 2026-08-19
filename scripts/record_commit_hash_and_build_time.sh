#!/bin/bash


# Remember to add to "scripts" in `package.json`: 
#   "postbuild": "yarn record_commit_hash_and_build_time",
#   "record_commit_hash_and_build_time": "./scripts/record_commit_hash_and_build_time.sh",
# Or, depending on your Yarn version, omit the postbuild script and append this to your build script: ` && yarn record_commit_hash_and_build_time`.
# Remember `chmod +x ./scripts/record_commit_hash_and_build_time.sh`.
# Remember to add 'public/version.json' to `.gitignore` and `.prettierignore`.


# Make errors visible and fail fast:
set -euo pipefail

now=$(date -u +"%Y-%m-%d %H:%M:%S")
current_branch=$(git branch --show-current)
last_commit=$(git rev-parse HEAD)

cat > public/version.json <<EOF
{
  "branch": "$current_branch",
  "commit": "$last_commit",
  "build_time_UTC": "$now"
}
EOF

yarn eslint --fix public/version.json

echo "✅ public/version.json generated successfully."
