console.log("[WQP] pro.js loaded");

async function getSb() {
  if (supabaseClient) return supabaseClient;

  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  } catch (e) {
    console.error('Supabase init failed', e);
    return null;
  }
}

async function bootPro() {
  const sb = await getSb();
  if (!sb) return;

  let user = null;
  try {
    const { data, error } = await sb.auth.getUser();
    if (error) {
      console.warn('getUser error:', error.message);
    }
    user = data ? data.user : null;
  } catch (e) {
    console.error('getUser failed:', e);
  }

  if (!user) {
    proState.user = null;
    renderProUI();
    renderSubscriptionUI();
    return;
  }

  proState.user = user;

  try {
    const { data: team, error } = await sb.rpc('get_my_team');
    const noTeam = error || !team || (Array.isArray(team) && team.length === 0);

    if (noTeam) {
      proState.teamId = null;
      proState.teamName = '';
      proState.teamRole = '';
      proState.inviteCode = '';
      proState.jobs = [];

      if (pendingInviteCode) {
        try {
          const { error: joinErr } = await sb.rpc('join_team_by_invite', { p_invite_code: pendingInviteCode });
          if (!joinErr) {
            localStorage.removeItem('pending_invite');
            pendingInviteCode = null;
            return await bootPro();
          }
        } catch (e) {
          console.error('Auto-join failed', e);
        }

        const inviteInput = el('invite-code-input');
        if (inviteInput) inviteInput.value = pendingInviteCode || '';
      }
    } else {
      const t = Array.isArray(team) ? team[0] : team;

      if (!t) {
        proState.teamId = null;
        renderProUI();
        renderSubscriptionUI();
        return;
      }

      proState.teamId = t.team_id;
      proState.teamName = t.business_name;
      proState.teamRole = t.role;
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
  updateQuoteDisplay();
}

async function handleAuth() {
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

async function createTeam() {
  const name = ((el('team-name-input') || {}).value || '').trim();
  if (!name) return showToast('Enter business name', 'error');

  const sb = await getSb();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('create_team', { p_business_name: name });
    if (error) throw error;

    showToast('Team created!', 'success');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function joinTeam() {
  const code = ((el('invite-code-input') || {}).value || '').trim();
  if (!code) return showToast('Enter invite code', 'error');

  const sb = await getSb();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('join_team_by_invite', { p_invite_code: code });
    if (error) throw error;

    showToast('Joined team!', 'success');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function renderProUI() {
  const auth = el('pro-auth-panel');
  const dash = el('pro-dashboard');
  const teamSetup = el('pro-team-setup');
  const teamDash = el('pro-team-dashboard');
  const badge = el('pro-badge');

  if (auth) auth.classList.add('hidden');
  if (dash) dash.classList.add('hidden');
  if (teamSetup) teamSetup.classList.add('hidden');
  if (teamDash) teamDash.classList.add('hidden');

  const planInfo = getPlanDisplayInfo();

  if (badge) {
    badge.textContent = planInfo.headerBadgeText;
    badge.className = planInfo.headerBadgeClass;
  }

  const headerSub = el('header-sub');
  if (headerSub) {
    if (proState.user && proState.teamId) {
      headerSub.textContent = `${proState.teamName} • ${planInfo.label}`;
    } else if (proState.user) {
      headerSub.textContent = planInfo.label;
    } else {
      headerSub.textContent = 'Fast quoting for window cleaners';
    }
  }

  if (!proState.user) {
    if (auth) auth.classList.remove('hidden');
    return;
  }

  if (dash) dash.classList.remove('hidden');

  const nameEl = el('team-name-display');
  const emailEl = el('team-email-display');
  const roleEl = el('team-role-badge');

  if (proState.teamId) {
    if (nameEl) nameEl.textContent = proState.teamName;
    if (emailEl) emailEl.textContent = proState.user.email;

    if (roleEl) {
      roleEl.textContent = proState.teamRole === 'owner' ? 'Owner' : 'Staff';
      roleEl.className = `role-badge ${proState.teamRole === 'owner' ? 'role-owner' : 'role-staff'}`;
      roleEl.style.display = '';
    }
  } else {
    if (nameEl) nameEl.textContent = proState.user.user_metadata?.full_name || 'My Account';
    if (emailEl) emailEl.textContent = proState.user.email;
    if (roleEl) roleEl.style.display = 'none';
  }

  if (!proState.teamId) {
    if (teamSetup) teamSetup.classList.remove('hidden');
  }

  if (proState.teamId) {
    if (teamDash) teamDash.classList.remove('hidden');
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
  location.reload();
}
