# checkmaster-demo

A page with a cart, a coupon box and a login form (`site/`), and pytest-playwright tests for it (`tests/`). The Docker
check (`scripts/docker-e2e/`) turns this folder into a git repo and gates it. It has no `uv.lock`: `inside.sh` runs
`uv lock` in the container, because a lock can't be made without downloading from PyPI.
