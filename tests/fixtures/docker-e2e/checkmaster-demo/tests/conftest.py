from pathlib import Path

import pytest

SITE = Path(__file__).resolve().parent.parent / "site" / "index.html"


@pytest.fixture
def app(page):
    """The demo shop's page, opened from the files in site/."""
    page.goto(SITE.as_uri())
    return page
