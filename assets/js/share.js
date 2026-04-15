console.log("[WQP] share.js loaded");

async function exportQuotePDF() {
  /* PDF export is available to ALL users (free = WQP-branded, pro = white-label) */
  if (typeof html2pdf === 'undefined') {
    showToast('PDF library not loaded.', 'error');
    return;
  }

  try {
    const data = getQuoteData();
    const quoteNum = getNextQuoteNumber();
    const customerEmail = (el('q-email')?.value || '').trim();
    const rawName = (el('q-name')?.value || 'customer').trim();
    const safeName = rawName.replace(/[^a-zA-Z0-9 _-]/g, '') || 'customer';
    const businessLabel = settings.businessName || 'Window Quote Pro';

    const htmlContent = buildPdfHtml(data, quoteNum);

    generateAndSharePdf(
      htmlContent,
      `quote-${safeName}`,
      customerEmail,
      `Quote ${quoteNum} from ${businessLabel}`
    );

    closeShareModal();
  } catch (e) {
    console.error('PDF export failed:', e);
    showToast('PDF export failed', 'error');
  }
}

function openShareModal() {
  const modal = el('share-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeShareModal() {
  const modal = el('share-modal');
  if (modal) modal.classList.add('hidden');
}

async function copyQuoteToClipboard() {
  try {
    const t = (el('quote-preview-text') || {}).textContent || '';
    await navigator.clipboard.writeText(t);
    showToast('Quote copied!', 'success');
    closeShareModal();
  } catch (e) {
    showToast('Copy failed', 'error');
  }
}

/* ===== Part 3: Invoice Generation ===== */

function openInvoiceForJob(jobId) {
  const j = proState.jobs.find(x => x.id === jobId);
  if (!j) return showToast('Job not found', 'error');

  if (typeof html2pdf === 'undefined') {
    showToast('PDF library not loaded.', 'error');
    return;
  }

  const invoiceNum = getNextInvoiceNumber();
  /* Read payment fields directly from the job row (cloud-backed) */
  const quoted     = parseFloat(j.quoted_price) || 0;
  const amountPaid = parseFloat(j.amount_paid)  || 0;
  const amountDue  = Math.max(0, quoted - amountPaid);

  const logoHtml = getLogoHtmlForPdf();

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 14);

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 600px; color: #111827;">
      <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
        <tr>
          <td style="vertical-align:top;">
            ${logoHtml}
            <h2 style="margin:8px 0 2px; color:#111827;">${escapeHtml(settings.businessName)}</h2>
            <p style="margin:0; font-size:13px; color:#6b7280;">${escapeHtml(settings.contactName)} • ${escapeHtml(settings.businessPhone)}</p>
            <p style="margin:0; font-size:13px; color:#6b7280;">${escapeHtml(settings.businessEmail)}</p>
          </td>
          <td style="vertical-align:top; text-align:right;">
            <h1 style="margin:0; color:#2563eb; font-size:28px;">INVOICE</h1>
            <p style="margin:4px 0; font-size:14px; color:#374151;"><strong>${escapeHtml(invoiceNum)}</strong></p>
            <p style="margin:2px 0; font-size:13px; color:#6b7280;">Date: ${new Date().toLocaleDateString()}</p>
            <p style="margin:2px 0; font-size:13px; color:#6b7280;">Due: ${dueDate.toLocaleDateString()}</p>
          </td>
        </tr>
      </table>

      <div style="background:#f9fafb; border-radius:8px; padding:16px; margin-bottom:24px;">
        <h3 style="margin:0 0 8px; font-size:13px; text-transform:uppercase; color:#6b7280; letter-spacing:0.05em;">Bill To</h3>
        <p style="margin:2px 0; font-weight:700;">${escapeHtml(j.customer_name)}</p>
        <p style="margin:2px 0; font-size:13px;">${escapeHtml(j.customer_phone || '')}</p>
        <p style="margin:2px 0; font-size:13px;">${escapeHtml(j.customer_email || '')}</p>
        <p style="margin:2px 0; font-size:13px;">${escapeHtml(j.service_address || '')}</p>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <thead>
          <tr style="background:#f3f4f6; border-bottom:2px solid #e5e7eb;">
            <th style="padding:10px 12px; text-align:left; font-size:12px; text-transform:uppercase;">Description</th>
            <th style="padding:10px 12px; text-align:right; font-size:12px; text-transform:uppercase;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:12px; font-size:14px;">${escapeHtml(j.items_summary || 'Window cleaning services')}</td>
            <td style="padding:12px; text-align:right; font-size:14px;">$${quoted.toFixed(2)}</td>
          </tr>
          ${amountPaid > 0 ? `
          <tr style="border-bottom:1px solid #f3f4f6;">
            <td style="padding:12px; font-size:14px; color:#059669;">Payments received</td>
            <td style="padding:12px; text-align:right; font-size:14px; color:#059669;">-$${amountPaid.toFixed(2)}</td>
          </tr>
          ` : ''}
        </tbody>
      </table>

      <div style="margin-left:auto; width:250px; background:#f9fafb; padding:16px; border-radius:8px;">
        <table style="width:100%; border-collapse:collapse;">
          <tr>
            <td style="padding:4px 0; font-size:14px;">Subtotal:</td>
            <td style="padding:4px 0; text-align:right; font-size:14px;">$${quoted.toFixed(2)}</td>
          </tr>
          ${settings.gstEnabled ? `
          <tr>
            <td style="padding:4px 0; font-size:14px;">GST (${safeNum(settings.gstRate, 10)}%):</td>
            <td style="padding:4px 0; text-align:right; font-size:14px;">Included</td>
          </tr>
          ` : ''}
          <tr style="border-top:2px solid #2563eb;">
            <td style="padding:8px 0; font-weight:900; font-size:18px;">Amount Due:</td>
            <td style="padding:8px 0; text-align:right; font-weight:900; font-size:18px;">$${amountDue.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <div style="margin-top:30px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; text-align:center;">
        <p style="margin-bottom:6px;">Payment due within 14 days of invoice date.</p>
        <p>${escapeHtml(settings.customMessage)}</p>
      </div>
    </div>
  `;

  generateAndSharePdf(html, `invoice-${escapeHtml(j.customer_name).replace(/\s/g, '_')}`, j.customer_email, `Invoice ${invoiceNum} from ${settings.businessName}`);
}

/* ===== Part 4: Receipt Generation ===== */

function openReceiptForJob(jobId) {
  const j = proState.jobs.find(x => x.id === jobId);
  if (!j) return showToast('Job not found', 'error');

  if (typeof html2pdf === 'undefined') {
    showToast('PDF library not loaded.', 'error');
    return;
  }

  const receiptNum = getNextReceiptNumber();
  /* Read payment fields directly from the job row (cloud-backed) */
  const quoted        = parseFloat(j.quoted_price)  || 0;
  const amountPaid    = parseFloat(j.amount_paid)   || 0;
  const paymentMethod = j.payment_method            || 'N/A';
  const paymentNotes  = j.payment_notes             || '';
  const paidAt        = j.paid_at                   || null;
  const logoHtml = getLogoHtmlForPdf();

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 600px; color: #111827;">
      <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
        <tr>
          <td style="vertical-align:top;">
            ${logoHtml}
            <h2 style="margin:8px 0 2px; color:#111827;">${escapeHtml(settings.businessName)}</h2>
            <p style="margin:0; font-size:13px; color:#6b7280;">${escapeHtml(settings.contactName)} • ${escapeHtml(settings.businessPhone)}</p>
          </td>
          <td style="vertical-align:top; text-align:right;">
            <h1 style="margin:0; color:#059669; font-size:28px;">RECEIPT</h1>
            <p style="margin:4px 0; font-size:14px; color:#374151;"><strong>${escapeHtml(receiptNum)}</strong></p>
            <p style="margin:2px 0; font-size:13px; color:#6b7280;">Date: ${paidAt ? new Date(paidAt).toLocaleDateString() : new Date().toLocaleDateString()}</p>
          </td>
        </tr>
      </table>

      <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:16px; margin-bottom:24px; text-align:center;">
        <p style="margin:0; font-size:18px; font-weight:800; color:#059669;">Payment Received — Thank You!</p>
      </div>

      <div style="background:#f9fafb; border-radius:8px; padding:16px; margin-bottom:24px;">
        <h3 style="margin:0 0 8px; font-size:13px; text-transform:uppercase; color:#6b7280;">Client</h3>
        <p style="margin:2px 0; font-weight:700;">${escapeHtml(j.customer_name)}</p>
        <p style="margin:2px 0; font-size:13px;">${escapeHtml(j.customer_phone || '')}</p>
        <p style="margin:2px 0; font-size:13px;">${escapeHtml(j.service_address || '')}</p>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 0; font-size:14px; color:#6b7280;">Services</td>
          <td style="padding:10px 0; text-align:right; font-size:14px;">${escapeHtml(j.items_summary || 'Window cleaning')}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 0; font-size:14px; color:#6b7280;">Quoted Amount</td>
          <td style="padding:10px 0; text-align:right; font-size:14px;">$${quoted.toFixed(2)}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 0; font-size:14px; color:#6b7280;">Amount Paid</td>
          <td style="padding:10px 0; text-align:right; font-size:14px; font-weight:700; color:#059669;">$${amountPaid.toFixed(2)}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 0; font-size:14px; color:#6b7280;">Payment Method</td>
          <td style="padding:10px 0; text-align:right; font-size:14px;">${escapeHtml(paymentMethod)}</td>
        </tr>
        ${paymentNotes ? `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 0; font-size:14px; color:#6b7280;">Notes</td>
          <td style="padding:10px 0; text-align:right; font-size:14px;">${escapeHtml(paymentNotes)}</td>
        </tr>
        ` : ''}
      </table>

      <div style="margin-top:30px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; text-align:center;">
        <p>${escapeHtml(settings.customMessage)}</p>
        <p>Contact: ${escapeHtml(settings.contactName)} • ${escapeHtml(settings.businessPhone)} • ${escapeHtml(settings.businessEmail)}</p>
      </div>
    </div>
  `;

  generateAndSharePdf(html, `receipt-${escapeHtml(j.customer_name).replace(/\s/g, '_')}`, j.customer_email, `Receipt ${receiptNum} from ${settings.businessName}`);
}

/* ===== Shared PDF generator for invoice/receipt ===== */

async function generateAndSharePdf(htmlContent, filename, email, subject) {
  let mount = null;

  try {
    mount = document.createElement('div');
    mount.id = 'pdf-doc-mount';

    Object.assign(mount.style, {
      position: 'fixed',
      inset: '0',
      background: '#ffffff',
      zIndex: '99999',
      overflow: 'auto',
      padding: '0',
      margin: '0',
      opacity: '0.01',
      pointerEvents: 'none'
    });

    mount.innerHTML = `
      <div id="pdf-doc-inner" style="
        width: 794px;
        min-height: 1123px;
        margin: 0 auto;
        background: #ffffff;
      ">
        ${htmlContent}
      </div>
    `;

    document.body.appendChild(mount);
    const target = document.getElementById('pdf-doc-inner');
    if (!target) throw new Error('PDF target not created');

    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const pdfBlob = await html2pdf()
      .set({
        margin: 0,
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 1 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 794,
          windowHeight: target.scrollHeight || 1123
        },
        jsPDF: {
          unit: 'px',
          format: [794, Math.max(1123, target.scrollHeight || 1123)],
          orientation: 'portrait'
        }
      })
      .from(target)
      .outputPdf('blob');

    /* Try native share, fallback to download + email link */
    const file = new File([pdfBlob], `${filename}.pdf`, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          title: subject,
          files: [file]
        });
        showToast('Shared!', 'success');
      } catch (shareErr) {
        /* User cancelled share — fallback to download */
        downloadBlob(pdfBlob, `${filename}.pdf`);
        showToast('PDF downloaded!', 'success');
      }
    } else {
      downloadBlob(pdfBlob, `${filename}.pdf`);
      showToast('PDF downloaded!', 'success');

      if (email) {
        setTimeout(() => {
          window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent('Please find the attached document. Thank you!')}`;
        }, 500);
      }
    }
  } catch (e) {
    console.error('PDF generation failed:', e);
    showToast('PDF generation failed', 'error');
  } finally {
    if (mount && mount.parentNode) {
      mount.parentNode.removeChild(mount);
    }
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ===== Logo helper for PDFs ===== */

/**
 * Returns an <img> tag for the team logo for use in PDF templates.
 * proState.logoDataUrl is set by applyTeamSettings() from the
 * cloud-backed team_settings.logo_url column (Supabase Storage URL
 * or base64 fallback). No localStorage involved.
 */
function getLogoHtmlForPdf() {
  const logoUrl = proState.logoDataUrl;
  if (logoUrl && hasProAccess()) {
    return `<img src="${logoUrl}" style="max-width:120px; max-height:60px; margin-bottom:4px;" crossorigin="anonymous" />`;
  }
  return '';
}
