console.log("[WQP] pro.js loaded");

const SUPABASE_URL = "https://cwrlnfcgryhmohopdwrs.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_cZS7gdA_x9PVboQs1bFoYA_I2YTaUaM";

let supabaseClient = null;

async function getSb() {
  if (supabaseClient) return supabaseClient;

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing Supabase config');
    }

    supabaseClient = supabase.createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    return supabaseClient;
  } catch (e) {
    console.error('Supabase init failed', e);
    return null;
  }
}

/* bootPro is wrapped with asyncGuard after definition to prevent
 * concurrent calls from DOMContentLoaded, handleAuth, createTeam,
 * joinTeam, and saveTeamJob all firing overlapping Supabase RPCs. */
async function _bootProInner() {
  const sb = await getSb();
  if (!sb) return;

  let user = null;
  try {
    const { data } = await sb.auth.getUser();
    user = data?.user || null;
  } catch (e) {
    console.warn('getUser failed:', e.message);
  }

  if (!user) {
    proState.user = null;
    renderProUI();
    return;
  }

  proState.user = user;

  try {
    const { data: team, error } = await sb.rpc('get_my_team');

    const noTeam =
      error ||
      !team ||
      (Array.isArray(team) && team.length === 0);

    if (noTeam) {
      proState.teamId = null;
      proState.teamName = '';
      proState.teamRole = '';
      proState.inviteCode = '';
      proState.jobs = [];

      if (pendingInviteCode) {
        try {
          const { error: joinErr } = await sb.rpc('join_team_by_invite', {
            p_invite_code: pendingInviteCode
          });
          if (joinErr) throw joinErr;

          showToast('Joined team!', 'success');
          localStorage.removeItem('pending_invite');
          pendingInviteCode = null;
          return await _bootProInner();
        } catch (joinE) {
          console.error('Auto-join failed:', joinE.message);
          showToast('Could not join team with that invite code', 'error');
          localStorage.removeItem('pending_invite');
          pendingInviteCode = null;
        }
      }
    } else {
      const t = Array.isArray(team) ? team[0] : team;

      proState.teamId = t.team_id || t.id;
      proState.teamName = t.business_name || t.team_name || '';
      proState.teamRole = t.role || 'staff';
      proState.inviteCode = t.invite_code;

      localStorage.removeItem('pending_invite');
      pendingInviteCode = null;

      const { data: jobs } = await sb
        .from('jobs')
        .select('*')
        .eq('team_id', proState.teamId)
        .order('created_at', { ascending: false });

      proState.jobs = jobs || [];

      const { data: s } = await sb
        .from('team_settings')
        .select('*')
        .eq('team_id', proState.teamId)
        .single();

      if (s) applyTeamSettings(s);
      setupRealtimeChannel(sb);
    }
  } catch (e) {
    console.error(e);
  }

  try {
    await loadSubscription(sb);
  } catch (e) {
    console.error('Subscription load error', e);
  }

  renderProUI();
  renderSubscriptionUI();
  syncSettingsForm();
  renderSettingsGrids();
  updateKPIs();
  renderJobsList();
  if (typeof renderRebookingSection === 'function') renderRebookingSection();
  updateQuoteDisplay();
}

const bootPro = asyncGuard(_bootProInner, 'bootPro');

async function _handleAuthInner() {
  const email = (el('auth-email') || {}).value || '';
  const password = (el('auth-password') || {}).value || '';
  const sb = await getSb();
  if (!sb) return;

  try {
    let res;

    if (authMode === 'signup') {
      const name = (el('auth-name') || {}).value || '';
      res = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      });
    } else {
      res = await sb.auth.signInWithPassword({ email, password });
    }

    if (res.error) throw res.error;

    showToast('Welcome!', 'success');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

const handleAuth = asyncGuard(_handleAuthInner, 'handleAuth');

async function _createTeamInner() {
  const name = ((el('team-name-input') || {}).value || '').trim();
  if (!name) return showToast('Enter business name', 'error');

  const sb = await getSb();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('create_team', {
      p_business_name: name
    });
    if (error) throw error;

    showToast('Team created!', 'success');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

const createTeam = asyncGuard(_createTeamInner, 'createTeam');

async function _joinTeamInner() {
  const code = ((el('invite-code-input') || {}).value || '').trim();
  if (!code) return showToast('Enter invite code', 'error');

  const sb = await getSb();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('join_team_by_invite', {
      p_invite_code: code
    });
    if (error) throw error;

    showToast('Joined team!', 'success');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

const joinTeam = asyncGuard(_joinTeamInner, 'joinTeam');

function renderProUI() {
  const authPanel = el('pro-auth-panel');
  const dashboard = el('pro-dashboard');
  const accountPanel = el('pro-account-card');
  const teamSetup = el('pro-team-setup');
  const teamDash = el('pro-team-dashboard');
  const headerBadge = el('pro-badge');

  if (!proState.user) {
    if (authPanel) authPanel.classList.remove('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    if (accountPanel) accountPanel.classList.add('hidden');
    if (teamSetup) teamSetup.classList.add('hidden');
    if (teamDash) teamDash.classList.add('hidden');
    if (headerBadge) {
      headerBadge.textContent = 'FREE';
      headerBadge.className = 'badge-free';
    }
    return;
  }

  if (authPanel) authPanel.classList.add('hidden');
  if (dashboard) dashboard.classList.remove('hidden');
  if (accountPanel) accountPanel.classList.remove('hidden');

  const nameEl = el('team-name-display');
  const emailEl = el('team-email-display');
  const roleBadge = el('team-role-badge');

  if (nameEl) {
    nameEl.textContent =
      proState.teamName ||
      proState.user.user_metadata?.full_name ||
      'My Account';
  }

  if (emailEl) emailEl.textContent = proState.user.email || '';

  if (roleBadge) {
    const role = (proState.teamRole || 'owner').toLowerCase();
    roleBadge.textContent = role === 'owner' ? 'Owner' : 'Staff';
    roleBadge.className =
      role === 'owner'
        ? 'role-badge role-owner'
        : 'role-badge role-staff';
  }

  const planInfo = getPlanDisplayInfo();
  if (headerBadge) {
    headerBadge.textContent = planInfo.headerBadgeText;
    headerBadge.className = planInfo.headerBadgeClass;
  }

  if (proState.teamId) {
    if (teamSetup) teamSetup.classList.add('hidden');
    if (teamDash) teamDash.classList.remove('hidden');
  } else {
    if (teamSetup) teamSetup.classList.remove('hidden');
    if (teamDash) teamDash.classList.add('hidden');
  }

  const invoiceUpsellCard = el('invoice-upsell-card');
  const invoiceUpsellBtn = el('invoice-upsell-btn');

  if (invoiceUpsellCard) invoiceUpsellCard.classList.remove('hidden');

  if (invoiceUpsellBtn) {
    invoiceUpsellBtn.textContent = hasProAccess()
      ? 'Go to Invoices'
      : 'Unlock Invoices 🔒';
    invoiceUpsellBtn.classList.toggle('btn-primary', !hasProAccess());
    invoiceUpsellBtn.classList.toggle('btn-secondary', hasProAccess());
  }

  const logoSection = el('logo-upload-section');
  if (logoSection) {
    logoSection.classList.toggle(
      'hidden',
      !proState.teamId || !canAccessSettings()
    );
  }

  if (proState.teamId && canAccessSettings()) {
    renderLogoPreview();
  }

  if (typeof renderRebookingSection === 'function') {
    renderRebookingSection();
  }
}

async function handleSignOut() {
  const sb = await getSb();

  if (sb) {
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
    await sb.auth.signOut();
  }

  proState.subscription = null;
  proState.entitlementSource = null;
  proState.logoDataUrl = null;
  location.reload();
}
