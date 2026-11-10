@mobile-web
Feature: Login on a phone

  @TC-LOGIN-M-001 @positive @mobile-web @p1
  Scenario: The Sign in screen opens on a phone
    Given I open the path "/login"
    Then I should see the text "Sign in"
