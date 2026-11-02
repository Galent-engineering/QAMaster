"""pytest plugin that lists, selects and reports tests by node ID for QAMaster.

Tests need nothing: which test case a test automates is stored in the test case store (the test
case's Automated Test Name, `pytest:<node id>`), not in the code.

With --qamaster-evidence and pytest-playwright installed, Playwright keeps a screenshot, a
video and a trace of each failed test there, and the report lists those files per test.

This module is loaded into the user's own test environment, so it imports only the standard
library and pytest, and must work on any Python that pytest supports.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

# pytest-playwright options and the failure-only mode QAMaster turns on when they're off.
PLAYWRIGHT_EVIDENCE = {
    "screenshot": "only-on-failure",
    "video": "retain-on-failure",
    "tracing": "retain-on-failure",
}
# Each test's Playwright artifact folder, by node ID.
_FOLDERS = pytest.StashKey[dict]()


def pytest_addoption(parser):
    group = parser.getgroup("qamaster")
    group.addoption(
        "--qamaster-list",
        metavar="PATH",
        help="Write the collected test node IDs as a JSON list. Use with --collect-only.",
    )
    group.addoption(
        "--qamaster-select",
        metavar="PATH",
        help="A file of node IDs, one per line. Deselect every other test.",
    )
    group.addoption(
        "--qamaster-report",
        metavar="PATH",
        help="Write each test's outcome, by node ID, as JSON.",
    )
    group.addoption(
        "--qamaster-evidence",
        metavar="DIR",
        help="Keep Playwright's screenshot, video and trace of each failed test in DIR.",
    )


def pytest_configure(config):
    evidence = config.getoption("--qamaster-evidence")
    if evidence and config.pluginmanager.hasplugin("playwright"):
        config.option.output = evidence
        for name, mode in PLAYWRIGHT_EVIDENCE.items():
            if getattr(config.option, name) == "off":  # keep the project's own choice
                setattr(config.option, name, mode)
        config.stash[_FOLDERS] = {}

    path = config.getoption("--qamaster-report")
    if path:
        config.pluginmanager.register(_Reporter(Path(path), config), "qamaster-reporter")


@pytest.fixture(autouse=True)
def _qamaster_evidence_folder(request):
    folders = request.config.stash.get(_FOLDERS, None)
    if folders is not None:
        folders[request.node.nodeid] = request.getfixturevalue("output_path")


def pytest_collection_modifyitems(config, items):
    path = config.getoption("--qamaster-select")
    if path:
        wanted = {line.strip() for line in Path(path).read_text().splitlines() if line.strip()}
        drop = [item for item in items if item.nodeid not in wanted]
        if drop:
            config.hook.pytest_deselected(items=drop)
        items[:] = [item for item in items if item.nodeid in wanted]

    path = config.getoption("--qamaster-list")
    if path:
        Path(path).write_text(json.dumps([item.nodeid for item in items], indent=2))


class _Reporter:
    def __init__(self, path: Path, config):
        self._path = path
        self._config = config
        self._tests: list[dict] = []

    def pytest_runtest_logreport(self, report):
        # A test's result comes from its call phase, or from setup when setup failed or skipped.
        if report.when == "call" or (report.when == "setup" and not report.passed):
            self._tests.append(
                {
                    "nodeid": report.nodeid,
                    "outcome": report.outcome,
                    "duration": report.duration,
                    "error": report.longreprtext[-2000:] if report.failed else None,
                }
            )

    def pytest_sessionfinish(self):
        # Playwright has moved each test's artifacts into its folder by now.
        folders = self._config.stash.get(_FOLDERS, {})
        for test in self._tests:
            folder = folders.get(test["nodeid"])
            files = Path(folder).rglob("*") if folder and test["outcome"] == "failed" else []
            test["evidence"] = sorted(str(f) for f in files if f.is_file())
        self._path.write_text(json.dumps({"tests": self._tests}, indent=2))
