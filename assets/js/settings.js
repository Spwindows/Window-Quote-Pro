console.log("[WQP] settings.js loaded");

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

/**
 * Applies a team_settings row to the in-memory settings and services.
 * Also reads logo_url and sets proState.logoDataUrl for cloud-backed logo.
 */
function applyTeamSettings(s) {
  settings = {
    businessName:        (s.business_name   != null) ? s.business_name   : settings.businessName,
    contactName:         (s.contact_name    != null) ? s.contact_name    : settings.contactName,
    businessPhone:       (s.contact_phone   != null) ? s.contact_phone   : settings.businessPhone,
    businessEmail:       (s.contact_email   != null) ? s.contact_email   : settings.businessEmail,
    businessAbn:         (s.business_abn    != null) ? s.business_abn    : settings.businessAbn,
    businessWebsite:     (s.business_website!= null) ? s.business_website: settings.businessWebsite,
    businessAddress:     (s.business_address!= null) ? s.business_address: settings.businessAddress,
    customMessage:       (s.default_message != null) ? s.default_message : settings.customMessage,
    pricingMode:         s.pricing_mode          || settings.pricingMode,
    hourlyRate:          safeNum(s.hourly_rate,          settings.hourlyRate),
    travelFee:           safeNum(s.travel_fee,           settings.travelFee),
    discount:            safeNum(s.discount,             settings.discount),
    externalOnlyPercent: safeNum(s.external_only_percent, settings.externalOnlyPercent),
    gstEnabled:          !!s.gst_enabled,
    gstRate:             safeNum(s.gst_rate,             settings.gstRate),
    secondStoreyPricingEnabled: !!(s.rates && s.rates.__second_storey_pricing_enabled),
    secondStoreyMode: ((s.rates && s.rates.__second_storey_mode) || settings.secondStoreyMode || 'percent'),
    secondStoreyPercent: safeNum(s.rates && s.rates.__second_storey_percent, settings.secondStoreyPercent),
    secondStoreyFixedAmount: safeNum(s.rates && s.rates.__second_storey_fixed_amount, settings.secondStoreyFixedAmount),
    /* FIX 3: Payment details from cloud settings (stored in rates JSON) */
    paymentAccountName:   (s.rates && s.rates.__payment_account_name)   || settings.paymentAccountName   || '',
    paymentBankName:      (s.rates && s.rates.__payment_bank_name)      || settings.paymentBankName      || '',
    paymentBSB:           (s.rates && s.rates.__payment_bsb)            || settings.paymentBSB           || '',
    paymentAccountNumber: (s.rates && s.rates.__payment_account_number) || settings.paymentAccountNumber || '',
    paymentReference:     (s.rates && s.rates.__payment_reference)      || settings.paymentReference     || '',
    paymentLink:          (s.rates && s.rates.__payment_link)           || settings.paymentLink          || ''
  };

  if (s.rates) {
    services = services.map(svc => {
      const remoteRate = s.rates[svc.id];
      const remoteMin  = s.minutes ? s.minutes[svc.id] : null;
      return {
        ...svc,
        rate:    safeNum(remoteRate, svc.rate),
        minutes: safeNum(remoteMin,  svc.minutes)
      };
    });
  }

  /* Cloud-backed logo: read logo_url from team_settings row */
  if (s.logo_url !== undefined) {
    proState.logoDataUrl = s.logo_url || null;
  }
}

function syncSettingsForm() {
  if (!window.settings || typeof window.settings !== 'object') {
    window.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
  settings = window.settings;

  const setVal = (id, value) => {
    const node = el(id);
    if (node) node.value = value ?? '';
  };

  const setChecked = (id, value) => {
    const node = el(id);
    if (node) node.checked = !!value;
  };

  setVal('s-bizname', settings.businessName);
  setVal('s-contact', settings.contactName);
  setVal('s-phone', settings.businessPhone);
  setVal('s-email', settings.businessEmail);
  setVal('s-abn', settings.businessAbn);
  setVal('s-website', settings.businessWebsite);
  setVal('s-address', settings.businessAddress);
  setVal('s-message', settings.customMessage);

  setVal('settings-pricing-mode', settings.pricingMode);
  setVal('settings-hourly-rate', settings.hourlyRate);
  setVal('settings-external-percent', settings.externalOnlyPercent);
  setVal('settings-travel-fee', settings.travelFee);
  setVal('settings-discount', settings.discount);

  setChecked('settings-gst-enabled', settings.gstEnabled);
  setVal('settings-gst-rate', settings.gstRate);

  setVal('settings-quote-format', settings.quoteFormat || 'itemised');

  setChecked('settings-second-storey-pricing-enabled', settings.secondStoreyPricingEnabled);
  setVal('settings-second-storey-mode', settings.secondStoreyMode || 'percent');
  setVal('settings-second-storey-percent', settings.secondStoreyPercent);
  setVal('settings-second-storey-fixed', settings.secondStoreyFixedAmount);

  setVal('s-payment-account-name', settings.paymentAccountName);
  setVal('s-payment-bank-name', settings.paymentBankName);
  setVal('s-payment-bsb', settings.paymentBSB);
  setVal('s-payment-account-number', settings.paymentAccountNumber);
  setVal('s-payment-reference', settings.paymentReference);
  setVal('s-payment-link', settings.paymentLink);
}
function renderSettingsGrids() {
  if (!canAccessSettings()) return;

  const ratesGrid = el('settings-rates-grid');
  const minsGrid  = el('settings-minutes-grid');

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

async function _saveSettingsToServerInner() {
  if (!proState.teamId || !canAccessSettings()) return;

  const sb = await getSb();
  if (!sb) return;

  const ratesMap = {};
  const minsMap  = {};

  services.forEach(s => {
    ratesMap[s.id] = s.rate;
    minsMap[s.id]  = s.minutes;
  });

  ratesMap.__second_storey_pricing_enabled = !!settings.secondStoreyPricingEnabled;
  ratesMap.__second_storey_mode = settings.secondStoreyMode || 'percent';
  ratesMap.__second_storey_percent = Number(settings.secondStoreyPercent || 0);
  ratesMap.__second_storey_fixed_amount = Number(settings.secondStoreyFixedAmount || 0);

  /* FIX 3: Persist payment detail fields in the rates JSON object */
  ratesMap.__payment_account_name   = settings.paymentAccountName   || '';
  ratesMap.__payment_bank_name      = settings.paymentBankName      || '';
  ratesMap.__payment_bsb            = settings.paymentBSB           || '';
  ratesMap.__payment_account_number = settings.paymentAccountNumber || '';
  ratesMap.__payment_reference      = settings.paymentReference     || '';
  ratesMap.__payment_link           = settings.paymentLink          || '';

  const payload = {
  team_id:               proState.teamId,
  business_name:         settings.businessName,
  contact_name:          settings.contactName,
  contact_phone:         settings.businessPhone,
  contact_email:         settings.businessEmail,

  business_abn:          settings.businessAbn,
  business_website:      settings.businessWebsite,
  business_address:      settings.businessAddress,

  default_message:       settings.customMessage,
  pricing_mode:          settings.pricingMode,
  hourly_rate:           Number(settings.hourlyRate),
  travel_fee:            Number(settings.travelFee),
  discount:              Number(settings.discount),
  external_only_percent: Number(settings.externalOnlyPercent),
  gst_enabled:           !!settings.gstEnabled,
  gst_rate:              Number(settings.gstRate),

  rates:                 ratesMap,
  minutes:               minsMap
};

  try {
    const { error } = await sb
      .from('team_settings')
      .upsert(payload, { onConflict: 'team_id' });

    if (error) throw error;
    showToast('Settings saved!', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}
const saveSettingsToServer = asyncGuard(_saveSettingsToServerInner, 'saveSettingsToServer');

async function resetAllData() {
  if (!confirm('This will reset all settings, jobs, quotes, and team data. Continue?')) return;

  try {
    const sb = await getSb();

    if (sb && proState.teamId && canAccessSettings()) {
      const { error } = await sb.rpc('reset_team_data');
      if (error) throw error;
    }

    localStorage.removeItem(STORAGE_KEY);
    location.reload();
  } catch (e) {
    showToast(e.message, 'error');
  }
}
