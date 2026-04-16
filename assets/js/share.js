console.log("[WQP] share.js loaded");

async function _exportQuotePDFInner() {
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
    await generateAndSharePdf(
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
const exportQuotePDF = asyncGuard(_exportQuotePDFInner, 'exportQuotePDF');

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

/* ===== Part 3: Invoice Generation (FIX 2 & 3) ===== */

/**
 * FIX 2: openInvoiceForJob now shows a due-date picker modal before
 * generating the invoice. The actual PDF generation is in _generateInvoicePdf.
 */
function openInvoiceForJob(jobId) {
  if (!hasProAccess()) {
    openPlansModal('pro', 'Invoicing');
    return;
  }
  const j = proState.jobs.find(x => x.id === jobId);
  if (!j) return showToast('Job not found', 'error');
  if (typeof html2pdf === 'undefined') {
    showToast('PDF library not loaded.', 'error');
    return;
  }

  /* Show due date picker, then generate invoice */
  openInvoiceDueDateModal(function(terms, dueDate) {
    _generateInvoicePdf(j, dueDate, terms);
  });
}

/**
 * Internal: generates the invoice PDF with the chosen due date.
 * FIX 2: Due date displayed on invoice header.
 * FIX 3: Payment details section rendered at bottom (from settings).
 */
function _generateInvoicePdf(j, dueDate, terms) {
  const invoiceNum = getNextInvoiceNumber();
  /* Read payment fields directly from the job row (cloud-backed) */
  const quoted     = parseFloat(j.quoted_price) || 0;
  const amountPaid = parseFloat(j.amount_paid)  || 0;
  const amountDue  = Math.max(0, quoted - amountPaid);

  const logoHtml = getLogoHtmlForPdf();
  const issueDate = new Date();

  /* Format due date label */
  let dueDateLabel = dueDate.toLocaleDateString();
  if (terms === 'on_receipt') {
    dueDateLabel = 'Due on receipt';
  }

  /* Store due date on job if possible */
  if (j) {
    j.invoice_due_date = dueDate.toISOString();
  }

  /* FIX 3: Build payment details section from settings */
  const paymentDetailsHtml = _buildPaymentDetailsHtml();

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 600px; color: #111827;">
      <table style="width:100%; border-collapse:collapse; margin-bottom:30px;">
        <tr>
          <td style="vertical-align:top;">
            ${logoHtml}
            <h2 style="margin:8px 0 2px; color:#111827;">${escapeHtml(settings.businessName)}</h2>
            <p style="margin:0; font-size:13px; color:#6b7280;">${escapeHtml(settings.contactName)} • ${escapeHtml(settings.businessPhone)}</p>
            <p style="margin:0; font-size:13px; color:#6b7280;">${escapeHtml(settings.businessEmail)}</p>
            ${settings.businessAbn ? `<p style="margin:0; font-size:13px; color:#6b7280;">ABN: ${escapeHtml(settings.businessAbn)}</p>` : ''}
          </td>
          <td style="vertical-align:top; text-align:right;">
            <h1 style="margin:0; color:#2563eb; font-size:28px;">INVOICE</h1>
            <p style="margin:4px 0; font-size:14px; color:#374151;"><strong>${escapeHtml(invoiceNum)}</strong></p>
            <p style="margin:2px 0; font-size:13px; color:#6b7280;">Date: ${issueDate.toLocaleDateString()}</p>
            <p style="margin:2px 0; font-size:13px; color:#6b7280;">Due: ${escapeHtml(dueDateLabel)}</p>
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
      ${paymentDetailsHtml}
      <div style="margin-top:30px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280; text-align:center;">
        <p style="margin-bottom:6px;">Payment due ${terms === 'on_receipt' ? 'on receipt of this invoice' : 'by ' + dueDate.toLocaleDateString()}.</p>
        <p>${escapeHtml(settings.customMessage)}</p>
      </div>
    </div>
  `;
  generateAndSharePdf(html, `invoice-${escapeHtml(j.customer_name).replace(/\s/g, '_')}`, j.customer_email, `Invoice ${invoiceNum} from ${settings.businessName}`);
}

/**
 * FIX 3: Builds the payment details HTML section for invoices.
 * Only renders if at least one payment detail field is populated in settings.
 * This section appears ONLY on invoices, never on quotes.
 */
function _buildPaymentDetailsHtml() {
  const acctName   = (settings.paymentAccountName || '').trim();
  const bankName   = (settings.paymentBankName || '').trim();
  const bsb        = (settings.paymentBSB || '').trim();
  const acctNum    = (settings.paymentAccountNumber || '').trim();
  const payRef     = (settings.paymentReference || '').trim();
  const payLink    = (settings.paymentLink || '').trim();

  /* Only show section if at least one field is filled */
  const hasAny = acctName || bankName || bsb || acctNum || payRef || payLink;
  if (!hasAny) return '';

  let rows = '';
  if (acctName) rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280; width:130px;">Account Name</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(acctName)}</td></tr>`;
  if (bankName) rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280;">Bank</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(bankName)}</td></tr>`;
  if (bsb)      rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280;">BSB</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(bsb)}</td></tr>`;
  if (acctNum)  rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280;">Account Number</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(acctNum)}</td></tr>`;
  if (payRef)   rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280;">Reference</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(payRef)}</td></tr>`;

  let linkHtml = '';
  if (payLink) {
    const safeLink = escapeHtml(payLink);
    linkHtml = `<div style="margin-top:8px; text-align:center;"><a href="${safeLink}" style="color:#2563eb; font-size:13px; text-decoration:underline;">Pay Online</a></div>`;
  }

  return `
    <div style="margin-top:24px; background:#f0f9ff; border:1px solid #bfdbfe; border-radius:8px; padding:16px;">
      <h3 style="margin:0 0 10px; font-size:13px; text-transform:uppercase; color:#2563eb; letter-spacing:0.05em;">Payment Details</h3>
      <table style="width:100%; border-collapse:collapse;">
        ${rows}
      </table>
      ${linkHtml}
    </div>
  `;
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
  /* Read payment fields from job row (cloud-backed) */
  const quoted        = parseFloat(j.quoted_price) || 0;
  const amountPaid    = parseFloat(j.amount_paid)  || 0;
  const paymentMethod = j.payment_method || 'Not specified';
  const paymentNotes  = j.payment_notes  || '';
  const paidAt        = j.paid_at ? new Date(j.paid_at).toLocaleDateString() : new Date().toLocaleDateString();

  const logoHtml = getLogoHtmlForPdf();

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
            <h1 style="margin:0; color:#059669; font-size:28px;">RECEIPT</h1>
            <p style="margin:4px 0; font-size:14px; color:#374151;"><strong>${escapeHtml(receiptNum)}</strong></p>
            <p style="margin:2px 0; font-size:13px; color:#6b7280;">Date: ${paidAt}</p>
          </td>
        </tr>
      </table>
      <div style="background:#f0fdf4; border-radius:8px; padding:16px; margin-bottom:24px; border:1px solid #bbf7d0;">
        <div style="text-align:center;">
          <div style="font-size:14px; color:#059669; font-weight:700; margin-bottom:4px;">Payment Received</div>
          <div style="font-size:28px; font-weight:900; color:#059669;">$${amountPaid.toFixed(2)}</div>
        </div>
      </div>
      <div style="background:#f9fafb; border-radius:8px; padding:16px; margin-bottom:24px;">
        <h3 style="margin:0 0 8px; font-size:13px; text-transform:uppercase; color:#6b7280;">Received From</h3>
        <p style="margin:2px 0; font-weight:700;">${escapeHtml(j.customer_name)}</p>
        <p style="margin:2px 0; font-size:13px;">${escapeHtml(j.customer_phone || '')}</p>
        <p style="margin:2px 0; font-size:13px;">${escapeHtml(j.customer_email || '')}</p>
        <p style="margin:2px 0; font-size:13px;">${escapeHtml(j.service_address || '')}</p>
      </div>
      <table style="width:100%; border-collapse:collapse; margin-bottom:24px;">
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 0; font-size:14px; color:#6b7280;">Services</td>
          <td style="padding:10px 0; text-align:right; font-size:14px;">${escapeHtml(j.items_summary || 'Window cleaning services')}</td>
        </tr>
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:10px 0; font-size:14px; color:#6b7280;">Quoted Price</td>
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

/* ===== Shared PDF generator for invoice/receipt/quote ===== */
async function _generateAndSharePdfInner(htmlContent, filename, email, subject) {
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

    /* Try native share, fallback to download + email prompt */
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
      /* FIX 1: Desktop fallback — download PDF then open clean mailto prompt.
       * NO attachment parameters are passed. The modal tells the user to
       * attach the downloaded PDF manually. */
      downloadBlob(pdfBlob, `${filename}.pdf`);
      if (typeof openDesktopEmailModal === 'function') {
        openDesktopEmailModal(email || '', subject || '');
      } else {
        showToast('PDF downloaded!', 'success');
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
const generateAndSharePdf = asyncGuard(_generateAndSharePdfInner, 'generateAndSharePdf');

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
 * Returns an <img> tag for the logo to use in PDF templates.
 *
 * Pro users: custom uploaded logo (proState.logoDataUrl) if available.
 * Free users: app logo (logo.png) for consistent branding.
 */
function getLogoHtmlForPdf() {
  /* Pro users: show custom uploaded logo if available */
  if (hasProAccess() && proState.logoDataUrl) {
    return `<img src="${proState.logoDataUrl}" style="max-width:120px; max-height:60px; margin-bottom:4px;" crossorigin="anonymous" />`;
  }
  /* Free users (and Pro without custom logo): show app logo */
  return `<img src="./logo.png" style="max-width:120px; max-height:60px; margin-bottom:4px;" crossorigin="anonymous" />`;
}
