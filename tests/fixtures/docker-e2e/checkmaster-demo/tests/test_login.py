from playwright.sync_api import expect


def test_valid_login_greets_the_user(app):
    app.fill("#username", "demo")
    app.fill("#password", "secret")
    app.click("#sign-in")
    expect(app.locator("#greeting")).to_have_text("Hello, demo")


def test_wrong_password_shows_an_error(app):
    app.fill("#username", "demo")
    app.fill("#password", "wrong")
    app.click("#sign-in")
    expect(app.locator("#login-error")).to_have_text("Wrong username or password")
