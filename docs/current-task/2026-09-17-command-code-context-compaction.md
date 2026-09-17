# 2026-09-17 Session Handoff: Command Code Context Compaction Investigation

## Status

**Investigation complete. No repository files were changed in this session.** All repository work remains as described in the two active task records (see "Where development resumes").

## Why this session happened

The previous session (`e557b148`, 2026-09-10 → 2026-09-16) degraded: frequent compaction, answers landing in the reasoning channel, auto-continuation loops, and finally `/compact` leaving the TUI unable to accept messages. This session diagnosed the cause, filed the bug, and applied the mitigation.

## Findings (verified against the CLI bundle and the session transcript)

1. **Compaction tiers.** 50% / 80% / 90% of the active model's context window. Tiers 1–2 (trim tool-call pairs, keep the last 20 / last 10) run only under `compact-mode = fast`; tier 3 (summarize) runs at 90% in any mode. The failing session ran at 500–655k tokens on a 1M window: only tier-1 trims fired (153 events, 540,529 tokens "saved", last one 937) and **no summarize ever ran** — the transcript holds zero compaction entries.
2. **The trim asymmetry.** Trims delete tool results but keep the assistant's reasoning and prose. In that session tool results were 49% of content and the model's own reasoning 35%; after repeated trims the context is mostly its own narration with the evidence removed ("plans kept, results deleted").
3. **Reasoning is replayed.** `toWireMessages` sends historical thinking back to the provider as reasoning parts, and DeepSeek is not treated as prefix-bound (`modelBindsThinkingToPrefix` contains only `claude-fable-5-1`), so trims never strip it. The model conditions on its own earlier reasoning and verbal tics compound (`Let me go`: 3 → 18 → 40 → 301 per day).
4. **Channel collapse.** From ~500k tokens on, visible text disappeared (63% → 9% → 2% → 0% of turns). The harness auto-continued with "Please continue your response…" 40 times; the model misread those as user impatience.
5. **Root cause is session length**, not one broken mechanism: six days / 1,382 entries / 655k tokens in a single session, with `fast` trimming from the first 500k crossing onward.

## Actions taken (outside the repository)

- `compact-mode` switched `fast` → `default` in user scope — removes the silent 50%/80% trims, leaving only a 90% summarize.
- Bug report filed: *TUI hangs after /compact — input is blocked and the queued message is never sent* (`github.com/CommandCodeAI/command-code/issues`).
- Artifacts in `D:\Desktop\docs-push`:
  - `command-code-issue-compact-hang.md` — report text pasted into the issue form.
  - `command-code-session-tail-redacted.json` — 204 redacted transcript entries (09-16 22:39 → 23:22 local), with source SHA-256 and redaction log in its header; secret scan clean.

## Working rules adopted (apply to future sessions)

- One milestone per session; `/clear` between tasks; do not carry a session across days.
- Watch `/context`; wrap up around ~180k tokens; hard stop before 500k.
- Prefer a manual `/compact` at task boundaries — the summary replaces accumulated self-talk instead of trimming evidence.
- If "Please continue your response…" appears twice in one turn, or answers start landing in thinking with no visible text, stop, write the handoff here, and `/clear`.
- Handoffs live in repository docs, never in conversation history.

## Where development resumes

- `docs/current-task/2026-09-16-music-source-and-import-pipeline.md` — pipeline state, not-delivered list, commit proposal.
- `docs/current-task/2026-09-14-music-player-floating-plugin.md` — player and preference channel.
- Open human decisions: whether to add a React test environment to `apps/web` (B-18), and the queue behaviour when a listener switches libraries (B-19). The music source, storage and import decision was accepted on 2026-09-17.
- Repository status at handoff: 48 changed files, nothing committed this session.

## Lifecycle

Archive this file to `docs/finish-task/` once the upstream issue is resolved or the working rules are absorbed elsewhere.
