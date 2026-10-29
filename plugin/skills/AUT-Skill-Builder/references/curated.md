# Writing a curated block

Write between the markers only, and keep each block focused: about 40–150 lines.

## Sub-skill (`AUT_<App>-<Component>`)

```markdown
<!-- curated:start (written by Claude / QA from the source code; kept on regeneration) -->
## Business understanding
Summary: Shoppers review and change their basket before checking out.

- **Purpose and roles:** who uses this part of the app, and for what.
- **Business objects:** each object, its states and the transitions between them.
- **Rules:** each calculation, validation and limit, citing `repo:path:line`.
- **Integrations:** the APIs, other parts of the app and batch jobs it reads or writes.

## End-to-end business cases
- **Apply a coupon** · shopper · a cart with one item and a valid code · `/cart` → enter the code → total drops by the
  discount · the total is recalculated before checkout · Cart, Checkout · candidate journey 1.
<!-- curated:end -->
```

- The `Summary:` sentence is copied into the skill's description, which decides when Claude loads the skill. Say what the part lets which users do.
- Each business case gives a name, a persona, the preconditions and data, the steps (screen → action → result, with the screens and elements in the generated facts), the expected business outcome, and the other components involved. Only list components the DSM shows as dependencies.
- Mark statements you didn't read in the code **(inferred)**.

## Main skill (`AUT_<App>`)

- **Application overview:** the business domain, the user roles and permissions, the main business objects, the environments, and how the components work together, following the component dependency matrix.
- **Key end-to-end business cases:** the most important flows across components, with the sub-skills involved.

## Where the code is

The local clones listed in `config/dsm-config.json` `repositories` (`path`, `branch`), written by `qam setup`. Read committed code with `git -C <path> show <branch>:<file>`, or the file tools. Never commit, push or check out there.
