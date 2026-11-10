# API cases

A route the DSM marks `kind: api` is a server endpoint, not a screen (Q48). The context pack lists them under `api_routes` (`method`, `path`, `source`). An **API case** tests one of them directly, with no browser.

## Write one

- `"channel": "API"` and usually `"type": "API"`. The case still belongs to a `component` from the DSM (the module whose resource it serves) so it is grouped and published with that module.
- **No `screen`, `element` or `leads_to` on its steps.** A step's `action` names the call exactly as the pack lists it: `POST /api/todos with the title Buy milk`. A route that is not in `api_routes` is a finding, verb and path both.
- **Cite the route:** `dsm:api:<METHOD> <path>` in the case's `evidence` (or a step's), for example `dsm:api:POST /api/todos`. `{id}` and `:id` are the same path parameter.
- **Cite the request model:** open the model (a Pydantic `BaseModel`, a DTO, a schema) in the local clone, use its field names exactly in `test_data`, and cite `code:<repo>:<path>:<line of the class>`. The validator checks that every `test_data` key is in a cited file, and that an API case cites code (A12).
- **Expected** states what the response shows: the status code and the body fields (`The response status is 201 and the body holds the title Buy milk`). Take the status code from the route's code, not from habit.
- Positive, Negative (a missing required field, a value the model rejects, an unknown id, no session when the route needs one) and Boundary (a limit the model declares) apply as for screens.

A credential is never written: name it ("the registered user's token").

## What isn't checked

The response body's shape comes from the code you read, not from a recorded response: cite the line that returns it. API discovery beyond the code scan (OpenAPI files, recorded traffic) is a later release.
