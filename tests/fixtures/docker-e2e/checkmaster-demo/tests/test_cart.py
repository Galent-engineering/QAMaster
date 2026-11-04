from playwright.sync_api import expect


def test_adding_items_updates_the_total(app):
    app.click("#add-item")
    app.click("#add-item")
    expect(app.locator("#total")).to_have_text("40.00")
