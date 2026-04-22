export const renderLoginPage = (redirect = '', error = '') => {
  const errorHtml = error ? `<div class="error">${error}</div>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .card {
      width: 100%;
      max-width: 380px;
      padding: 2.5rem 2rem;
      background: #141414;
      border: 1px solid #262626;
      border-radius: 12px;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      text-align: center;
      margin-bottom: 0.25rem;
    }

    .subtitle {
      text-align: center;
      color: #737373;
      font-size: 0.875rem;
      margin-bottom: 2rem;
    }

    .error {
      background: #1c0a0a;
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      padding: 0.625rem 0.875rem;
      border-radius: 8px;
      font-size: 0.8125rem;
      margin-bottom: 1.25rem;
    }

    label {
      display: block;
      font-size: 0.8125rem;
      font-weight: 500;
      color: #a3a3a3;
      margin-bottom: 0.375rem;
    }

    input[type="text"],
    input[type="password"] {
      width: 100%;
      padding: 0.625rem 0.75rem;
      background: #0a0a0a;
      border: 1px solid #262626;
      border-radius: 8px;
      color: #e5e5e5;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s;
      margin-bottom: 1rem;
    }

    input:focus {
      border-color: #525252;
    }

    button {
      width: 100%;
      padding: 0.625rem;
      background: #e5e5e5;
      color: #0a0a0a;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 0.5rem;
    }

    button:hover { background: #d4d4d4; }
    button:active { background: #c0c0c0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Sign In</h1>
    <p class="subtitle">Authenticate to continue</p>
    ${errorHtml}
    <form method="POST" action="/login">
      <input type="hidden" name="redirect" value="${redirect}">
      <label for="username">Username</label>
      <input type="text" id="username" name="username" autocomplete="username" autofocus required>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
};
