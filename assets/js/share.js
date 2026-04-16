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

/* ===== Part 3: Invoice Generation ===== */

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

  openInvoiceDueDateModal(function(terms, dueDate) {
    _generateInvoicePdf(j, dueDate, terms);
  });
}

function _generateInvoicePdf(j, dueDate, terms) {
  const invoiceNum = getNextInvoiceNumber();
  const quoted = parseFloat(j.quoted_price) || 0;
  const amountPaid = parseFloat(j.amount_paid) || 0;
  const amountDue = Math.max(0, quoted - amountPaid);

  const logoHtml = getLogoHtmlForPdf();
  const issueDate = new Date();

  let dueDateLabel = dueDate.toLocaleDateString();
  if (terms === 'on_receipt') {
    dueDateLabel = 'Due on receipt';
  }

  if (j) {
    j.invoice_due_date = dueDate.toISOString();
  }

  const paymentDetailsHtml = _buildPaymentDetailsHtml();

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 600px; color: #111827; background:#ffffff;">
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

  generateAndSharePdf(
    html,
    `invoice-${escapeHtml(j.customer_name).replace(/\s/g, '_')}`,
    j.customer_email,
    `Invoice ${invoiceNum} from ${settings.businessName}`
  );
}

function _buildPaymentDetailsHtml() {
  const acctName = (settings.paymentAccountName || '').trim();
  const bankName = (settings.paymentBankName || '').trim();
  const bsb = (settings.paymentBSB || '').trim();
  const acctNum = (settings.paymentAccountNumber || '').trim();
  const payRef = (settings.paymentReference || '').trim();
  const payLink = (settings.paymentLink || '').trim();

  const hasAny = acctName || bankName || bsb || acctNum || payRef || payLink;
  if (!hasAny) return '';

  let rows = '';
  if (acctName) rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280; width:130px;">Account Name</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(acctName)}</td></tr>`;
  if (bankName) rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280;">Bank</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(bankName)}</td></tr>`;
  if (bsb) rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280;">BSB</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(bsb)}</td></tr>`;
  if (acctNum) rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280;">Account Number</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(acctNum)}</td></tr>`;
  if (payRef) rows += `<tr><td style="padding:3px 0; font-size:13px; color:#6b7280;">Reference</td><td style="padding:3px 0; font-size:13px; font-weight:600;">${escapeHtml(payRef)}</td></tr>`;

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
  const quoted = parseFloat(j.quoted_price) || 0;
  const amountPaid = parseFloat(j.amount_paid) || 0;
  const paymentMethod = j.payment_method || 'Not specified';
  const paymentNotes = j.payment_notes || '';
  const paidAt = j.paid_at ? new Date(j.paid_at).toLocaleDateString() : new Date().toLocaleDateString();

  const logoHtml = getLogoHtmlForPdf();

  const html = `
    <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 600px; color: #111827; background:#ffffff;">
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

  generateAndSharePdf(
    html,
    `receipt-${escapeHtml(j.customer_name).replace(/\s/g, '_')}`,
    j.customer_email,
    `Receipt ${receiptNum} from ${settings.businessName}`
  );
}

/* ===== Shared PDF generator for invoice/receipt/quote ===== */

function shouldUseNativeShareForPdf(email) {
  const ua = navigator.userAgent || '';
  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    (navigator.maxTouchPoints || 0) > 1;

  /* Only use native share on mobile-ish devices.
     Desktop should go to download + email modal so recipient prefills cleanly. */
  return isMobile && !!navigator.share && !!navigator.canShare;
}

async function _generateAndSharePdfInner(htmlContent, filename, email, subject) {
  let mount = null;

  try {
        mount = document.createElement('div');
    mount.id = 'pdf-doc-mount';
    Object.assign(mount.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: '794px',
      minHeight: '1123px',
      background: '#ffffff',
      overflow: 'visible',
      padding: '0',
      margin: '0',
      opacity: '0',
      pointerEvents: 'none',
      zIndex: '-1'
    });

    mount.innerHTML = `
      <div id="pdf-doc-inner" style="
        width: 794px;
        min-height: 1123px;
        margin: 0 auto;
        padding: 0;
        background: #ffffff;
        box-sizing: border-box;
        overflow: visible;
      ">
        <div style="
          width: 794px;
          min-height: 1123px;
          margin: 0 auto;
          background: #ffffff;
          box-sizing: border-box;
          overflow: visible;
        ">
          ${htmlContent}
        </div>
      </div>
    `;
    document.body.appendChild(mount);

    const target = document.getElementById('pdf-doc-inner');
    if (!target) throw new Error('PDF target not created');

    const waitForImages = async (root) => {
      const images = Array.from(root.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
        });
      }));
    };

    await waitForImages(target);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const pdfBlob = await html2pdf()
      .set({
        margin: [0, 0, 0, 0],
        filename: `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        pagebreak: { mode: ['css', 'legacy'] },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          logging: false,
          scrollX: 0,
          scrollY: 0
        },
        jsPDF: {
          unit: 'mm',
          format: 'a4',
          orientation: 'portrait',
          compress: true
        }
      })
      .from(target)
      .outputPdf('blob');

    const pdfFile = new File([pdfBlob], `${filename}.pdf`, { type: 'application/pdf' });

    if (shouldUseNativeShareForPdf(email) && navigator.canShare({ files: [pdfFile] })) {
      try {
        await navigator.share({
          title: subject,
          files: [pdfFile]
        });
        showToast('Shared!', 'success');
        return;
      } catch (shareErr) {
        /* User cancelled mobile share or share failed; continue to fallback */
        console.warn('Native share cancelled/failed:', shareErr);
      }
    }

    /* Desktop/browser fallback */
    downloadBlob(pdfBlob, `${filename}.pdf`);

    if (typeof openDesktopEmailModal === 'function') {
      openDesktopEmailModal(email || '', subject || '');
    } else {
      showToast('PDF downloaded! Attach it manually to your email.', 'success');
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
function getLogoHtmlForPdf() {
  if (hasProAccess() && proState.logoDataUrl) {
    return `<img src="${proState.logoDataUrl}" style="max-width:120px; max-height:60px; margin-bottom:4px;" crossorigin="anonymous" />`;
  }
  return `<img src="./logo.png" style="max-width:120px; max-height:60px; margin-bottom:4px;" crossorigin="anonymous" />`;
}
