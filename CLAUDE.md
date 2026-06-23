# CLAUDE.md

The contributor guide for this repo lives in **@AGENTS.md** — read it first.
It covers the zero-dependency rule, repo layout, how to add a collector or
report template, conventions, and gotchas.

## Claude Code specifics

- Slash commands for driving bragkit live in `.claude/commands/`
  (`/brag-collect`, `/brag-report`, `/brag-compensation`).
- A reusable skill describing the toolkit is in `.claude/skills/bragkit/`.
- The `achievement-curator` subagent (`.claude/agents/`) can run an end-to-end
  collect → report pass on request.
- Before claiming done: run `npm test` (must be green) and, for CLI changes,
  exercise `node bin/brag.js <command>` against a throwaway `--db /tmp/x.db`.
- Do not add runtime dependencies. See @AGENTS.md for the platform-API
  substitutes to use instead.
