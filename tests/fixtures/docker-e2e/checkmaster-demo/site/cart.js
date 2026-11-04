// The cart: each click on "Add item" puts one 20.00 item in it, and the total is shown with two decimals.
const cart = { items: [], rate: 0 };

function renderTotal() {
  const subtotal = cart.items.reduce((sum, price) => sum + price, 0);
  document.getElementById('total').textContent = (subtotal * (1 - cart.rate)).toFixed(2);
}

document.getElementById('add-item').addEventListener('click', () => {
  cart.items.push(20);
  renderTotal();
});
