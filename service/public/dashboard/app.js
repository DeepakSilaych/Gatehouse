const api = {
  async request(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },
  get: (url) => api.request('GET', url),
  post: (url, body) => api.request('POST', url, body),
  put: (url, body) => api.request('PUT', url, body),
  del: (url) => api.request('DELETE', url),
};

function toast(message, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const content = document.getElementById('content');
let currentTab = 'overview';

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  loadTab(tab);
}

async function loadTab(tab) {
  try {
    switch (tab) {
      case 'overview': return renderOverview();
      case 'users': return renderUsers();
      case 'sites': return renderSites();
      case 'sessions': return renderSessions();
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function renderOverview() {
  const stats = await api.get('/api/stats');
  content.innerHTML = `
    <div class="stats">
      <div class="stat-card">
        <div class="label">Users</div>
        <div class="value">${stats.users}</div>
      </div>
      <div class="stat-card">
        <div class="label">Active Sessions</div>
        <div class="value">${stats.sessions}</div>
      </div>
      <div class="stat-card">
        <div class="label">Sites</div>
        <div class="value">${stats.sites}</div>
      </div>
      <div class="stat-card">
        <div class="label">Protected</div>
        <div class="value">${stats.protected_sites}</div>
      </div>
    </div>
  `;
}

async function renderUsers() {
  const users = await api.get('/api/users');
  content.innerHTML = `
    <div class="section-header">
      <h2>Users</h2>
      <button class="btn btn-primary" id="add-user-btn">Add User</button>
    </div>
    ${users.length ? `
    <table>
      <thead><tr><th>Username</th><th>Created</th><th></th></tr></thead>
      <tbody>
        ${users.map((u) => `
          <tr>
            <td class="mono">${esc(u.username)}</td>
            <td class="relative-time">${relativeTime(u.created_at)}</td>
            <td style="text-align:right">
              <button class="btn btn-danger btn-sm" data-delete-user="${esc(u.username)}">Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>` : '<div class="empty">No users yet</div>'}
  `;

  document.getElementById('add-user-btn').addEventListener('click', () => {
    document.getElementById('user-form').reset();
    document.getElementById('user-dialog').showModal();
  });

  content.querySelectorAll('[data-delete-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const username = btn.dataset.deleteUser;
      if (!confirm(`Delete user "${username}"?`)) return;
      try {
        await api.del(`/api/users/${username}`);
        toast(`Deleted ${username}`);
        renderUsers();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

async function renderSites() {
  const sites = await api.get('/api/sites');
  content.innerHTML = `
    <div class="section-header">
      <h2>Sites</h2>
      <button class="btn btn-primary" id="add-site-btn">Add Site</button>
    </div>
    ${sites.length ? sites.map((s) => `
    <div class="site-card">
      <div class="site-card-header">
        <h3>${esc(s.domain)}</h3>
        <div class="site-actions">
          <button class="btn btn-sm" data-edit-site="${esc(s.domain)}">Edit</button>
          <button class="btn btn-danger btn-sm" data-delete-site="${esc(s.domain)}">Delete</button>
        </div>
      </div>
      <div>
        <div class="site-detail">Upstream: <span class="mono">${esc(s.upstream)}</span></div>
        <div class="site-detail">Status: ${s.protected
          ? '<span class="badge badge-success">Protected</span>'
          : '<span class="badge badge-muted">Public</span>'}</div>
        ${s.public_paths?.length ? `<div class="site-detail">Public paths: <span class="mono">${s.public_paths.map(esc).join(', ')}</span></div>` : ''}
        ${s.ip_whitelist?.length ? `<div class="site-detail">IP whitelist: <span class="mono">${s.ip_whitelist.map(esc).join(', ')}</span></div>` : ''}
      </div>
    </div>
    `).join('') : '<div class="empty">No sites configured</div>'}
  `;

  document.getElementById('add-site-btn').addEventListener('click', () => openSiteDialog());

  content.querySelectorAll('[data-edit-site]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const site = sites.find((s) => s.domain === btn.dataset.editSite);
      if (site) openSiteDialog(site);
    });
  });

  content.querySelectorAll('[data-delete-site]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const domain = btn.dataset.deleteSite;
      if (!confirm(`Remove site "${domain}"?`)) return;
      try {
        await api.del(`/api/sites/${encodeURIComponent(domain)}`);
        toast(`Removed ${domain}`);
        renderSites();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

function openSiteDialog(site) {
  const form = document.getElementById('site-form');
  const dialog = document.getElementById('site-dialog');
  const title = document.getElementById('site-dialog-title');

  form.reset();
  if (site) {
    title.textContent = 'Edit Site';
    form.mode.value = 'edit';
    form.domain.value = site.domain;
    form.domain.readOnly = true;
    form.upstream.value = site.upstream;
    form.protected.checked = site.protected;
    form.public_paths.value = (site.public_paths || []).join('\n');
    form.ip_whitelist.value = (site.ip_whitelist || []).join('\n');
  } else {
    title.textContent = 'Add Site';
    form.mode.value = 'add';
    form.domain.readOnly = false;
  }
  dialog.showModal();
}

async function renderSessions() {
  const sessions = await api.get('/api/sessions');
  content.innerHTML = `
    <div class="section-header">
      <h2>Active Sessions</h2>
    </div>
    ${sessions.length ? `
    <table>
      <thead><tr><th>User</th><th>IP</th><th>User Agent</th><th>Last Seen</th><th>Created</th><th></th></tr></thead>
      <tbody>
        ${sessions.map((s) => `
          <tr>
            <td class="mono">${esc(s.username)}</td>
            <td class="mono">${esc(s.ip || '—')}</td>
            <td class="truncate">${esc(shortUA(s.user_agent))}</td>
            <td class="relative-time">${relativeTime(s.last_seen)}</td>
            <td class="relative-time">${relativeTime(s.created_at)}</td>
            <td style="text-align:right">
              <button class="btn btn-danger btn-sm" data-revoke="${esc(s.id)}">Revoke</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>` : '<div class="empty">No active sessions</div>'}
  `;

  content.querySelectorAll('[data-revoke]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.del(`/api/sessions/${btn.dataset.revoke}`);
        toast('Session revoked');
        renderSessions();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

function shortUA(ua) {
  if (!ua) return '—';
  const match = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/);
  return match ? match[0] : ua.slice(0, 50);
}

function esc(str) {
  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

document.getElementById('user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await api.post('/api/users', {
      username: form.username.value,
      password: form.password.value,
    });
    document.getElementById('user-dialog').close();
    toast('User created');
    renderUsers();
  } catch (err) { toast(err.message, 'error'); }
});

document.getElementById('site-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const isEdit = form.mode.value === 'edit';
  const domain = form.domain.value;

  const body = {
    upstream: form.upstream.value,
    protected: form.protected.checked,
    public_paths: form.public_paths.value.split('\n').map((s) => s.trim()).filter(Boolean),
    ip_whitelist: form.ip_whitelist.value.split('\n').map((s) => s.trim()).filter(Boolean),
  };

  try {
    if (isEdit) {
      await api.put(`/api/sites/${encodeURIComponent(domain)}`, body);
      toast('Site updated');
    } else {
      await api.post('/api/sites', { domain, ...body });
      toast('Site added');
    }
    document.getElementById('site-dialog').close();
    renderSites();
  } catch (err) { toast(err.message, 'error'); }
});

switchTab('overview');
