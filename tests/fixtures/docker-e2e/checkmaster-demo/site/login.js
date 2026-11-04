// Login: one known user.
const USERS = { demo: 'secret' };

document.getElementById('sign-in').addEventListener('click', () => {
  const name = document.getElementById('username').value;
  const ok = USERS[name] !== undefined && USERS[name] === document.getElementById('password').value;
  document.getElementById('greeting').textContent = ok ? `Hello, ${name}` : '';
  document.getElementById('login-error').textContent = ok ? '' : 'Wrong username or password';
});
