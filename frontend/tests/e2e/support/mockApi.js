export async function setupCommonBrowserMocks(page) {
  await page.addInitScript(() => {
    class MockWebSocket {
      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
      send() {}
      close() { this.onclose?.(); }
      addEventListener() {}
      removeEventListener() {}
    }
    window.WebSocket = MockWebSocket;

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = async () => ({
        waiting: null,
        installing: null,
        addEventListener: () => {},
        update: async () => {},
      });
    }
  });
}

export async function setupApiMocks(page, options = {}) {
  const {
    authUser = null,
    loginShouldSucceed = true,
    loginError = 'Invalid credentials',
    inviteCodes = [{ id: 1, code: 'WELCOME123', role: 'kid', times_used: 0, max_uses: 10 }],
    delayedInviteCodes = false,
  } = options;

  const state = {
    inviteCodes: [...inviteCodes],
    nextInviteId: Math.max(1, ...inviteCodes.map((c) => c.id || 0)) + 1,
  };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const path = url.pathname + url.search;

    const json = (data, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });

    if (path.startsWith('/api/auth/refresh')) {
      return json({ detail: 'No session' }, 401);
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = req.postDataJSON?.() || {};
      const validCreds = body.username === 'demo' && body.password === 'password123';
      if (loginShouldSucceed && validCreds) {
        return json({
          access_token: 'fake-token',
          user: authUser || { id: 7, username: 'demo', display_name: 'Demo', role: 'parent', avatar_config: {} },
        });
      }
      return json({ detail: loginError }, 401);
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      return json({ ok: true });
    }

    if (path === '/api/auth/me' && method === 'GET') {
      if (!authUser) return json({ detail: 'Unauthorized' }, 401);
      return json(authUser);
    }

    if (path === '/api/admin/settings/features') {
      return json({ leaderboard_enabled: 'true', spin_wheel_enabled: 'true', chore_trading_enabled: 'true' });
    }

    if (path.startsWith('/api/notifications/unread-count')) return json({ count: 0 });
    if (path.startsWith('/api/notifications?')) return json([]);
    if (path === '/api/notifications/read-all' && method === 'POST') return json({ ok: true });
    if (/\/api\/notifications\/\d+\/read$/.test(url.pathname) && method === 'POST') return json({ ok: true });

    if (path === '/api/chores') return json([]);
    if (path === '/api/chores/categories') return json([]);
    if (path.startsWith('/api/stats/family')) return json([]);
    if (path.startsWith('/api/stats/me')) return json({ points_balance: 0, total_points_earned: 0, current_streak: 0, achievements_count: 0 });
    if (path.startsWith('/api/stats/kids')) return json([]);
    if (path.startsWith('/api/stats/achievements/all')) return json([]);
    if (path.startsWith('/api/rewards')) return json([]);
    if (path.startsWith('/api/wishlist')) return json([]);
    if (path.startsWith('/api/events')) return json([]);
    if (path.startsWith('/api/party')) return json([]);
    if (path.startsWith('/api/leaderboard')) return json([]);

    if (path.startsWith('/api/calendar')) {
      return json({ week_start: '2026-04-06', week_end: '2026-04-12', days: {} });
    }

    if (path === '/api/admin/users') return json([]);
    if (path.startsWith('/api/admin/api-keys')) return json([]);

    if (path === '/api/admin/invite-codes' && method === 'GET') {
      if (delayedInviteCodes) await new Promise((r) => setTimeout(r, 500));
      return json(state.inviteCodes);
    }

    if (path === '/api/admin/invite-codes' && method === 'POST') {
      const body = req.postDataJSON?.() || {};
      const newCode = {
        id: state.nextInviteId++,
        code: `CODE${Math.floor(Math.random() * 1000)}`,
        role: body.role || 'kid',
        max_uses: body.max_uses || null,
        times_used: 0,
      };
      state.inviteCodes.unshift(newCode);
      return json(newCode, 201);
    }

    if (/\/api\/admin\/invite-codes\/\d+$/.test(url.pathname) && method === 'DELETE') {
      const id = Number(url.pathname.split('/').pop());
      state.inviteCodes = state.inviteCodes.filter((c) => c.id !== id);
      return json({ ok: true });
    }

    if (path.startsWith('/api/admin/audit-log')) return json({ entries: [] });

    return json({});
  });
}

export async function setAuthenticatedToken(page) {
  await page.addInitScript(() => {
    localStorage.setItem('chorequest_access_token', 'fake-token');
  });
}
