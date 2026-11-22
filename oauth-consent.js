(() => {
  'use strict';
  const auth = window.pmConnectorAuth;
  const byId = id => document.getElementById(id);
  const dialog = byId('aiConnectionDialog');
  if (!auth || !dialog) return;

  const idPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const parameters = new URLSearchParams(location.search);
  let requestId = location.pathname === '/oauth/consent' ? parameters.get('authorization_id') : null;
  const status = byId('aiConnectionStatus');
  const scope = byId('aiConnectionScope');
  const allow = byId('aiConnectionApprove');
  const deny = byId('aiConnectionDeny');
  const login = byId('aiConnectionLogin');
  const grants = byId('aiConnectionGrants');
  let loading = 0;
  let resumeAfterLogin = false;

  function providerFor(value) {
    try {
      const url = new URL(value);
      if (url.username || url.password) return null;
      if (url.origin === 'https://chatgpt.com' && (
        url.pathname === '/connector_platform_oauth_redirect' ||
        /^\/connector\/oauth\/[a-z0-9_-]+$/i.test(url.pathname)
      )) return 'ChatGPT';
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname) &&
        url.port && url.pathname === '/callback') return 'Claude Code（この端末）';
    } catch { /* Malformed callback. */ }
    return null;
  }

  function goToCallback(value, expected) {
    const url = new URL(value);
    if (!providerFor(url.href) || (expected && (url.origin !== expected.origin || url.pathname !== expected.pathname))) {
      throw new Error('callback');
    }
    location.assign(url.href);
  }

  async function render() {
    const version = ++loading;
    scope.hidden = allow.hidden = deny.hidden = login.hidden = true;
    grants.replaceChildren();
    status.textContent = '確認しています…';
    allow.disabled = deny.disabled = false;
    allow.onclick = deny.onclick = null;
    try {
      if (requestId !== null && !idPattern.test(requestId)) {
        status.textContent = '接続リクエストを読み取れません。AI側から接続をやり直してください。';
        return;
      }
      const email = await auth.account();
      if (version !== loading || !dialog.open) return;
      if (!email) {
        status.textContent = 'ProcessMapのアカウントでログインしてください。';
        login.hidden = false;
        return;
      }
      if (requestId === null) {
        const items = await auth.grants();
        if (version !== loading || !dialog.open) return;
        status.textContent = items.length ? '許可済みの連携' : '許可済みの連携はありません。';
        for (const { client } of items) {
          if (!idPattern.test(client?.id ?? '')) continue;
          const row = document.createElement('p');
          row.append(document.createTextNode(client.name || 'AI連携'));
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = '解除する';
          button.onclick = async () => {
            if (!confirm('「' + (client.name || 'AI連携') + '」の読み取り許可を解除しますか？')) return;
            button.disabled = true;
            try { await auth.revoke(client.id); await render(); }
            catch { status.textContent = '解除できませんでした。もう一度お試しください。'; button.disabled = false; }
          };
          row.append(button);
          grants.append(row);
        }
        return;
      }
      const { data, error } = await auth.details(requestId);
      if (version !== loading || !dialog.open) return;
      if (error || !data) throw error || new Error();
      if (data.redirect_url && !data.authorization_id) {
        goToCallback(data.redirect_url);
        return;
      }
      const provider = providerFor(data.redirect_uri);
      // The authorization server supplies the callback and checks the registered URI and PKCE.
      // The consent UI also keeps this integration limited to the intended clients and identity scope.
      const scopes = (data.scope || '').split(' ').filter(Boolean);
      if (!provider || scopes.some(item => item !== 'openid')) {
        status.textContent = 'この接続先または権限は許可できません。';
        return;
      }
      const expected = new URL(data.redirect_uri);
      scope.hidden = allow.hidden = deny.hidden = false;
      status.textContent = provider + ' が「' + email + '」の工程表の読み取りを求めています。';
      async function decide(approve) {
        allow.disabled = deny.disabled = true;
        try {
          const result = await auth.decide(requestId, approve);
          if (result.error || !result.data?.redirect_url) throw result.error || new Error();
          goToCallback(result.data.redirect_url, expected);
        } catch {
          status.textContent = '接続を完了できません。AI側から接続をやり直してください。';
          allow.disabled = deny.disabled = false;
        }
      }
      allow.onclick = () => decide(true);
      deny.onclick = () => decide(false);
    } catch {
      if (version !== loading || !dialog.open) return;
      status.textContent = requestId === null
        ? '連携を取得できません。接続設定が有効か確認してください。'
        : '接続リクエストを確認できません。AI側から接続をやり直してください。';
    }
  }

  function open() {
    byId('menu').hidden = true;
    byId('menuTrigger').setAttribute('aria-expanded', 'false');
    if (!dialog.open) dialog.showModal();
    void render();
  }
  byId('aiConnectionOpen').onclick = () => { requestId = null; open(); };
  byId('aiConnectionClose').onclick = () => dialog.close();
  login.onclick = () => {
    resumeAfterLogin = true;
    dialog.close();
    byId('loginOpen').click();
  };
  auth.onSignIn(() => {
    if (resumeAfterLogin) {
      resumeAfterLogin = false;
      open();
    }
  });
  if (requestId !== null) open();
})();
