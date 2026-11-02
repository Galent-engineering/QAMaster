@web
Feature: About

  @TC-ABOUT-004
  Scenario: Terms of use link on /about leads to /ftp/legal.md
    Given I open the About page
    Then the terms of use link leads to "ftp/legal.md"
