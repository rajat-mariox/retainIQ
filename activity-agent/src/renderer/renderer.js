const app = document.getElementById('app');

let state = { authenticated: false, status: 'Ended', today: {} };

function minutes(value = 0) {
  const h = Math.floor(value / 60);
  const m = Math.round(value % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function statusClass(status) {
  return String(status || '').toLowerCase();
}

function renderLogin() {
  app.innerHTML = `
    <section class="shell">
      <div class="brand"><div class="logo">R</div><div><h1>RetainIQ</h1><p>Activity Agent</p></div></div>
      <form id="loginForm" class="panel">
        <label>Email<input name="email" type="email" autocomplete="email" required /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required /></label>
        <button type="submit">Login</button>
        <p id="error" class="error"></p>
      </form>
    </section>
  `;
  document.getElementById('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const error = document.getElementById('error');
    error.textContent = '';
    try {
      await window.retainiq.login({ email: form.get('email'), password: form.get('password') });
      state = await window.retainiq.getState();
      render();
    } catch (err) {
      error.textContent = err.message || 'Login failed';
    }
  });
}

function renderAgent() {
  const isEnded = state.status === 'Ended';
  app.innerHTML = `
    <section class="shell">
      <div class="brand">
        <div class="logo">R</div>
        <div><h1>${state.user?.name || 'RetainIQ'}</h1><p>${state.user?.email || 'Activity Agent'}</p></div>
      </div>

      <div class="status ${statusClass(state.status)}">
        <span></span>
        <div><p>Current status</p><strong>${state.status}</strong></div>
      </div>

      <div class="grid">
        <div class="metric"><p>Active</p><strong>${minutes(state.today?.activeMinutes)}</strong></div>
        <div class="metric"><p>Idle</p><strong>${minutes(state.today?.idleMinutes)}</strong></div>
        <div class="metric"><p>Break</p><strong>${minutes(state.today?.breakMinutes)}</strong></div>
        <div class="metric"><p>Last screenshot</p><strong>${state.lastScreenshotAt ? new Date(state.lastScreenshotAt).toLocaleTimeString() : '-'}</strong></div>
      </div>

      <div class="controls">
        <button id="start" ${!isEnded ? 'disabled' : ''}>Start Work</button>
      </div>

      <div class="panel subtle">
        <p>Tracks aggregate keyboard/mouse counts, active/idle minutes, app usage, and periodic screenshots. It never stores actual typed text, passwords, private chat content, webcam, or microphone.</p>
      </div>

      <button id="logout" class="secondary">Logout</button>
      <p id="error" class="error"></p>
    </section>
  `;
  bindAction('start', window.retainiq.start);
  bindAction('logout', window.retainiq.logout);
}

function bindAction(id, action) {
  document.getElementById(id).addEventListener('click', async () => {
    const error = document.getElementById('error');
    error.textContent = '';
    try {
      await action();
      state = await window.retainiq.getState();
      render();
    } catch (err) {
      error.textContent = err.message || 'Action failed';
    }
  });
}

function render() {
  if (state.authenticated) renderAgent();
  else renderLogin();
}

window.retainiq.onState((nextState) => {
  state = nextState;
  render();
});

window.retainiq.getState().then((nextState) => {
  state = nextState;
  render();
});
