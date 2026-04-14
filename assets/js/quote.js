console.log("config loaded");
console.log("state loaded");
console.log("helpers loaded");
console.log("quote loaded");
console.log("settings loaded");
console.log("subscription loaded");
console.log("pro loaded");
console.log("app loaded");
function updateCount(id, delta) {
  const s = services.find(x => x.id === id);
  if (s) {
    s.count = Math.max(0, s.count + delta);
    renderSteppers();
    updateQuoteDisplay();
  }
}

function renderSteppers() {
  const container = el('steppers-container');
  if (!container) return;

  container.innerHTML = services.map(s => `
    <div class="stepper-row ${s.count > 0 ? 'active' : ''}">
      <div class="stepper-label">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">${s.icon}</svg>
        <span>${s.name} <span style="font-size:11px;color:#9ca3af;">• ${s.unit}</span></span>
      </div>
      <div class="stepper-controls">
        <button class="btn-stepper minus" type="button" onclick="updateCount('${s.id}', -1)" ${s.count === 0 ? 'disabled' : ''}>-</button>
        <div class="stepper-val">${s.count}</div>
        <button class="btn-stepper plus" type="button" onclick="updateCount('${s.id}', 1)">+</button>
      </div>
    </div>
  `).join('');
}

function getQuoteData() {
  const windowServiceIds = ['sw', 'lw', 'sd'];
  const selected = services.filter(s => s.count > 0);
  const itemCount = selected.reduce((sum, s) => sum + s.count, 0);
  const totalMinutes = selected.reduce((sum, s) => sum + (s.count * s.minutes), 0);
  const estimatedHours = totalMinutes / 60;

  let windowSub = 0;
  let nonWindowSub = 0;

  selected.forEach(s => {
    const line = s.count * s.rate;
    if (windowServiceIds.includes(s.id)) {
      windowSub += line;
    } else {
      nonWindowSub += line;
    }
  });

  const extPct = safeNum(settings.externalOnlyPercent, 60);
  const adjWindowSub = quoteState.externalOnly ? windowSub * (extPct / 100) : windowSub;

  let subtotal = 0;

  if (settings.pricingMode === 'per-window') {
    subtotal = adjWindowSub + nonWindowSub;
  } else {
    let hourlyBase = estimatedHours * safeNum(settings.hourlyRate, 0);

    if (quoteState.externalOnly && windowSub > 0) {
      const fullMix = windowSub + nonWindowSub;
      if (fullMix > 0) hourlyBase *= (adjWindowSub + nonWindowSub) / fullMix;
    }

    subtotal = hourlyBase;
  }

  const baseTotal = Math.max(0, subtotal + safeNum(settings.travelFee, 0) - safeNum(settings.discount, 0));
  const gstAmount = settings.gstEnabled ? baseTotal * (safeNum(settings.gstRate, 10) / 100) : 0;

  return {
    itemCount,
    totalMinutes,
    estimatedHours,
    windowSub,
    adjWindowSub,
    nonWindowSub,
    subtotal,
    baseTotal,
    gstAmount,
    total: baseTotal + gstAmount
  };
}

function buildQuoteSummaryText(data) {
  const customerName = (el('q-name') ? el('q-name').value.trim() : '') || 'Customer';
  const addr = el('q-address') ? el('q-address').value.trim() : '';
  const extPct = safeNum(settings.externalOnlyPercent, 60);

  let summary = `*QUOTE FROM ${String(settings.businessName).toUpperCase()}*\n\n`;
  summary += `Hi ${customerName},\n`;

  if (addr) summary += `Address: ${addr}\n`;

  if (quoteState.externalOnly) {
    summary += `• Full Window Price: $${data.windowSub.toFixed(2)}\n`;
    summary += `• External Window Price (${extPct}%): $${data.adjWindowSub.toFixed(2)}\n`;
    if (data.nonWindowSub > 0) {
      summary += `• Non-Window Services: $${data.nonWindowSub.toFixed(2)}\n`;
    }
  }

  summary += `\n*SERVICES:*\n`;
  const selected = services.filter(s => s.count > 0);

  if (!selected.length) {
    summary += `• No items added yet\n`;
  } else {
    selected.forEach(s => {
      let line = s.count * s.rate;
      if (quoteState.externalOnly && ['sw', 'lw', 'sd'].includes(s.id)) {
        line *= (extPct / 100);
      }
      summary += `• ${s.count} × ${s.name} = $${line.toFixed(2)}\n`;
    });
  }

  summary += `\n*PRICING:*\nSubtotal: $${data.subtotal.toFixed(2)}\n`;

  if (safeNum(settings.travelFee, 0) > 0) {
    summary += `Travel Fee: +$${safeNum(settings.travelFee, 0).toFixed(2)}\n`;
  }

  if (safeNum(settings.discount, 0) > 0) {
    summary += `Discount: -$${safeNum(settings.discount, 0).toFixed(2)}\n`;
  }

  if (settings.gstEnabled) {
    summary += `Base Total: $${data.baseTotal.toFixed(2)}\n`;
    summary += `GST (${safeNum(settings.gstRate, 10)}%): +$${data.gstAmount.toFixed(2)}\n`;
  }

  summary += `\n*TOTAL: $${data.total.toFixed(2)}*\n${settings.gstEnabled ? '(inc GST)' : '(ex GST)'}\n\n`;
  summary += `Time Estimate: ${data.estimatedHours.toFixed(2)} hours\n`;
  summary += `Items: ${data.itemCount}\n\n`;
  summary += `${settings.customMessage}\n\n`;
  summary += `Please let us know if you'd like to proceed. Thank you!`;

  return summary;
}

function updateQuoteDisplay() {
  const data = getQuoteData();

  const footerTotal = el('footer-total');
  const footerCount = el('footer-count');

  if (footerTotal) footerTotal.textContent = `$${data.total.toFixed(2)}`;
  if (footerCount) {
    footerCount.textContent = `${data.itemCount} items selected${settings.gstEnabled ? ' • inc GST' : ' • ex GST'}`;
  }

  const chips = el('service-chips');
  if (chips) {
    chips.innerHTML = services
      .filter(s => s.count > 0)
      .map(s => `<div class="chip">${s.count} × ${s.name}</div>`)
      .join('');
  }

  const stats = el('quote-summary-stats');
  if (stats) {
    stats.innerHTML = `
      <div class="summary-stat"><div class="summary-stat-label">Items</div><div class="summary-stat-value">${data.itemCount}</div></div>
      <div class="summary-stat"><div class="summary-stat-label">Total</div><div class="summary-stat-value">$${data.total.toFixed(2)}</div></div>
      <div class="summary-stat"><div class="summary-stat-label">Minutes</div><div class="summary-stat-value">${data.totalMinutes.toFixed(0)}</div></div>
      <div class="summary-stat"><div class="summary-stat-label">Hours</div><div class="summary-stat-value">${data.estimatedHours.toFixed(2)}</div></div>
    `;
  }

  const previewEl = el('quote-preview-text');
  if (previewEl) previewEl.textContent = buildQuoteSummaryText(data);

  const saveTeamBtn = el('save-team-job-btn');
  if (saveTeamBtn) {
    saveTeamBtn.classList.toggle('hidden', !proState.teamId || !hasProAccess());
  }
}

function buildPdfHtml(data) {
  const customerName = escapeHtml((el('q-name') ? el('q-name').value : '') || 'Customer');
  const customerPhone = escapeHtml(el('q-phone') ? el('q-phone').value : '');
  const customerEmail = escapeHtml(el('q-email') ? el('q-email').value : '');
  const customerAddress = escapeHtml(el('q-address') ? el('q-address').value : '');
  const businessName = escapeHtml(settings.businessName);
  const customMessage = escapeHtml(settings.customMessage);
  const contactName = escapeHtml(settings.contactName);
  const businessPhone = escapeHtml(settings.businessPhone);
  const businessEmail = escapeHtml(settings.businessEmail);
  const extPct = safeNum(settings.externalOnlyPercent, 60);
  const travelFee = safeNum(settings.travelFee, 0);
  const discount = safeNum(settings.discount, 0);
  const gstRate = safeNum(settings.gstRate, 10);

  const serviceRows = services.filter(s => s.count > 0).map(s => {
    let line = s.count * s.rate;
    if (quoteState.externalOnly && ['sw', 'lw', 'sd'].includes(s.id)) {
      line *= (extPct / 100);
    }

    return `
      <tr style="border-bottom: 1px solid #f3f4f6;">
        <td style="padding: 12px; font-size: 14px;">${escapeHtml(s.name)} ${quoteState.externalOnly && ['sw', 'lw', 'sd'].includes(s.id) ? '(External Only)' : ''}</td>
        <td style="padding: 12px; text-align: center; font-size: 14px;">${s.count}</td>
        <td style="padding: 12px; text-align: right; font-size: 14px;">$${line.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 600px; color: #111827;">
      <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #2563eb; padding-bottom: 20px;">
        <h1 style="margin: 0; color: #2563eb; font-size: 32px;">${businessName}</h1>
        <p style="margin: 5px 0; color: #6b7280;">Professional Quote</p>
      </div>

      <div style="margin-bottom: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <h3 style="color: #374151; margin-bottom: 10px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em;">Customer</h3>
          <p style="margin: 2px 0;"><strong>${customerName}</strong></p>
          <p style="margin: 2px 0;">${customerPhone}</p>
          <p style="margin: 2px 0;">${customerEmail}</p>
          <p style="margin: 2px 0;">${customerAddress}</p>
        </div>
        <div style="text-align: right;">
          <h3 style="color: #374151; margin-bottom:
