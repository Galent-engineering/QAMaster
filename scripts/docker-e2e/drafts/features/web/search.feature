@web
Feature: Search

  @TC-SEARCH-002
  Scenario: Navbar search for Banana narrows the grid to Banana Juice (1000ml) and switches the header to Search Results
    Given I open the path "/#/search"
    When I search the catalogue for "Banana"
    Then the URL should contain "q=Banana"
    And I should see the text "Banana Juice (1000ml)"
