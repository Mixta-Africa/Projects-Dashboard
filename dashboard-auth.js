/**
 * dashboard-auth.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Drop-in Google Sign-In auth layer for the Mixta Africa Projects Dashboard.
 *
 * HOW TO INTEGRATE (3 steps):
 *   1. Add  <script src="dashboard-auth.js"></script>  just before </body>
 *      (after all existing <script> tags so it runs last)
 *   2. Add the login overlay HTML block (see bottom of this file / README)
 *   3. That's it. The module hides all dashboard content until the user
 *      signs in with an approved Google account.
 *
 * ACCESS CONTROL:
 *   • "Both"      → sees Lakowe Crossings and Lakowe Annexe
 *   • "Crossings" → sees Lakowe Crossings only
 *   • "Annexe"    → sees Lakowe Annexe only
 *   • Any other Google account → denied, shown an error message
 *
 * Generated from Dashboard_Mailing_List.xlsx — 35 approved emails
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  // ── EMAIL ALLOWLIST (derived from Dashboard_Mailing_List.xlsx) ──────────────
  // Key: lowercase email address
  // Value: "Both" | "Crossings" | "Annexe"
  const ALLOWED_EMAILS = {
    // ── Both projects ──────────────────────────────────────────────────────────
    "a.arokodare@mixtafrica.com":            "Both",
    "a.cameron-cole@mixtafrica.com":         "Both",
    "a.omotayo@mixtafrica.com":              "Both",
    "a.uwuigbe@mixtafrica.com":              "Both",
    "c.ajie@mixtafrica.com":                 "Both",
    "c.uwadiale@mixtafrica.com":             "Both",
    "dcs_nigeria@mixtafrica.com":            "Both",
    "deji.alli@mixtafrica.com":              "Both",
    "e.ezeh@mixtafrica.com":                 "Both",
    "h.kacou@mixtafrica.com":                "Both",
    "ipd_nigeria@mixtafrica.com":            "Both",
    "j.olowe@mixtafrica.com":                "Both",
    "k.haastrup@mixtafrica.com":             "Both",
    "mcc@mixtafrica.com":                    "Both",
    "mn_costingandprocurement@mixtafrica.com":"Both",
    "n.anaeto@mixtafrica.com":               "Both",
    "o.ajala@mixtafrica.com":                "Both",
    "o.ekpikie@mixtafrica.com":              "Both",
    "o.olasunkanmi@mixtafrica.com":          "Both",
    "o.shoyoye@mixtafrica.com":              "Both",
    "o.tona-obafemi@mixtafrica.com":         "Both",
    "pmo_nigeria@mixtafrica.com":            "Both",
    "r.idaeho@mixtafrica.com":               "Both",
    "r.jolaiya@mixtafrica.com":              "Both",
    "s.hughes@mixtafrica.com":               "Both",
    "t.adebule@mixtafrica.com":              "Both",
    "t.adeniyi@mixtafrica.com":              "Both",
    "t.banjo@mixtafrica.com":                "Both",
    "t.ibidokun@mixtafrica.com":             "Both",
    "u.ojembe@mixtafrica.com":               "Both",
    "w.salami@mixtafrica.com":               "Both",
    // ── Lakowe Crossings only ──────────────────────────────────────────────────
    "b.ajayi@mixtafrica.com":                "Crossings",
    "o.isabu@mixtafrica.com":                "Crossings",
    "o.james@mixtafrica.com":                "Crossings",
    // ── Lakowe Annexe only ────────────────────────────────────────────────────
    "o.ogunewu@mixtafrica.com":              "Annexe",
  };

  // ── CSS injected at runtime ──────────────────────────────────────────────────
  const CSS = `
    /* ── Auth gate: hide all dashboard content by default ── */
    body.auth-pending > *:not(#auth-gate-overlay) {
      display: none !important;
    }
    body.auth-pending #auth-gate-overlay {
      display: flex !important;
    }

    /* ── Login overlay ── */
    #auth-gate-overlay {
      display: none;
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: linear-gradient(135deg, #f0f4f0 0%, #f8f0f0 100%);
      align-items: center;
      justify-content: center;
      font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }

    .auth-gate-card {
      background: #ffffff;
      border-radius: 20px;
      padding: 44px 40px 36px;
      width: 100%;
      max-width: 400px;
      box-shadow:
        0 2px 4px rgba(0,0,0,0.04),
        0 8px 24px rgba(0,0,0,0.08),
        0 24px 48px rgba(0,0,0,0.06);
      text-align: center;
    }

    .auth-gate-logo {
      width: 72px;
      height: 72px;
      border-radius: 16px;
      object-fit: contain;
      margin: 0 auto 20px;
      display: block;
      background: #f5f5f5;
    }

    .auth-gate-card h1 {
      font-size: 22px;
      font-weight: 800;
      color: #1a1a1a;
      letter-spacing: -0.03em;
      margin-bottom: 6px;
    }

    .auth-gate-card h1 span { color: #D32F2F; }

    .auth-gate-subtitle {
      font-size: 13px;
      color: #888;
      margin-bottom: 32px;
      line-height: 1.5;
    }

    /* Google sign-in button */
    .auth-google-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 14px 20px;
      background: #ffffff;
      color: #3c4043;
      border: 1.5px solid #dadce0;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-family: inherit;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      margin-bottom: 16px;
    }
    .auth-google-btn:hover {
      background: #f8f9fa;
      border-color: #bbb;
      box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    }
    .auth-google-btn:active { transform: scale(0.99); }
    .auth-google-btn:disabled {
      opacity: 0.6;
      cursor: default;
      transform: none;
    }

    .auth-google-icon {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    /* Hint text */
    .auth-email-hint {
      font-size: 11.5px;
      color: #aaa;
      margin-top: 0;
      margin-bottom: 20px;
      letter-spacing: 0.01em;
    }

    /* Error / status message */
    .auth-gate-msg {
      min-height: 18px;
      font-size: 12px;
      color: #c62828;
      font-weight: 600;
      margin-bottom: 0;
      line-height: 1.5;
      padding: 0 4px;
    }
    .auth-gate-msg.info { color: #555; font-weight: 500; }

    /* Signed-in state nav badge */
    .auth-signed-in-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.22);
      border-radius: 100px;
      padding: 3px 10px 3px 7px;
      white-space: nowrap;
    }
    .auth-signed-in-badge::before {
      content: '';
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #4ade80;
      flex-shrink: 0;
    }

    /* Loading spinner inside button */
    .auth-spin {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #dadce0;
      border-top-color: #4285f4;
      border-radius: 50%;
      animation: authSpin 0.7s linear infinite;
    }
    @keyframes authSpin { to { transform: rotate(360deg); } }

    /* Access-restricted modal */
    .auth-restricted-msg {
      background: #fff5f5;
      border: 1px solid #ffcdd2;
      border-radius: 10px;
      padding: 14px 16px;
      font-size: 12.5px;
      color: #b71c1c;
      line-height: 1.6;
      margin-top: 16px;
      text-align: left;
    }
    .auth-restricted-msg strong { display: block; margin-bottom: 4px; font-size: 13px; }

    /* Project badge shown to user after sign-in */
    .auth-access-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 3px 10px;
      border-radius: 100px;
      margin-bottom: 24px;
    }
    .auth-access-badge.both      { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
    .auth-access-badge.crossings { background: #e8f5e9; color: #2e7d32; border: 1px solid #a5d6a7; }
    .auth-access-badge.annexe    { background: #fff0f0; color: #c62828; border: 1px solid #ffcdd2; }
  `;

  // ── Google logo SVG (inline, avoids external dependency) ────────────────────
  const GOOGLE_ICON_SVG = `<svg class="auth-google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>`;

  // ── Overlay HTML ─────────────────────────────────────────────────────────────
  const OVERLAY_HTML = `
    <div id="auth-gate-overlay">
      <div class="auth-gate-card">
        <img src="Mixta Africa.jpg" alt="Mixta Africa" class="auth-gate-logo"
             onerror="this.style.display='none'">
        <h1>Projects <span>Tracker</span></h1>
        <p class="auth-gate-subtitle">Mixta Africa — Live Performance Dashboard</p>

        <button class="auth-google-btn" id="auth-google-btn" onclick="authGate.signIn()">
          ${GOOGLE_ICON_SVG}
          <span id="auth-btn-label">Sign in with Google</span>
        </button>

        <p class="auth-email-hint">Your company email</p>
        <p class="auth-gate-msg" id="auth-gate-msg"></p>
      </div>
    </div>
  `;

  // ── Module state ─────────────────────────────────────────────────────────────
  let _fbAuth = null;
  let _authReady = false;
  let _currentAccess = null; // "Both" | "Crossings" | "Annexe" | null

  // ── Public API attached to window ───────────────────────────────────────────
  window.authGate = {
    signIn,
    signOut,
    getAccess: () => _currentAccess,
  };

  // ── Boot ────────────────────────────────────────────────────────────────────
  function boot() {
    injectCSS();
    injectOverlay();
    lockBody();
    waitForFirebase();
  }

  function injectCSS() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function injectOverlay() {
    const div = document.createElement('div');
    div.innerHTML = OVERLAY_HTML.trim();
    document.body.insertBefore(div.firstElementChild, document.body.firstChild);
  }

  function lockBody() {
    document.body.classList.add('auth-pending');
  }

  function unlockBody() {
    document.body.classList.remove('auth-pending');
    const overlay = document.getElementById('auth-gate-overlay');
    if (overlay) overlay.style.display = 'none';
    // Tell the dashboard it can now load data and sync sheets
    if (typeof window.onAuthGateReady === 'function') {
      window.onAuthGateReady();
      window.onAuthGateReady = null; // run once only
    }
  }

  // ── Initialize Firebase and attach auth listener ────────────────────────────
  // dashboard-auth.js is the sole owner of Firebase Auth.
  // It initializes the Firebase app if not already done, then attaches the gate.
  function waitForFirebase(attempts = 0) {
    if (typeof firebase === 'undefined') {
      if (attempts < 40) { setTimeout(() => waitForFirebase(attempts + 1), 250); }
      else { setMsg('Firebase SDK failed to load. Please refresh.', false); }
      return;
    }
    // Initialize app if not already done
    if (!firebase.apps || firebase.apps.length === 0) {
      // Read config from the page's FIREBASE_CONFIG global (set in index.html)
      const cfg = window.FIREBASE_CONFIG;
      if (!cfg || !cfg.apiKey || cfg.apiKey === 'YOUR_API_KEY') {
        setMsg('Firebase not configured. Contact admin.', false);
        return;
      }
      try { firebase.initializeApp(cfg); } catch(e) { /* already initialized */ }
    }
    _fbAuth = firebase.auth();
    _fbAuth.onAuthStateChanged(onAuthStateChanged);
    _authReady = true;
  }

  // ── Auth state handler ───────────────────────────────────────────────────────
  function onAuthStateChanged(user) {
    if (!user) {
      // Not signed in — keep gate visible
      _currentAccess = null;
      setBtnReady();
      return;
    }

    const email = (user.email || '').toLowerCase().trim();
    const access = ALLOWED_EMAILS[email];

    if (!access) {
      // Signed in but not on the list
      _currentAccess = null;
      showAccessDenied(user.email);
      // Auto sign-out so they don't stay in Firebase session
      _fbAuth.signOut();
      return;
    }

    // ── Authorised ──────────────────────────────────────────────────────────
    _currentAccess = access;
    unlockBody();
    updateNavBadge(user, access);
    applyProjectRestriction(access);
    syncLegacyAuthUI(user, access);
    // Notify the dashboard so it can set currentUser/currentUserRole
    if (typeof window.onAuthGateSignedIn === 'function') {
      window.onAuthGateSignedIn(user, access);
    }
  }

  // ── Google sign-in (popup) ───────────────────────────────────────────────────
  function signIn() {
    if (!_authReady) {
      setMsg('Still loading… please wait a moment.', true);
      return;
    }
    setBtnLoading();
    setMsg('Opening Google sign-in…', true);
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    _fbAuth.signInWithPopup(provider)
      .catch((err) => {
        setBtnReady();
        if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
          setMsg('Sign-in cancelled.', true);
        } else {
          setMsg('Sign-in error: ' + err.message, false);
        }
      });
  }

  function signOut() {
    if (_fbAuth) _fbAuth.signOut();
    _currentAccess = null;
    lockBody();
    showOverlay();
    setBtnReady();
    setMsg('', true);
    // Remove nav badge if present
    const badge = document.getElementById('auth-nav-badge');
    if (badge) badge.remove();
    // Restore login/logout buttons from original dashboard
    _restoreOriginalAuthUI();
  }

  // ── UI helpers ───────────────────────────────────────────────────────────────
  function showOverlay() {
    const overlay = document.getElementById('auth-gate-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function setMsg(text, isInfo) {
    const el = document.getElementById('auth-gate-msg');
    if (!el) return;
    el.textContent = text;
    el.className = 'auth-gate-msg' + (isInfo ? ' info' : '');
  }

  function setBtnLoading() {
    const btn = document.getElementById('auth-google-btn');
    const lbl = document.getElementById('auth-btn-label');
    if (btn) btn.disabled = true;
    if (lbl) lbl.innerHTML = '<span class="auth-spin"></span>';
  }

  function setBtnReady() {
    const btn = document.getElementById('auth-google-btn');
    const lbl = document.getElementById('auth-btn-label');
    if (btn) btn.disabled = false;
    if (lbl) lbl.textContent = 'Sign in with Google';
  }

  function showAccessDenied(email) {
    setBtnReady();
    const card = document.querySelector('.auth-gate-card');
    // Remove old denied message if present
    const old = document.getElementById('auth-denied-block');
    if (old) old.remove();

    const block = document.createElement('div');
    block.id = 'auth-denied-block';
    block.className = 'auth-restricted-msg';
    block.innerHTML = `
      <strong>Access not granted</strong>
      <b>${escHtml(email)}</b> is not on the approved access list for this dashboard.
      Please sign in with your Mixta Africa company email, or contact
      <a href="mailto:o.olasunkanmi@mixtafrica.com" style="color:#c62828;">o.olasunkanmi@mixtafrica.com</a>
      to request access.
    `;
    card.appendChild(block);
    setMsg('', true);
  }

  // ── Nav badge (replaces the old auth controls in the nav bar) ───────────────
  function updateNavBadge(user, access) {
    // Hide original login/logout buttons to avoid confusion
    const loginBtn  = document.getElementById('auth-login-btn');
    const logoutBtn = document.getElementById('auth-logout-btn');
    const oldBadge  = document.getElementById('auth-user-badge');
    if (loginBtn)  loginBtn.style.display  = 'none';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (oldBadge)  oldBadge.style.display  = 'none';

    // Remove any existing badge we injected
    const existing = document.getElementById('auth-nav-badge');
    if (existing) existing.remove();

    const name = user.displayName
      ? user.displayName.split(' ')[0]
      : (user.email || '').split('@')[0];

    const accessLabel = access === 'Both' ? 'All Projects' : 'Lakowe ' + access;

    const wrapper = document.createElement('div');
    wrapper.id = 'auth-nav-badge';
    wrapper.style.cssText = 'display:flex;align-items:center;gap:8px;';
    wrapper.innerHTML = `
      <span class="auth-signed-in-badge" title="${escHtml(user.email)}">${escHtml(name)} · ${escHtml(accessLabel)}</span>
      <button onclick="authGate.signOut()" title="Sign out"
        style="font-size:11px;font-weight:700;padding:5px 10px;border-radius:6px;
               border:1px solid rgba(255,255,255,0.2);background:rgba(211,47,47,0.15);
               color:#fff;cursor:pointer;font-family:inherit;transition:background 0.15s;"
        onmouseover="this.style.background='rgba(211,47,47,0.35)'"
        onmouseout="this.style.background='rgba(211,47,47,0.15)'">Sign out</button>
    `;

    // Insert into nav-right (before the last element, or append)
    const navRight = document.querySelector('.nav-right');
    if (navRight) {
      navRight.insertBefore(wrapper, navRight.firstChild);
    }
  }

  // ── Project restriction: hide project buttons the user can't access ──────────
  function applyProjectRestriction(access) {
    const btnCx    = document.getElementById('btn-nav-cx');
    const btnAnnex = document.getElementById('btn-nav-annex');
    const landingCx    = document.querySelector('.landing-btn.btn-cx');
    const landingAnnex = document.querySelector('.landing-btn.btn-annex');

    if (access === 'Crossings') {
      if (btnAnnex) btnAnnex.style.display = 'none';
      if (landingAnnex) landingAnnex.style.display = 'none';
    } else if (access === 'Annexe') {
      if (btnCx) btnCx.style.display = 'none';
      if (landingCx) landingCx.style.display = 'none';
    }
    // "Both" — no changes needed, show everything
  }

  // ── Sync with the existing dashboard auth UI so Firebase listeners don't fight us
  function syncLegacyAuthUI(user, access) {
    // The existing dashboard has its own onAuthStateChanged listener.
    // Since we're reusing the same Firebase app, that listener will also fire.
    // We don't need to do anything extra — the existing USER_ROLES map handles
    // editor/viewer permissions for task status changes.
    // This function is a hook for future use.
  }

  function _restoreOriginalAuthUI() {
    const loginBtn  = document.getElementById('auth-login-btn');
    if (loginBtn) loginBtn.style.display = 'inline-flex';
  }

  // ── Utility ─────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Run on DOMContentLoaded ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
