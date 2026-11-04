from playwright.sync_api import expect


def test_coupon_applies_discount_to_total(app):
    app.click("#add-item")
    app.fill("#coupon", "SAVE10")
    app.click("#apply-coupon")
    expect(app.locator("#total")).to_have_text("18.00")


def test_expired_coupon_shows_an_error(app):
    app.click("#add-item")
    app.fill("#coupon", "OLD5")
    app.click("#apply-coupon")
    expect(app.locator("#coupon-message")).to_have_text("Coupon expired")
    expect(app.locator("#total")).to_have_text("20.00")


def test_invalid_coupon_shows_an_error(app):
    app.fill("#coupon", "NOPE")
    app.click("#apply-coupon")
    expect(app.locator("#coupon-message")).to_have_text("Invalid coupon")
