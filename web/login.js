const form = document.getElementById('login');
const message = document.getElementById('login-message');
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  message.textContent = '';
  try {
    const response = await fetch('/auth/entrar',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    if (response.ok) {
      window.location.replace('/');
      return;
    }
    const {error} = await response.json();
    message.textContent = error || 'Não foi possível entrar.';
  } catch {
    message.textContent = 'Não foi possível entrar. Tente novamente.';
  }
  button.disabled = false;
});
