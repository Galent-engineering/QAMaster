@api
Feature: Todos API

  @TC-TODO-API-001 @positive @api @p1
  Scenario: POST /api/todos creates a todo from a title
    When I create a todo with the title "Buy milk"
    Then the response status is 201
