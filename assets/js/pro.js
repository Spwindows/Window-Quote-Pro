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

    user = data?.user || null;
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
    proState.logoDataUrl = null;

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

      if (!t?.team_id) {
        proState.teamId = null;
        proState.teamName = '';
        proState.teamRole = '';
        proState.inviteCode = '';
        proState.jobs = [];

        if (pendingInviteCode) {
          const inviteCode = normalizeInviteCode(pendingInviteCode);

          if (!isValidInviteCodeFormat(inviteCode)) {
            showToast('Invalid invite code format', 'error');
            localStorage.removeItem('pending_invite');
            pendingInviteCode = null;
          } else {
            try {
              const { error: joinErr } = await sb.rpc(
                'join_team_by_invite',
                { p_invite_code: inviteCode }
              );

              if (joinErr) {
                showToast(joinErr.message || 'Failed to join team', 'error');
              } else {
                localStorage.removeItem('pending_invite');
                pendingInviteCode = null;
                return await bootPro();
              }
            } catch (e) {
              console.error('Auto join failed', e);
            }

            const inviteInput = el('invite-code-input');
            if (inviteInput) inviteInput.value = inviteCode;
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

        const { data: teamSettings, error: settingsError } = await sb
          .from('team_settings')
          .select('*')
          .eq('team_id', proState.teamId)
          .single();

        if (settingsError && settingsError.code !== 'PGRST116') {
          console.error('Team settings load failed:', settingsError.message);
        }

        if (teamSettings) {
          applyTeamSettings(teamSettings);
        }

        setupRealtimeChannel(sb);
      }
    }
  } catch (e) {
    console.error('bootPro failed', e);
  }

  try {
    await loadSubscription(sb);
  } catch (e) {
    console.error('Subscription load failed', e);
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

  if (!email || !password) {
    return showToast('Enter email and password', 'error');
  }

  const sb = await getSb();
  if (!sb) return;

  try {
    let res;

    if (authMode === 'signup') {
      const name = ((el('auth-name') || {}).value || '').trim();

      res = await sb.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name }
        }
      });

      if (res.error) throw res.error;

      if (!res.data?.session) {
        showToast(
          'Account created. Check email to confirm account.',
          'success'
        );
        return;
      }
    } else {
      res = await sb.auth.signInWithPassword({
        email,
        password
      });

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

  if (!name) {
    return showToast('Enter business name', 'error');
  }

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

async function joinTeam() {
  const rawCode = ((el('invite-code-input') || {}).value || '').trim();

  if (!rawCode) {
    return showToast('Enter invite code', 'error');
  }

  const code = normalizeInviteCode(rawCode);

  if (!isValidInviteCodeFormat(code)) {
    return showToast('Invalid invite code format', 'error');
  }

  const input = el('invite-code-input');
  if (input) input.value = code;

  const sb = await getSb();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('join_team_by_invite', {
      p_invite_code: code
    });

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

  [auth, dash, teamSetup, teamDash].forEach(x => {
    if (x) x.classList.add('hidden');
  });

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
      roleEl.textContent =
        proState.teamRole === 'owner' ? 'Owner' : 'Staff';

      roleEl.className =
        `role-badge ${proState.teamRole === 'owner'
          ? 'role-owner'
          : 'role-staff'}`;

      roleEl.style.display = '';
    }

    if (teamDash) teamDash.classList.remove('hidden');
  } else {
    if (nameEl) {
      nameEl.textContent =
        proState.user.user_metadata?.full_name || 'My Account';
    }

    if (emailEl) emailEl.textContent = proState.user.email;

    if (roleEl) roleEl.style.display = 'none';

    if (teamSetup) teamSetup.classList.remove('hidden');
  }

  /* Show/hide logo section based on owner + pro */
  const logoSection = el('logo-upload-section');
  if (logoSection) {
    const isOwner = canAccessSettings();
    logoSection.classList.toggle('hidden', !isOwner || !hasProAccess());
  }

  renderLogoPreview();
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

/* =====================================================================
 * Logo Persistence — Supabase Storage + team_settings.logo_url
 *
 * Flow:
 *   Upload:  file → Storage bucket 'logos/{teamId}/logo.{ext}'
 *            → get public URL
 *            → upsert team_settings.logo_url
 *            → set proState.logoDataUrl = public URL
 *
 *   Load:    applyTeamSettings() reads logo_url from team_settings row
 *            → sets proState.logoDataUrl
 *
 *   Remove:  delete from Storage
 *            → upsert team_settings.logo_url = null
 *            → clear proState.logoDataUrl
 *
 * Fallback: If Storage upload fails, the logo is stored as a base64
 *           data URL in team_settings.logo_url (< 2MB). This avoids
 *           a hard failure if the Storage bucket hasn't been created yet.
 * ===================================================================== */

async function handleLogoUpload(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', 'error');
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast('Logo must be under 2MB', 'error');
    return;
  }

  if (!proState.teamId) {
    showToast('You must be part of a team to save a logo', 'error');
    return;
  }

  const sb = await getSb();
  if (!sb) return;

  /* Disable upload button while saving */
  const uploadBtn = el('logo-upload-btn');
  if (uploadBtn) uploadBtn.disabled = true;

  try {
    const ext = file.name.split('.').pop().toLowerCase() || 'png';
    const storagePath = `${proState.teamId}/logo.${ext}`;

    /* Attempt Supabase Storage upload */
    let logoUrl = null;

    const { error: uploadError } = await sb.storage
      .from('logos')
      .upload(storagePath, file, {
        upsert: true,
        contentType: file.type
      });

    if (uploadError) {
      console.warn('Storage upload failed, falling back to base64:', uploadError.message);

      /* Fallback: read as base64 and store in team_settings directly */
      logoUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else {
      /* Get the permanent public URL */
      const { data: urlData } = sb.storage
        .from('logos')
        .getPublicUrl(storagePath);

      logoUrl = urlData?.publicUrl || null;

      if (!logoUrl) {
        throw new Error('Could not get public URL for uploaded logo');
      }

      /* Append cache-busting timestamp so browsers reload the new image */
      logoUrl = `${logoUrl}?t=${Date.now()}`;
    }

    /* Persist the URL to team_settings */
    await _saveLogoUrlToTeamSettings(sb, logoUrl);

    /* Update in-memory state and re-render preview */
    proState.logoDataUrl = logoUrl;
    renderLogoPreview();
    showToast('Logo saved!', 'success');
  } catch (e) {
    console.error('Logo upload failed:', e);
    showToast('Failed to save logo. Please try again.', 'error');
  } finally {
    if (uploadBtn) uploadBtn.disabled = false;
    /* Reset the file input so the same file can be re-selected */
    if (inputEl) inputEl.value = '';
  }
}

async function removeLogo() {
  if (!proState.teamId) return;

  const sb = await getSb();
  if (!sb) return;

  const removeBtn = el('logo-remove-btn');
  if (removeBtn) removeBtn.disabled = true;

  try {
    /* Attempt to delete from Storage (best-effort — may not exist if base64 fallback was used) */
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    for (const ext of extensions) {
      await sb.storage
        .from('logos')
        .remove([`${proState.teamId}/logo.${ext}`])
        .catch(() => {}); /* Ignore errors — file may not exist for this ext */
    }

    /* Clear logo_url in team_settings */
    await _saveLogoUrlToTeamSettings(sb, null);

    proState.logoDataUrl = null;
    renderLogoPreview();

    const input = el('logo-file-input');
    if (input) input.value = '';

    showToast('Logo removed', 'success');
  } catch (e) {
    console.error('Logo removal failed:', e);
    showToast('Failed to remove logo', 'error');
  } finally {
    if (removeBtn) removeBtn.disabled = false;
  }
}

/**
 * Upserts logo_url into the team_settings row.
 * Called by both handleLogoUpload and removeLogo.
 */
async function _saveLogoUrlToTeamSettings(sb, logoUrl) {
  const { error } = await sb
    .from('team_settings')
    .upsert({
      team_id: proState.teamId,
      logo_url: logoUrl
    }, {
      onConflict: 'team_id'
    });

  if (error) throw error;
}

function renderLogoPreview() {
  const preview   = el('logo-preview');
  const removeBtn = el('logo-remove-btn');

  if (!preview) return;

  if (proState.logoDataUrl) {
    preview.innerHTML = `<img src="${proState.logoDataUrl}" style="max-width:160px; max-height:80px; border-radius:8px; border:1px solid #e2e5ea;" />`;
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else {
    preview.innerHTML = '<span style="color:#9ca3af; font-size:0.85rem;">No logo uploaded</span>';
    if (removeBtn) removeBtn.classList.add('hidden');
  }
}
