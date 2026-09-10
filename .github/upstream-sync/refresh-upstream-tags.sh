#!/usr/bin/env bash
# Rewrites the `upstream_tag` choice lists in upstream-sync.yml (stable upstream
# releases) and neo-nightly.yml (upstream nightlies) with the latest tags, so
# "Run workflow" offers every version as a dropdown. GitHub cannot fill choice
# inputs dynamically; this runs on a schedule and commits the refreshed lists.
# Needs gh with repo read access.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
upstream="${UPSTREAM_REPOSITORY:-pingdotgg/t3code}"
limit="${NEO_TAG_CHOICES:-40}"

releases="$(gh api --paginate "repos/$upstream/releases?per_page=100" \
  --jq '.[] | select(.draft == false) | "\(.prerelease) \(.tag_name)"')"
stable_tags="$(printf '%s\n' "$releases" | awk '$1 == "false" { print $2 }' \
  | { grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' || true; } | head -n "$limit")"
nightly_tags="$(printf '%s\n' "$releases" | awk '$1 == "true" { print $2 }' \
  | { grep -E '^v[0-9]+\.[0-9]+\.[0-9]+-nightly\.[0-9]{8}\.[0-9]+$' || true; } | head -n "$limit")"

[[ -n "$stable_tags" ]] || { echo "refresh: no stable tags found" >&2; exit 1; }

rewrite() {
  # $1 workflow file, $2 newline-separated tags
  python3 - "$1" "$2" <<'EOF'
import re, sys
path, tags = sys.argv[1], sys.argv[2].split()
text = open(path).read()
options = "\n".join(["          - latest"] + [f"          - {t}" for t in tags])
pattern = re.compile(r"(      upstream_tag:\n(?:.*\n)*?        options:\n)((?:          - .*\n)+)")
match = pattern.search(text)
if not match:
    raise SystemExit(f"refresh: could not find the upstream_tag options block in {path}")
new = text[: match.start(2)] + options + "\n" + text[match.end(2):]
if new != text:
    open(path, "w").write(new)
    print(f"refresh: wrote {len(tags)} tags to {path}")
else:
    print(f"refresh: {path} unchanged")
EOF
}

rewrite ".github/workflows/upstream-sync.yml" "$stable_tags"
if [[ -n "$nightly_tags" ]]; then
  rewrite ".github/workflows/neo-nightly.yml" "$nightly_tags"
else
  echo "refresh: no nightly tags found, nightly choices left as they are" >&2
fi
