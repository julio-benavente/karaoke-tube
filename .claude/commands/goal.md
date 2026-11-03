---
description: Work on a spec until it's done. Usage: /goal <spec path or claude.ai link>
argument-hint: <docs/specs/A-party-engine.md | docs/specs/B-app-ui.md | https://claude.ai/artifact/...>
---

Your goal is the spec at: $ARGUMENTS

1. **Load the spec.**
   - A file path: read it.
   - A claude.ai artifact link: read it with the Artifact tool (`action: "read"`), never WebFetch.
   - Nothing given: list `docs/specs/*.md` and ask which one.
   - Also read `docs/specs/README.md` (working rules, contract rules) and `packages/shared/src/protocol.ts` (the contract).
2. **Check where you are.** Run `git branch --show-current`. If the spec names a branch and you're on a different one,
   stop and tell the user which worktree/branch to use (see README "How to start the two agents"). Don't switch branches yourself.
3. **Find your place.** Tasks are numbered (A1, A2… or B1, B2…). A task is done when its heading is marked `✅`
   in the spec. Continue from the first task without it. Check `git log` for work already committed.
4. **Work through the tasks in order**, each one fully:
   - Stay inside the folders the spec owns. Anything needed from the other track goes under "Requests for the other track" in your spec.
   - Contract changes follow the README rules (additive only, own `contract:` commit, listed in README).
   - Before calling a task done: `pnpm typecheck` and `pnpm build` pass, plus the task's own "Done when" check.
   - Mark the task heading `✅` in the spec, and commit the code and spec together: `<A1|B1…>: <what>`.
   - Give the user a one-line progress note after each task.
5. **Stop** when every task is marked `✅` or you're blocked on something only the user or the other track can provide.
   Then report: what's done, what was verified and how, what's left, and any requests for the other track.
   Don't merge into `main` and don't push unless the user asks.
