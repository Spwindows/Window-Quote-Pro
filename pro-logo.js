console.log("[WQP] pro-logo.js loaded");

/* =====================================================================
 * Logo Management Module
 *
 * Handles team logo upload, removal, preview rendering, and persistence
 * to Supabase Storage + team_settings.
 *
 *   Upload:  Supabase Storage bucket 'logos/{teamId}/logo.{ext}'
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
 * Fallback: If Storage upload fails,
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
