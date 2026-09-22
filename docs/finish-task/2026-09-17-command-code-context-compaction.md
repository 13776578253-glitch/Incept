# 2026-09-17 Session Handoff: Command Code Context Compaction Investigation

## Status

**Investigation complete. No repository files were changed in this session.** All repository work remains as described in the two active task records (see "Where development resumes"). The bug this session filed was fixed upstream and verified on 2026-09-21, on the original failing session — see "Resolution".

## Why this session happened

The previous session (`e557b148`, 2026-09-10 → 2026-09-16) degraded: frequent compaction, answers landing in the reasoning channel, auto-continuation loops, and finally `/compact` leaving the TUI unable to accept messages. This session diagnosed the cause, filed the bug, and applied the mitigation.

## Findings (verified against the CLI bundle and the session transcript)

1. **Compaction tiers.** 50% / 80% / 90% of the active model's context window. Tiers 1–2 (trim tool-call pairs, keep the last 20 / last 10) run only under `compact-mode = fast`; tier 3 (summarize) runs at 90% in any mode. The failing session ran at 500–655k tokens on a 1M window: only tier-1 trims fired (153 events, 540,529 tokens "saved", last one 937) and **no summarize ever ran** — the transcript holds zero compaction entries.
2. **The trim asymmetry.** Trims delete tool results but keep the assistant's reasoning and prose. In that session tool results were 49% of content and the model's own reasoning 35%; after repeated trims the context is mostly its own narration with the evidence removed ("plans kept, results deleted").
3. **Reasoning is replayed.** `toWireMessages` sends historical thinking back to the provider as reasoning parts, and DeepSeek is not treated as prefix-bound (`modelBindsThinkingToPrefix` contains only `claude-fable-5-1`), so trims never strip it. The model conditions on its own earlier reasoning and verbal tics compound (`Let me go`: 3 → 18 → 40 → 301 per day).
4. **Channel collapse.** From ~500k tokens on, visible text disappeared (63% → 9% → 2% → 0% of turns). The harness auto-continued with "Please continue your response…" 40 times; the model misread those as user impatience.
5. **Root cause is session length**, not one broken mechanism: six days / 1,382 entries / 655k tokens in a single session, with `fast` trimming from the first 500k crossing onward.

## Actions taken (outside the repository)

- `compact-mode` switched `fast` → `default` in user scope — removes the silent 50%/80% trims, leaving only a 90% summarize. Verified still in effect on 2026-09-21.
- Bug report filed: *TUI hangs after /compact — input is blocked and the queued message is never sent* (`github.com/CommandCodeAI/command-code/issues`). Fixed upstream and verified on 2026-09-21 — see "Resolution".
- Artifacts in `D:\Desktop\docs-push`:
  - `command-code-issue-compact-hang.md` — report text pasted into the issue form.
  - `command-code-session-tail-redacted.json` — 204 redacted transcript entries (09-16 22:39 → 23:22 local), with source SHA-256 and redaction log in its header; secret scan clean.

## Resolution (2026-09-21)

The maintainers answered that it was fixed and asked for confirmation on an updated CLI; the fix was confirmed on the session that had failed, not on a fresh one.

- The CLI had already auto-updated past the incident's version (1.54.1 → 1.54.2 → **1.58.1**, the current release). In the new bundle, manual `/compact` runs through the session client with a busy state (`Compacting conversation...`), resets on both the success and the failure path, and queues input submitted while busy; `compaction_start` / `compaction_done` events are new.
- `e557b148` — the session from the incident — was resumed on 1.58.1 and a manual `/compact` was run again. Its transcript now holds one compaction entry: `tokensBefore` **1,120,238** (above the 1M window, because `default` mode no longer trims and the resumed session re-expanded the whole history), a ~27.4k-character summary, ~28 s wall time, ~498k tokens saved.
- Messages were accepted again at 23:06:33 local, and by 23:07:20 the model had made four tool calls and returned visible output. The same file's original failure — the manual `/compact` on 2026-09-16 23:17:03 — left no compaction entry at all and the input never accepted a message again, while the process kept appending turns until 23:22:31.
- **Not covered by the fix:** the branch where the summary request never returns. There is still no cancellation and no visible timeout on that path, so queued input would wait indefinitely if the request never settles. The maintainers' follow-up paired fixture narrows this to one boundary — `Escape` reports `Interrupted` without cancelling the in-flight summary request — which is their own question to close rather than part of the reported bug; the method note relayed back was that a 3-second observation window shows "no cancellation within 3 s", not whether the client eventually times out.
- **Also not fixed:** the long-session drift itself (findings 1–5). Trimming still fires at 50% / 80% under `fast`, and reasoning is still replayed for every model outside `modelBindsThinkingToPrefix`. The mitigation stays what the working rules below describe.

## Working rules adopted (apply to future sessions)

- One milestone per session; `/clear` between tasks; do not carry a session across days.
- Watch `/context`; wrap up around ~180k tokens; hard stop before 500k.
- Prefer a manual `/compact` at task boundaries — the summary replaces accumulated self-talk instead of trimming evidence.
- If "Please continue your response…" appears twice in one turn, or answers start landing in thinking with no visible text, stop, write the handoff here, and `/clear`.
- Handoffs live in repository docs, never in conversation history.

## Where development resumes

- `docs/current-task/2026-09-16-music-source-and-import-pipeline.md` — pipeline state, not-delivered list, commit proposal.
- `docs/current-task/2026-09-14-music-player-floating-plugin.md` — player and preference channel.
- Open human decisions: none. Both questions recorded here were answered on 2026-09-17 — the React test environment was built (B-18) and the queue behaviour on a library switch was decided and implemented (B-19). Repository status at handoff: 48 changed files, nothing committed this session.

Both task records above were archived to `docs/finish-task/` on 2026-09-21, and the music feature they describe was merged into `main` through PR #2 (`e35fccc`).

## Lifecycle

Archive this file to `docs/finish-task/` once the upstream issue is resolved or the working rules are absorbed elsewhere.

## Archive Note

Archived to `finish-task/` on 2026-09-21 — the condition above is met: the fix shipped in `1.58.1` and was verified on the original failing session (see "Resolution"). This record's own sessions changed no repository files, and the working rules it adopted remain in force.
