# Sign-in, sign-up and add/edit forms

Sign-in and sign-up are often the first screens a team's users meet and the ones the business cares about most. Cover them like any other form, with these rules. A DSM from before 0.7.0 has no `access`, dialog or limit fields: then none of this is checked, and you write what the context pack shows.

## Where a case starts: `session`

When the context pack shows `access` on a screen, every case carries `"session": "signed-out"` or `"signed-in"`, the state it starts in:
- a screen with `access: "public"` (`/login`, `/register`) starts **signed out**;
- a screen with `access: "signed-in"` starts **from a signed-in session**;
- a screen with `access: "both"` accepts either; choose the one the case is about.

The validator checks `session` against the first step's screen. A sign-in case that ends on a private screen still starts signed out: put the private screen in `leads_to`.

## Sign-in and sign-up cases

Per form, at least:
- **Positive:** the registered account signs in; a new account registers.
- **Negative:** a wrong password; an empty form (each required field in turn); an unknown account; for sign-up, an **email that already exists** (duplicate).
- **Boundary:** the password's or email's declared length limits (see below).

**Never write a credential.** The account is named, never quoted (A6): `"data": "the registered user's password"`, `"test_data": {"account": "the registered user"}`. A literal password in a title, action, expected text or result is a validator finding, and the scripts read the real value from the test account's environment variables (see AutomationCode). Wrong-password cases say "a wrong password for the registered user".

## Add and edit forms in a dialog

A dialog's form appears in the pack as a form with `dialog: "<title>"` on its page, and its name is the title. Cover it as any form: the coverage key is `form:<screen>:<dialog title>:positive` and `:negative`, so `form:/todo:Add todo:negative` is what an exclusion names. Its fields and buttons are elements of the page, so a step clicks the button that opens the dialog, fills a field and clicks the dialog's submit by name.

## Boundary cases cite the limit

A field in the pack may carry `min_length`, `max_length`, `min`, `max` and `pattern`, the limits the page declares. A Boundary case on a screen whose fields declare limits must cite one of them (`dsm:element:<route>:<field>`) or the code that validates it (`code:<repo>:<path>:<line>`). Test the value on each side of the limit (at the limit, one past it) with test data that states the length or value, for example `"title length": "101 characters"` or a value built to that length. When the page declares no limit, find the rule in the code or a requirement and cite that; never invent a limit.
