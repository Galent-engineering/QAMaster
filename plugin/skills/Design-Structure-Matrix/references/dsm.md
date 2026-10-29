# DSM reference

## Reading the matrix

| Level | Rows = columns | A mark in row r, column c means |
|---|---|---|
| Pages (default) | Every screen found by the crawl or in code | r reaches c by link, form, click, pop-up, redirect, or a navigation in code |
| UI elements | Every page and its links, buttons, tabs, menu items, forms, fields, dialogs | r contains, navigates to, submits to or opens c |

- In the *Partitioned* order the main flow runs above the diagonal. **Marks below the diagonal are backward navigation**, and boxed blocks are **cycles**: screens that can all reach each other.
- Shaded bands are modules (the first URL segment, or `matrix.module_depth` segments).
- Click a cell for its evidence: the UI element's text, or `repo:file:line` in code.

## Flags

| Flag | Means |
|---|---|
| `orphan` | Nothing links to it, and it isn't a start page |
| `dead-end` | A crawled screen with no way out |
| `code-only` | Defined in code, never reached by the crawl (role-restricted, feature-flagged, needs data, or dead code) |
| `ui-only` | Crawled, but no route found in code |
| `unresolved` | A link target that is neither crawled nor defined: a probable broken link |
| `broken` | HTTP 400 or higher, or failed to load |
| `redirect` | Sends users elsewhere |

## Files in `dsm/`

| File | Holds |
|---|---|
| `index.html` | The interactive matrix; works offline |
| `dsm.json` | Both matrices, metrics, the diff against the last build |
| `ui-model.json`, `code-model.json` | The crawl and the code scan |
| `CHANGES.md` | The last update: trigger, impacted screens, shared files, matrix changes |
| `history/` | Earlier `dsm.json` files (`change_detection.keep_history`, default 30) |
| `state.json` | The last commit seen per repository |
| `.auth/state.json` | The saved sign-in session, owner-only and git-ignored |

## Settings (`config/dsm-config.json`)

- **`application`:**
  - `base_url`, `start_paths`, `allowed_hosts`, `api_hosts`;
  - `max_pages` (300), `max_depth` (8), `settle_ms`, `page_timeout_ms`;
  - `hash_routing` (`auto`), `route_normalization`, `keep_query_params`, `exclude_url_patterns`.
- **`application.login`:**
  - `mode`: `auto`, `manual` or `none`;
  - `url`: the sign-in page, if not the first page;
  - `username_selector`, `password_selector`, `submit_selector`;
  - `username_env` and `password_env`, default `DSM_APP_USERNAME` and `DSM_APP_PASSWORD`;
  - `save_session` (default `true`).
- **`application.safety`:**
  - `allow_mutating_patterns`: only for read-only endpoints a page needs to render, such as a search POST;
  - `dismiss_dialogs`.
- **`application.explore_clicks`:** `enabled`, `max_per_page` (40), `selectors`, `deny_text_patterns`. The safe defaults apply when these are left out.
- **`repositories[]`:**
  - `name`, `path` (relative to the QA project), `branch`, `include` and `exclude`;
  - `fetch`: `false` skips `git fetch`.
- **`matrix`:** `module_depth`, `max_element_nodes`.
- **`change_detection`:**
  - `recrawl`: `impacted`, `full` or `none`;
  - `full_recrawl_every_runs`, `keep_history`.

## Limits to state when reporting

- The code scan uses patterns, not a parser. Routes built from strings at runtime are missed. Ownership follows relative imports only; aliases such as `@/x` aren't followed yet.
- The crawl sees only what its account can reach. Screens behind search results or wizards need `start_paths` or code routes.
- Blocking writes can hide content on apps that load data with POST. Allow those endpoints deliberately in `allow_mutating_patterns`.
