@shop @feature:Cart
Feature: Cart

  Background:
    Given I open the shop home page
    And the home page shows the Products link
    And I click the "Products" link
    And the URL should contain "/products"
    And I click the "Cart" link
    And the URL should contain "/cart"

  @TC-CART-001 @positive @functional @p1
  Scenario: Cart screen shows the Coupon field and the checkout form
    When I look at the checkout form
    Then the Coupon text field and the checkout form are shown

  @functional
  Scenario Outline: Checkout form posts (coupon)
    When I type <coupon> in the Coupon field and submit the checkout form
    Then the URL should contain "/checkout"

    @TC-CART-002 @e2e @functional @p1
    Examples: Checkout form posts with coupon SAVE10 to /checkout
      | coupon |
      | SAVE10 |

    @TC-CART-005 @boundary @functional @p3
    Examples: Coupon field accepts a 20-character code
      | coupon |
      | ABCDEFGHIJ0123456789 |

  @TC-CART-003 @business @functional @p2
  Scenario: Shopper checks out from the cart without a coupon
    When I leave the Coupon field empty and submit the checkout form
    Then the URL should contain "/checkout"

  @TC-CART-004 @negative @functional @p2
  Scenario: Coupon field rejects the code EXPIRED-2020
    When I type EXPIRED-2020 in the Coupon field and submit the checkout form
    Then the /cart screen stays open with the Coupon field still showing EXPIRED-2020

  @TC-CART-006 @edge @functional @p3
  Scenario: Keep shopping link returns from the cart to /products
    When I click the "Keep shopping" link
    Then the URL should contain "/products"
