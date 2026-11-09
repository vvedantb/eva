# Convex query load test

Seeds the real schema at 1×, 10×, 100× and 1000× and runs the real public
queries against it, to find the queries that fail or slow down at scale.

```sh
cd packages/backend
node loadtest/run.ts --label before          # ~30 min for all four scales
# …change queries…
node loadtest/run.ts --label after
node loadtest/report.ts --before before --after after   # → loadtest/results/report.html
```

Flags: `--scales 1,10` (subset), `--samples 30`, `--warmup 3`,
`--only sessions.list,docs.list` (case names from `cases.ts`).

## How it works

1. **Isolated backend.** Each scale boots a fresh `convex-local-backend` on
   port 3310 with its own SQLite file under `/tmp/eva-loadtest`. The dev
   backend (3210) and its data are untouched. The runner reuses the dev
   backend's instance secret so the same admin key works.
2. **Push.** `npx convex dev --once` pushes this checkout's `convex/` with
   `EVA_LOAD_TEST=1`. The CLI rewrites `.env.local`; the runner restores it.
3. **Seed.** `convex/_loadTest/seed.ts` inserts deterministic rows through
   internal mutations. Every seeder refuses to run without `EVA_LOAD_TEST=1`.
4. **Probe.** Each case calls a real `api.*` query as the focal user (admin
   key acting as an identity). A new `tokenIdentifier` per call means the
   query cache never answers. Server time, documents read and bytes read come
   from the backend's function log stream (`/api/stream_function_logs`), not
   from the client.
5. **Rounds.** Every round runs all cases once in a shuffled order, so drift
   (GC, compaction, crons) spreads across cases. Default: 3 warm-up rounds
   (discarded), then 30 measured rounds.

## Scale model

`N` multiplies every relationship around one focal user, team and repo:

| Fan-out | Base (1×) | Scales with N |
| --- | --- | --- |
| Team members, shell repos in the team | 5, 3 | yes |
| Sessions, projects, quick tasks, docs, automations in the focal repo | 30, 5, 15, 10, 3 | yes |
| Notifications, chat reads, drafts, routed threads for the focal user | per session / task | yes |
| Messages in the focal chat, runs/comments/activity of the focal task, comments on the focal doc, PRs of the focal session, runs of the focal automation | 40, 10, 10, 10, 5, 20 | yes |
| Activity log of each assistant message in the focal chat | mean 25.6 KB (2 KB to 110 KB) | no |
| Children of non-focal entities (messages per chat, runs per task) | 3, 2 | no |

Per-entity fan-outs scale only on the focal entity: scaling them everywhere
grows as N² and models no real tenant. 1000× is about 690,000 documents.

The focal chat is the heavy session. Its activity-log sizes follow production
(600 newest messages on 9 November 2026: median 8.8 KB, p90 84 KB, p99 294 KB),
so the chat holds 0.56 MB at 1×, 5.6 MB at 10× (400 messages) and 56 MB at
100×. The `session open` cases are the queries a session page subscribes to
for that chat. `messages.listByParent.tail` is the query the chat paints from.

1000× needs about 6 GB of memory for the load-test backend. Do not run it
beside other heavy work: on a 16 GB VM the kernel killed the dev backend.

## Limits of the method

- `_creationTime` is the insert time, so every seeded row looks new. Queries
  that window on `_creationTime` read the whole range here; production rows
  spread over months read less. Windows on `createdAt`/`updatedAt` work.
- One focal repo has 3,000 open turns at 1000×. Real repos have as many open
  turns as running sandboxes, so turn-driven costs are an upper bound.
- The local backend applies Convex's per-function limits. The runs hit four:
  4,096 reads per function, 16 MiB read, 8,192 items in a returned array,
  and "too many system operations" timeouts. Absolute times are for this VM,
  not for Convex cloud; compare before and after on the same machine.
- The backend's crons run during the probe; their executions are not counted.

## Statistics

`report.ts` reports, per query and scale: median server time with a bootstrap
95% CI (2,000 resamples), median documents and bytes read, a two-sided
Mann–Whitney U test on server time before vs after, Holm–Bonferroni-adjusted
across every comparison, and Cliff's δ as the effect size.
