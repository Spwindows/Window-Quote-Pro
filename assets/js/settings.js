console.log("config loaded");
console.log("state loaded");
console.log("helpers loaded");
console.log("quote loaded");
console.log("settings loaded");
console.log("subscription loaded");
console.log("pro loaded");
console.log("app loaded");
function loadLocalSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);

    if (parsed.settings) settings = { ...settings, ...parsed.settings };
    if (parsed.quoteState) quoteState = { ...quoteState, ...parsed.quoteState };

    if (Array.isArray(parsed.services)) {
      services = services.map(service => {
        const saved = parsed.services.find(item => item.id === service.id);
        return saved
          ? {
              ...service,
              rate: safeNum(saved.rate, service.rate),
              minutes: safeNum(saved.minutes, service.minutes)
            }
          : service;
      });
    }
  } catch (e) {
    console.error('Failed to load local settings:', e);
  }
}

function saveLocalSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings,
      quoteState,
      services: services.map(s => ({
        id: s.id,
        rate: s.rate,
        minutes: s.minutes
      }))
    }));
  } catch (e) {
    console.error('Failed to save local settings:', e);
  }
}

function applyTeamSettings(s) {
  settings = {
    businessName: s.business_name || settings.businessName,
    contactName: s.contact_name || settings.contactName,
    businessPhone: s.contact_phone || settings.businessPhone,
    businessEmail: s.contact_email || settings.businessEmail,
    customMessage: s.default_message || settings.customMessage,
    pricingMode: s.pricing_mode || settings.pricingMode,
    hourlyRate: safeNum(s.hourly_rate, settings.hourlyRate),
    travelFee: safeNum(s.travel_fee, settings.travelFee),
    discount: safeNum(s.discount, settings.discount),
    externalOnlyPercent: safeNum(s.external_only_percent, settings.externalOnlyPercent),
    gstEnabled: !!s.gst_enabled,
    gstRate: safeNum(s.gst_rate, settings.gstRate)
  };

  if (s.rates) {
    services = services.map(svc => {
      const remoteRate = s.rates[svc.id];
      const remoteMin = s.minutes ? s.minutes[svc.id] : null;
      return {
        ...svc,
        rate: safeNum(remoteRate, svc.rate),
        minutes: safeNum(remoteMin, svc.minutes)
      };
    });
  }
}

function syncSettingsForm() {
  const isOwner = canAccessSettings();
  const ownerView = el('settings-owner-view');
  const staffLock = el('settings-staff-lock');

  if (ownerView) ownerView.classList.toggle('hidden', !isOwner);
  if (staffLock) staffLock.classList.toggle('hidden', isOwner);
  if (!isOwner) return;

  const setVal = (id, val) => {
    const e = el(id);
    if (e) e.value = val;
  };

  const setChecked = (id, val) => {
    const e = el(id);
    if (e) e.checked = val;
  };

  setVal('s-bizname', settings.businessName);
  setVal('s-contact', settings.contactName);
  setVal('s-phone', settings.businessPhone);
  setVal('s-email', settings.businessEmail);
  setVal('s-message', settings.customMessage);
  setVal('settings-pricing-mode', settings.pricingMode);
  setVal('settings-hourly-rate', settings.hourlyRate);
  setVal('settings-external-percent', settings.externalOnlyPercent);
  setVal('settings-travel-fee', settings.travelFee);
  setVal('settings-discount', settings.discount);
  setChecked('settings-gst-enabled', settings.gstEnabled);
  setVal('settings-gst-rate', settings.gstRate);
  setVal('team-invite-code', proState.inviteCode || '');
}

function renderSettingsGrids() {
  if (!canAccessSettings()) return;

  const ratesGrid = el('settings-rates-grid');
  const minsGrid = el('settings-minutes-grid');

  if (ratesGrid) {
    ratesGrid.innerHTML = services.map(s => `
      <div class="rate-card">
        <div class="rate-card-label">${s.name} ($)</div>
        <input type="number" class="rate-card-input" value="${s.rate}" onchange="updateServiceRate('${s.id}', this.value)" />
      </div>
    `).join('');
  }

  if (minsGrid) {
    minsGrid.innerHTML = services.map(s => `
      <div class="rate-card">
        <div class="rate-card-label">${s.name} (min)</div>
        <input type="number" class="rate-card-input" value="${s.minutes}" onchange="updateServiceMinutes('${s.id}', this.value)" />
      </div>
    `).join('');
  }
}

function updateServiceRate(id, val) {
  const s = services.find(x => x.id === id);
  if (s) s.rate = safeNum(val, s.rate);
  updateQuoteDisplay();
}

function updateServiceMinutes(id, val) {
  const s = services.find(x => x.id === id);
  if (s) s.minutes = safeNum(val, s.minutes);
  updateQuoteDisplay();
}

async function saveSettingsToServer() {
  if (!proState.teamId || !canAccessSettings()) return;

  const sb = await getSb();
  if (!sb) return;

  const ratesMap = {};
  const minsMap = {};

  services.forEach(s => {
    ratesMap[s.id] = s.rate;
    minsMap[s.id] = s.minutes;
  });

  const payload = {
    business_name: settings.businessName,
    contact_name: settings.contactName,
    contact_phone: settings.businessPhone,
    contact_email: settings.businessEmail,
    default_message: settings.customMessage,
    pricing_mode: settings.pricingMode,
    hourly_rate: Number(settings.hourlyRate),
    travel_fee: Number(settings.travelFee),
    discount: Number(settings.discount),
    external_only_percent: Number(settings.externalOnlyPercent),
    gst_enabled: !!settings.gstEnabled,
    gst_rate: Number(settings.gstRate),
    rates: ratesMap,
    minutes: minsMap
  };

  try {
    const { error } = await sb.from('team_settings').upsert({ team_id: proState.teamId, ...payload });
    if (error) throw error;
    showToast('Settings saved!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function resetAllData() {
  if (!confirm('This will reset all settings, jobs, quotes, and team data. Continue?')) return;

  try {
    const sb = await getSb();

    if (proState.teamId && canAccessSettings()) {
      const { error } = await sb.rpc('reset_team_data');
      if (error) throw error;
    }

    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
