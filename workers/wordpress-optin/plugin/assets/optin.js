(function () {
  const forms = document.querySelectorAll('form[data-ddns-optin="1"]');

  if (!forms.length) {
    return;
  }

  forms.forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const message = form.querySelector('.ddns-optin-message');

      if (message) {
        message.textContent = 'Thanks for joining the list.';
      }

      form.reset();
    });
  });
})();
