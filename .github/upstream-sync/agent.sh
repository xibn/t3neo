#!/usr/bin/env bash
# The T3 Neo agent loop: Claude Code implements a task, verification and an
# automated review gate it, and a final approval pass decides whether the
# change may ship. Used by the upstream sync (task = reapply the features)
# and by the issue automation (task = fix a bug / build a feature).
#
#   agent.sh reapply   reapply FEATURE.md onto the checked-out upstream release
#   agent.sh issue     implement the issue described in $NEO_ISSUE_FILE
#
# Stages, each logged to $NEO_LOG_DIR:
#   1. implement   Claude Code works until verify.sh exits 0 (up to $NEO_MAX_ATTEMPTS)
#   2. review      a fresh Claude Code session reviews the diff and writes findings
#   3. fix         findings marked must-fix go back to Claude Code (up to $NEO_MAX_REVIEW_ROUNDS)
#   4. approve     a fresh session reads diff + review and prints APPROVED or REJECTED
# Every stage commits with a conventional title under 50 characters.
#
# Environment:
#   NEO_MODE               sync (default) | redo         (reapply only)
#   NEO_NOTES              free text from the maintainer or the issue
#   NEO_ISSUE_FILE         markdown with the issue (issue mode)
#   NEO_ISSUE_KIND         fix | feature                   (issue mode)
#   NEO_BASE_SHA           commit the task starts from (diffs and resets use it)
#   UPSTREAM_TAG           upstream tag being worked on (for prompts)
#   CLAUDE_MODEL           defaults to claude-fable-5-1
#   NEO_MAX_ATTEMPTS       implement attempts, default 3
#   NEO_MAX_REVIEW_ROUNDS  review/fix rounds, default 2
#   NEO_LOG_DIR            prompts, transcripts, verify logs, review, verdict
#   ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN for Claude Code auth
set -euo pipefail

task="${1:-reapply}"
root="$(git rev-parse --show-toplevel)"
cd "$root"
auto=".github/upstream-sync"
mode="${NEO_MODE:-sync}"
notes="${NEO_NOTES:-}"
model="${CLAUDE_MODEL:-claude-fable-5-1}"
max_attempts="${NEO_MAX_ATTEMPTS:-3}"
max_review_rounds="${NEO_MAX_REVIEW_ROUNDS:-2}"
log_dir="${NEO_LOG_DIR:-${RUNNER_TEMP:-/tmp}/neo-agent}"
base_sha="${NEO_BASE_SHA:-$(git rev-parse HEAD)}"
mkdir -p "$log_dir"

if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
  echo "agent: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN" >&2
  exit 2
fi
command -v claude >/dev/null || {
  echo "agent: claude CLI not found (npm install -g @anthropic-ai/claude-code)" >&2
  exit 2
}

git config user.name >/dev/null 2>&1 || git config user.name "t3neo[bot]"
git config user.email >/dev/null 2>&1 || git config user.email "t3neo@users.noreply.github.com"

run_claude() {
  # $1 label, $2 prompt file, $3 max turns, $4.. extra args
  local label="$1" prompt_file="$2" max_turns="$3"
  shift 3
  echo "agent: claude ($label) with $model"
  set +e
  claude -p "$(cat "$prompt_file")" \
    --model "$model" \
    --dangerously-skip-permissions \
    --max-turns "$max_turns" \
    --output-format text \
    "$@" \
    >"$log_dir/claude-$label.log" 2>&1
  local code=$?
  set -e
  echo "agent: claude ($label) exited with $code"
  tail -n 30 "$log_dir/claude-$label.log" || true
  return 0
}

# Claude is told not to commit; fold anything it committed back into the
# working tree so this script owns history and the commit messages.
undo_agent_commits() {
  if [[ -n "$(git log --oneline "$base_sha"..HEAD 2>/dev/null)" ]]; then
    git reset --soft "$base_sha"
  fi
}

commit_all() {
  # $1 title (< 50 chars), $2 body
  git add -A
  if git diff --cached --quiet; then
    echo "agent: nothing to commit for '$1'"
    return 0
  fi
  git commit -q -m "$1" -m "$2"
  echo "agent: committed '$1'"
}

rules() {
  cat <<EOF
Rules:
- Follow AGENTS.md. Keep changes minimal and inside the surfaces the task names.
- Do not commit, do not push, do not create branches. Leave changes in the working tree.
- Under ${auto} edit only FEATURE.md and verify.sh, and only as the task says; never edit
  .github/workflows/*.yml or feature.patch.
- Do not run repo-wide checks. Verify with: bash ${auto}/verify.sh
- Finish only when 'bash ${auto}/verify.sh' exits 0. Then reply with a short summary of what you
  changed and anything the maintainer should know.
EOF
}

task_description() {
  case "$task" in
    reapply)
      cat <<EOF
You are working in T3 Neo, a fork of T3 Code that carries a set of extra features (queued
messages, the Neo look, T3 Neo branding, pets, usage badges, a Neo settings tab, and whatever
else the specification lists). The repository was just hard-reset to upstream release
${UPSTREAM_TAG:-<unknown>}, so the features are missing (or partially present from an automatic
patch) and you must bring them back.

Mode: ${mode}
$(if [[ "$mode" == "redo" ]]; then
  echo "The maintainer reports the previous implementation was broken and asked for a fresh"
  echo "implementation from the specification. Read the previous implementation in"
  echo "${auto}/feature.patch only as a reference for where things live; do not trust it."
else
  echo "Previous implementation patch: ${patch_status:-not attempted}."
  echo "If it applied cleanly, review it against upstream's current code and the spec, fix"
  echo "anything that no longer fits, and make verification pass. If it conflicted, resolve every"
  echo "conflict marker and unmerged path first. The patch is the previous release's"
  echo "implementation: use it as the template and copy its approach wherever it still fits."
fi)

Specification (authoritative):
------------------------------
$(cat "$auto/FEATURE.md")
------------------------------
EOF
      ;;
    issue)
      cat <<EOF
You are working in T3 Neo, a fork of T3 Code (upstream release ${UPSTREAM_TAG:-<unknown>}) that
carries a set of extra features. Their specification is ${auto}/FEATURE.md; read it first so you
know what already exists and how it is built. The repository is checked out on the release
branch this issue targets, with every feature already applied.

Task kind: ${NEO_ISSUE_KIND:-fix}
$(if [[ "${NEO_ISSUE_KIND:-fix}" == "feature" ]]; then
  echo "Implement the requested feature. When it is done, describe it in ${auto}/FEATURE.md"
  echo "(behavior, surfaces, tests) in the same style as the existing features, so the next"
  echo "upstream sync reapplies it. Extend ${auto}/verify.sh with the new files and tests."
else
  echo "Fix the reported bug. Reproduce it from the report first (a failing test where the"
  echo "logic allows one), then fix the cause, not the symptom. Every fix must carry its own"
  echo "proof into the next upstream sync, because main is reset to upstream and rebuilt from"
  echo "${auto}/FEATURE.md and verify.sh: add a regression check to ${auto}/verify.sh (the"
  echo "test file in its 'vp test run' list, or a require_grep on the hook the fix depends on)"
  echo "and list the fix as a numbered item under 'Feature 6: carried fixes' in"
  echo "${auto}/FEATURE.md (one paragraph: symptom, cause, where the fix lives, its test)."
  echo "If the bug is in a fork feature, correct that feature's spec instead when it was wrong."
fi)

The issue:
------------------------------
$(cat "${NEO_ISSUE_FILE:?NEO_ISSUE_FILE is required in issue mode}")
------------------------------
EOF
      ;;
    *)
      echo "agent: unknown task '$task'" >&2
      exit 2
      ;;
  esac
}

# ---------------------------------------------------------------------------
# Stage 0 (reapply only): previous implementation as a starting point.
# ---------------------------------------------------------------------------
patch_status=""
if [[ "$task" == "reapply" ]]; then
  patch_status="not attempted (redo mode starts from the spec)"
  if [[ "$mode" != "redo" && -s "$auto/feature.patch" ]]; then
    if git apply --3way --index "$auto/feature.patch" >"$log_dir/patch.log" 2>&1; then
      patch_status="applied cleanly"
    else
      patch_status="applied with conflicts; see 'git status' and conflict markers"
    fi
    echo "agent: feature.patch $patch_status"
    git status --short | head -100
  elif [[ "$mode" != "redo" ]]; then
    patch_status="no feature.patch available"
  fi
fi

# ---------------------------------------------------------------------------
# Stage 1: implement until verification passes.
# ---------------------------------------------------------------------------
verify_output=""
attempt=1
while :; do
  prompt_file="$log_dir/prompt-implement-$attempt.md"
  {
    task_description
    echo
    if [[ -n "$notes" ]]; then
      echo "Notes from the maintainer or reporter:"
      echo "$notes"
      echo
    fi
    rules
    if [[ -n "$verify_output" ]]; then
      echo
      echo "Attempt ${attempt}: the previous attempt left verification failing. Output (tail):"
      echo '```'
      echo "$verify_output"
      echo '```'
      echo "Fix the cause, then re-run verification."
    fi
  } >"$prompt_file"
  echo "agent: implement attempt $attempt/$max_attempts"
  run_claude "implement-$attempt" "$prompt_file" 400
  undo_agent_commits
  set +e
  bash "$auto/verify.sh" >"$log_dir/verify-implement-$attempt.log" 2>&1
  verify_exit=$?
  set -e
  if [[ $verify_exit -eq 0 ]]; then
    echo "agent: verification passed on attempt $attempt"
    break
  fi
  echo "agent: verification failed on attempt $attempt"
  tail -n 60 "$log_dir/verify-implement-$attempt.log" || true
  if (( attempt >= max_attempts )); then
    echo "agent: giving up after $attempt implement attempts" >&2
    echo "REJECTED: verification never passed" >"$log_dir/verdict.txt"
    exit 1
  fi
  verify_output="$(tail -c 12000 "$log_dir/verify-implement-$attempt.log")"
  attempt=$((attempt + 1))
done

case "$task" in
  reapply)
    commit_all "feat: reapply T3 Neo features" \
      "Reapplied onto upstream ${UPSTREAM_TAG:-unknown} in $mode mode by Claude Code ($model)."
    ;;
  issue)
    if [[ "${NEO_ISSUE_KIND:-fix}" == "feature" ]]; then
      commit_all "feat: ${NEO_COMMIT_SUBJECT:-implement requested feature}" \
        "Built by Claude Code ($model) from issue #${NEO_ISSUE_NUMBER:-?}."
    else
      commit_all "fix: ${NEO_COMMIT_SUBJECT:-resolve reported bug}" \
        "Fixed by Claude Code ($model) from issue #${NEO_ISSUE_NUMBER:-?}."
    fi
    ;;
esac

# ---------------------------------------------------------------------------
# Stage 2 + 3: review, then fix must-fix findings, a bounded number of rounds.
# ---------------------------------------------------------------------------
review_round=1
while :; do
  git diff "$base_sha" HEAD --stat >"$log_dir/diff-stat-$review_round.txt"
  git diff "$base_sha" HEAD -- . ':(exclude)*.patch' ':(exclude)*.png' ':(exclude)*.ico' \
    >"$log_dir/diff-$review_round.patch"
  review_prompt="$log_dir/prompt-review-$review_round.md"
  {
    cat <<EOF
You are the code reviewer for T3 Neo, a fork of T3 Code. Another Claude Code session just
changed the repository; review its work with fresh eyes. Read AGENTS.md for the project's
standards. The specification of the fork features is ${auto}/FEATURE.md.

The change to review is the diff between ${base_sha} and HEAD. Run:
  git diff ${base_sha} HEAD --stat
  git diff ${base_sha} HEAD -- <files>
and read any file you need. Do not modify files. Do not run repo-wide checks.

Task the change was meant to accomplish:
$(if [[ "$task" == "reapply" ]]; then echo "Reapply every feature in FEATURE.md onto upstream ${UPSTREAM_TAG:-unknown}."; else echo "$(head -n 40 "$NEO_ISSUE_FILE")"; fi)

Look for: correctness bugs, features from the spec that are missing or only partly wired (a
surface missing from settings, the command palette, desktop, or docs), performance regressions
(continuous animations, heavy re-renders, large websocket payloads), leaked references to the
website that inspired the Neo look, and anything that would break the next upstream sync.

Write your review to ${log_dir}/review-${review_round}.md in exactly this shape:

# Review
## Must fix
- <file>: <problem and what to do>   (or the single line "none")
## Should fix
- ...   (or "none")
## Notes
- ...

Only list something under "Must fix" when it is a real defect you verified in the code.
EOF
  } >"$review_prompt"
  run_claude "review-$review_round" "$review_prompt" 120 --allowedTools "Read,Grep,Glob,Bash(git *),Write($log_dir/*)"
  undo_agent_commits
  git checkout -- . 2>/dev/null || true
  git clean -fdq 2>/dev/null || true
  review_file="$log_dir/review-$review_round.md"
  if [[ ! -s "$review_file" ]]; then
    echo "agent: reviewer wrote no review; treating as no findings"
    printf '# Review\n## Must fix\n- none\n## Should fix\n- none\n## Notes\n- reviewer produced no output\n' >"$review_file"
  fi
  must_fix="$(awk '/^## Must fix/{flag=1;next}/^## /{flag=0}flag' "$review_file" | sed -e '/^[[:space:]]*$/d')"
  if [[ -z "$must_fix" || "$must_fix" =~ ^-?[[:space:]]*none[[:space:]]*$ ]]; then
    echo "agent: review round $review_round found nothing that must be fixed"
    break
  fi
  echo "agent: review round $review_round has must-fix findings:"
  echo "$must_fix"
  if (( review_round > max_review_rounds )); then
    echo "agent: findings remain after $max_review_rounds fix rounds" >&2
    echo "REJECTED: review findings remain after $max_review_rounds rounds" >"$log_dir/verdict.txt"
    exit 1
  fi
  fix_prompt="$log_dir/prompt-fix-$review_round.md"
  {
    task_description
    echo
    echo "An automated review of your previous change found these problems. Fix every item under"
    echo "\"Must fix\"; take \"Should fix\" when it is cheap. The review:"
    echo
    cat "$review_file"
    echo
    rules
  } >"$fix_prompt"
  run_claude "fix-$review_round" "$fix_prompt" 200
  undo_agent_commits
  set +e
  bash "$auto/verify.sh" >"$log_dir/verify-fix-$review_round.log" 2>&1
  verify_exit=$?
  set -e
  if [[ $verify_exit -ne 0 ]]; then
    echo "agent: verification failed after review fixes" >&2
    tail -n 60 "$log_dir/verify-fix-$review_round.log" || true
    echo "REJECTED: verification failed after review fixes" >"$log_dir/verdict.txt"
    exit 1
  fi
  commit_all "fix: address automated review" "Round $review_round of the T3 Neo review loop ($model)."
  review_round=$((review_round + 1))
done

# ---------------------------------------------------------------------------
# Stage 4: approval gate.
# ---------------------------------------------------------------------------
approve_prompt="$log_dir/prompt-approve.md"
{
  cat <<EOF
You are the release gate for T3 Neo, a fork of T3 Code. A change was implemented by one Claude
Code session and reviewed by another; the review findings were addressed. Decide whether this
change may ship as a release. Read AGENTS.md and ${auto}/FEATURE.md.

The change is the diff between ${base_sha} and HEAD (git diff ${base_sha} HEAD). The review
rounds are in ${log_dir}/review-*.md. Verification (bash ${auto}/verify.sh) passed.

Check, with the code in front of you:
1. The task is complete: $(if [[ "$task" == "reapply" ]]; then echo "every feature in FEATURE.md is present and wired on every surface it names."; else echo "the issue is resolved as described; a feature is specified in FEATURE.md and checked by verify.sh, a fix is listed under 'Feature 6: carried fixes' in FEATURE.md and has a regression check in verify.sh."; fi)
2. No must-fix review item is still open.
3. Nothing references the website that inspired the Neo look.
4. Nothing touches apps/mobile.

Do not modify files. Write exactly one line to ${log_dir}/verdict.txt:
APPROVED
or
REJECTED: <one sentence why>
EOF
} >"$approve_prompt"
rm -f "$log_dir/verdict.txt"
run_claude "approve" "$approve_prompt" 80 --allowedTools "Read,Grep,Glob,Bash(git *),Write($log_dir/*)"
undo_agent_commits
git checkout -- . 2>/dev/null || true
git clean -fdq 2>/dev/null || true
verdict="$(head -n 1 "$log_dir/verdict.txt" 2>/dev/null || true)"
echo "agent: verdict: ${verdict:-<none>}"
if [[ "$verdict" != APPROVED* ]]; then
  echo "agent: change was not approved" >&2
  [[ -n "$verdict" ]] || echo "REJECTED: approval pass wrote no verdict" >"$log_dir/verdict.txt"
  exit 1
fi
echo "agent: approved"
