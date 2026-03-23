# Handoff Files

Session handoff files for cross-actor communication.

## Structure

- `<feature-name>/from-chat/` — Instructions from Claude Chat → Claude Code
- `<feature-name>/from-code/` — Session summaries from Claude Code → Claude Chat
- `_general/from-chat/` — Cross-cutting instructions (not feature-specific)
- `_general/from-code/` — Cross-cutting session summaries
- `_archive/` — Completed handoffs (move here, don't delete)

## Rules

- One file per session, named `YYYYMMDD-HHMM.md`
- Every file starts with `Intent:` line
- Weight follows session_workflow.handoff_weight (one_liner / summary / detailed)
- Feature folders created on first use (don't pre-create)
- If Notion unavailable: prefix with `[BACKFILL]`

See `.claude/PROTOCOL.md` for full handoff format.
