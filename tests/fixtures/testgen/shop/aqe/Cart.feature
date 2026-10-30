@shop @feature:Cart
Feature: Cart

  Background:
    Given I open the shop home page
    And the home page shows the Products link
    And I click the Products link
    And the /products screen opens with its Cart link
    And I click the Cart link
    And the /cart screen opens with the Coupon field

  @TC-CART-001 @positive @functional @p1
  Scenario: Cart screen shows the Coupon field and the checkout form
    When I look at the checkout form
    Then the Coupon text field and the checkout form are shown

  @TC-CART-002 @e2e @functional @p1
  Scenario: Checkout form posts with coupon SAVE10 to /checkout
    When I type SAVE10 in the Coupon field and submit the checkout form
    Then the /checkout screen opens after the checkout form is posted

  @TC-CART-003 @business @functional @p2
  Scenario: Shopper checks out from the cart without a coupon
    When I leave the Coupon field empty and submit the checkout form
    Then the /checkout screen opens without a coupon applied

  @TC-CART-004 @negative @functional @p2
  Scenario: Coupon field rejects the code EXPIRED-2020
    When I type EXPIRED-2020 in the Coupon field and submit the checkout form
    Then the /cart screen stays open with the Coupon field still showing EXPIRED-2020

  @TC-CART-005 @boundary @functional @p3
  Scenario: Coupon field accepts a 20-character code
    When I type ABCDEFGHIJ0123456789 in the Coupon field and submit the checkout form
    Then the /checkout screen opens after the 20-character code is posted

  @TC-CART-006 @edge @functional @p3
  Scenario: Keep shopping link returns from the cart to /products
    When I click the Keep shopping link
    Then the /products screen opens again from the cart
