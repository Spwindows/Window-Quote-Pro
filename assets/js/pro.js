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
    proState.teamId = null;
    proState.teamName = '';
    proState.teamRole = '';
    proState.inviteCode = '';
    proState.jobs = [];
    proState.subscription = null;
    proState.entitlementSource = null;
    renderProUI();
    renderSubscriptionUI();
    return;
  }

  proState.user = user;

  try {
    const { data: team, error } = await sb.rpc('get_my_team');

    if (error) {
      console.error('get_my_team failed:', error.message);
      showToast('Could not load your team right now', 'error');
      proState.teamId = null;
      proState.teamName = '';
      proState.teamRole = '';
      proState.inviteCode = '';
      proState.jobs = [];
    } else {
      const t = Array.isArray(team) ? team[0] : team;

      if (!t || !t.team_id) {
        proState.teamId = null;
        proState.teamName = '';
        proState.teamRole = '';
        proState.inviteCode = '';
        proState.jobs = [];

        if (pendingInviteCode) {
          const inviteCode = normalizeInviteCode(pendingInviteCode);

          if (!isValidInviteCodeFormat(inviteCode)) {
            console.warn('Invalid pending invite code format:', pendingInviteCode);
            showToast('Invalid invite code format', 'error');
            localStorage.removeItem('pending_invite');
            pendingInviteCode = null;
          } else {
            try {
              const { error: joinErr } = await sb.rpc('join_team_by_invite', { p_invite_code: inviteCode });

              if (joinErr) {
                console.error('Auto-join failed:', joinErr.message);
                showToast(joinErr.message || 'Failed to join team with invite code', 'error');
              } else {
                localStorage.removeItem('pending_invite');
                pendingInviteCode = null;
                return await bootPro();
              }
            } catch (e) {
              console.error('Auto-join failed', e);
              showToast('Failed to join team', 'error');
            }

            const inviteInput = el('invite-code-input');
            if (inviteInput) inviteInput.value = inviteCode;
            pendingInviteCode = inviteCode;
          }
        }
      } else {
        proState.teamId = t.team_id;
        proState.teamName = t.business_name || '';
        proState.teamRole = t.role || '';
        proState.inviteCode = normalizeInviteCode(t.invite_code || '');

        localStorage.removeItem('pending_invite');
        pendingInviteCode = null;

        const { data: jobs, error: jobsError } = await sb
          .from('jobs')
          .select('*')
          .eq('team_id', proState.teamId)
          .order('created_at', { ascending: false });

        if (jobsError) {
          console.error('Jobs load failed:', jobsError.message);
          proState.jobs = [];
        } else {
          proState.jobs = jobs || [];
        }

        const { data: s, error: settingsError } = await sb
          .from('team_settings')
          .select('*')
          .eq('team_id', proState.teamId)
          .single();

        if (settingsError && settingsError.code !== 'PGRST116') {
          console.error('Team settings load failed:', settingsError.message);
        }

        if (s) applyTeamSettings(s);

        setupRealtimeChannel(sb);
      }
    }
  } catch (e) {
    console.error('bootPro team load failed', e);
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
  const email = ((el('auth-email') || {}).value || '').trim();
  const password = (el('auth-password') || {}).value || '';
  const sb = await getSb();
  if (!sb) return;

  if (!email || !password) {
    showToast('Enter email and password', 'error');
    return;
  }

  try {
    let res;

    if (authMode === 'signup') {
      const name = ((el('auth-name') || {}).value || '').trim();

      res = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      });

      if (res.error) throw res.error;

      if (!res.data?.session) {
        showToast('Account created. Check your email to confirm your account.', 'success');
        return;
      }
    } else {
      res = await sb.auth.signInWithPassword({ email, password });
      if (res.error) throw res.error;
    }

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
  const rawCode = ((el('invite-code-input') || {}).value || '').trim();
  if (!rawCode) return showToast('Enter invite code', 'error');

  const code = normalizeInviteCode(rawCode);

  if (!isValidInviteCodeFormat(code)) {
    return showToast('Invalid invite code format', 'error');
  }

  const input = el('invite-code-input');
  if (input) input.value = code;

  const sb = await getSb();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('join_team_by_invite', { p_invite_code: code });
    if (error) throw error;

    localStorage.removeItem('pending_invite');
    pendingInviteCode = null;

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

  localStorage.removeItem('pending_invite');
  pendingInviteCode = null;

  proState.subscription = null;
  proState.entitlementSource = null;
  location.reload();
}
