# Plans

There's one plan per plugin release. Each plan is the working source of truth for that release: what's in it, in what order, what has to be decided first, and how it's verified.

| Release | Plan | Status |
|---|---|---|
| 0.2.1 | [0.2.1.md](0.2.1.md): fixes from the 0.2.0 publish walkthrough that the gate depends on | Released 2026-11-02, r5 |
| 0.2.2 | [0.2.2.md](0.2.2.md): fixes from the 0.2.1 verification | Released inside 0.3.0, r1 |
| 0.3.0 | [0.3.0.md](0.3.0.md): the first full working plugin (gate, just-in-time automation, pytest and playwright-bdd runners) | Released 2026-11-02, r9 |
| 0.3.1 | [0.3.1.md](0.3.1.md): prerequisites a clean machine needs, checked and explained (Docker findings F1–F11) | Released 2026-11-02, r5 |

**How the plans relate to the other docs**
- [releases.md](../releases.md) has a short summary of each release and links here. When a release ships, its row there lists what actually shipped.
- [decisions.md](../decisions.md) holds the decisions a plan relies on. A plan links to them and never restates them in a different way.
- [design.md](../design.md) and [tech.md](../tech.md) describe the product as designed. A plan says which parts of them it builds.
- [demos/](../demos/README.md) holds the walkthrough findings each plan answers.

**Revisions.** Each plan opens with a revision table. A change of scope, order or decision adds a row (`r2`, `r3`, …) with the date and what changed. Earlier rows are never edited. A step that's done is marked in the plan's status column, not deleted.
