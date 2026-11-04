// Coupons: a share taken off the cart total, and for some a last day.
const COUPONS = {
  SAVE10: { discount: 0.1 },
  OLD5: { discount: 0.05, expires: '2020-01-01' },
};

document.getElementById('apply-coupon').addEventListener('click', () => {
  const message = document.getElementById('coupon-message');
  const coupon = COUPONS[document.getElementById('coupon').value.trim().toUpperCase()];
  if (!coupon) {
    message.textContent = 'Invalid coupon';
  } else if (coupon.expires && coupon.expires < new Date().toISOString().slice(0, 10)) {
    message.textContent = 'Coupon expired';
  } else {
    cart.rate = coupon.discount;
    message.textContent = 'Coupon applied';
    renderTotal();
  }
});
