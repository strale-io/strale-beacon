# Session Protocol — Strale Beacon

> Simplified from the full template. Beacon is a focused tool — ceremony is kept minimal.

## Session Flow

1. **Declare intent** — One sentence: what is this session for?
2. **Read handoff** — Check `handoff/_general/from-code/` for recent context. If empty, proceed.
3. **Do the work** — Read relevant files before modifying. Follow laws in `_rules/laws.yaml`. Use tokens from `_ui/tokens.yaml`.
4. **Write handoff** — Save a handoff file to `handoff/_general/from-code/` with:
   - Intent (what was this session for)
   - What was done
   - What's next
   - Open questions or blockers

## Handoff File Naming

Format: `YYYY-MM-DD-short-description.md`
Example: `2026-03-22-project-initialization.md`

## Key References

- `CLAUDE.md` — Project context and architecture
- `check-registry.yaml` — All scan check definitions
- `_ui/tokens.yaml` — Design tokens
- `_ui/components.yaml` — Component registry
- `_rules/laws.yaml` — Design laws
- `_design-systems/beacon/system.yaml` — Design system definition
- `strale-beacon-spec.docx` — Full product specification

## Constraints

- **No aggregate score** — Only per-category tiers. Strategic constraint.
- **All visual values from tokens** — No magic numbers.
- **Check definitions in YAML** — Engine executes generically, not per-check code.
- **Contact: hello@strale.io** — Never @strale.dev
- **Domain: strale.dev** — Website domain
