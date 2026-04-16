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

  const businessLabel = settings.businessName || 'Window Quote Pro';
  let summary = `*QUOTE FROM ${String(businessLabel).toUpperCase()}*\n\n`;
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

function buildPdfHtml(data, quoteNum) {
  const isPro = hasProAccess();
  const customerName = escapeHtml((el('q-name') ? el('q-name').value : '') || 'Customer');
  const customerPhone = escapeHtml(el('q-phone') ? el('q-phone').value : '');
  const customerEmail = escapeHtml(el('q-email') ? el('q-email').value : '');
  const customerAddress = escapeHtml(el('q-address') ? el('q-address').value : '');
  const extPct = safeNum(settings.externalOnlyPercent, 60);
  const travelFee = safeNum(settings.travelFee, 0);
  const discount = safeNum(settings.discount, 0);
  const gstRate = safeNum(settings.gstRate, 10);

   const customMessage = escapeHtml(settings.customMessage || '');
  const contactName = escapeHtml(settings.contactName || '');
  const businessPhone = escapeHtml(settings.businessPhone || '');
  const businessEmail = escapeHtml(settings.businessEmail || '');
  const businessName = escapeHtml(settings.businessName || 'Window Quote Pro');
  const businessAbn = escapeHtml(settings.businessAbn || settings.abn || '');
  const businessWebsite = escapeHtml(settings.businessWebsite || settings.website || '');
  const businessAddress = escapeHtml(settings.businessAddress || settings.address || '');
  const contactParts = [contactName, businessPhone, businessEmail].filter(Boolean);
  const acceptanceParts = [businessPhone, businessEmail, businessWebsite].filter(Boolean);
  let headerBrandName, headerSubtitle, logoHtml, businessDetailsHtml, footerHtml;

  if (isPro) {
    headerBrandName = businessName || 'Professional Quote';
    headerSubtitle = 'Professional Quote';
    logoHtml = (typeof getLogoHtmlForPdf === 'function') ? getLogoHtmlForPdf() : '';

        businessDetailsHtml = [contactName, businessPhone, businessEmail, businessAbn, businessWebsite, businessAddress].some(Boolean)
      ? `
        <div style="margin-top:10px; color:#4b5563; font-size:12px; line-height:1.55;">
          ${contactName ? `<div><strong>Contact:</strong> ${contactName}</div>` : ''}
          ${businessPhone ? `<div><strong>Phone:</strong> ${businessPhone}</div>` : ''}
          ${businessEmail ? `<div><strong>Email:</strong> ${businessEmail}</div>` : ''}
          ${businessAbn ? `<div><strong>ABN:</strong> ${businessAbn}</div>` : ''}
          ${businessWebsite ? `<div><strong>Web:</strong> ${businessWebsite}</div>` : ''}
          ${businessAddress ? `<div><strong>Address:</strong> ${businessAddress}</div>` : ''}
        </div>`
      : '';

    footerHtml = `
      <div style="margin-top:40px; padding-top:20px; border-top:1px solid #e5e7eb; color:#4b5563; font-size:12px; text-align:center; line-height:1.6;">
        ${customMessage ? `<p style="margin:0 0 10px; color:#6b7280;">${customMessage}</p>` : ''}
        <p style="margin:0; font-weight:700; color:#111827;">To accept this quote, contact us:</p>
        <p style="margin:6px 0 0;">${acceptanceParts.join(' • ') || contactParts.join(' • ')}</p>
        ${businessAddress ? `<p style="margin:6px 0 0; color:#6b7280;">${businessAddress}</p>` : ''}
      </div>`;
  } else {
    headerBrandName = 'Window Quote Pro';
    headerSubtitle = 'Professional Quote';
    logoHtml = '';
    businessDetailsHtml = `
      <div style="margin-top:10px; color:#4b5563; font-size:12px; line-height:1.55;">
        <div><strong>Built for trade quoting</strong></div>
      </div>`;
    footerHtml = `
      <div style="margin-top:40px; padding-top:20px; border-top:1px solid #e5e7eb; color:#6b7280; font-size:12px; text-align:center; line-height:1.6;">
        ${customMessage ? `<p style="margin:0 0 10px;">${customMessage}</p>` : ''}
        <p style="margin:0;">Upgrade to Pro to add your business logo and contact details to every quote.</p>
        <p style="margin-top:12px; font-size:11px; color:#9ca3af;">Powered by <strong style="color:#2563eb;">Window Quote Pro</strong></p>
      </div>`;
  }

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

  const quoteRef = quoteNum ? escapeHtml(quoteNum) : '';

  return `
    <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 600px; color: #111827;">
      <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
        <tr>
          <td style="vertical-align:top; width:58%;">
            ${logoHtml}
            <h2 style="margin:8px 0 2px; color:#111827;">${headerBrandName}</h2>
            <p style="margin:0; font-size:13px; color:#6b7280;">${headerSubtitle}</p>
            ${businessDetailsHtml}
          </td>
          <td style="vertical-align:top; text-align:right; width:42%;">
            <h1 style="margin:0; color:#2563eb; font-size:28px;">QUOTE</h1>
            ${quoteRef ? `<p style="margin:4px 0; font-size:14px; color:#374151;"><strong>${quoteRef}</strong></p>` : ''}
            <p style="margin:2px 0; font-size:13px; color:#6b7280;">Date: ${new Date().toLocaleDateString()}</p>
            <p style="margin:2px 0; font-size:13px; color:#6b7280;">Valid for: 30 Days</p>
          </td>
        </tr>
      </table>

      <div style="background:#f9fafb; border-radius:8px; padding:16px; margin-bottom:24px;">
        <h3 style="margin:0 0 8px; font-size:13px; text-transform:uppercase; color:#6b7280; letter-spacing:0.05em;">Customer</h3>
        <p style="margin:2px 0; font-weight:700;">${customerName}</p>
        ${customerPhone ? `<p style="margin:2px 0; font-size:13px;">${customerPhone}</p>` : ''}
        ${customerEmail ? `<p style="margin:2px 0; font-size:13px;">${customerEmail}</p>` : ''}
        ${customerAddress ? `<p style="margin:2px 0; font-size:13px;">${customerAddress}</p>` : ''}
      </div>

      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <thead>
          <tr style="background:#f3f4f6; border-bottom:2px solid #e5e7eb;">
            <th style="padding:10px 12px; text-align:left; font-size:12px; text-transform:uppercase;">Service</th>
            <th style="padding:10px 12px; text-align:center; font-size:12px; text-transform:uppercase;">Qty</th>
            <th style="padding:10px 12px; text-align:right; font-size:12px; text-transform:uppercase;">Total</th>
          </tr>
        </thead>
        <tbody>${serviceRows}</tbody>
      </table>

      <div style="margin-left:auto; width:250px; background:#f9fafb; padding:16px; border-radius:8px;">
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0; font-size:14px;">Subtotal:</td>
            <td style="padding:4px 0; text-align:right; font-size:14px;">$${data.subtotal.toFixed(2)}</td>
          </tr>
          ${travelFee > 0 ? `<tr><td style="padding:4px 0; font-size:14px;">Travel Fee:</td><td style="padding:4px 0; text-align:right; font-size:14px;">+$${travelFee.toFixed(2)}</td></tr>` : ''}
          ${discount > 0 ? `<tr><td style="padding:4px 0; font-size:14px;">Discount:</td><td style="padding:4px 0; text-align:right; font-size:14px;">-$${discount.toFixed(2)}</td></tr>` : ''}
          ${settings.gstEnabled ? `<tr><td style="padding:4px 0; font-size:14px;">GST (${gstRate}%):</td><td style="padding:4px 0; text-align:right; font-size:14px;">+$${data.gstAmount.toFixed(2)}</td></tr>` : ''}
          <tr style="border-top:2px solid #2563eb;">
            <td style="padding:8px 0; font-weight:900; font-size:18px;">TOTAL:</td>
            <td style="padding:8px 0; text-align:right; font-weight:900; font-size:18px;">$${data.total.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      ${footerHtml}
    </div>
  `;
}
