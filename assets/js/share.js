console.log("[WQP] share.js loaded");

async function exportQuotePDF() {
  if (!hasProAccess()) {
    showToast('PDF export requires a Pro subscription', 'error');
    return;
  }

  if (typeof html2pdf === 'undefined') {
    showToast('PDF library not loaded.', 'error');
    return;
  }

  try {
    const data = getQuoteData();

    const rawName = (el('q-name')?.value || 'customer').trim();
    const safeName = rawName.replace(/[^a-zA-Z0-9 _-]/g, '') || 'customer';

    let pdfElement = document.getElementById('pdf-export-container');

    if (!pdfElement) {
      pdfElement = document.createElement('div');
      pdfElement.id = 'pdf-export-container';

      Object.assign(pdfElement.style, {
        position: 'fixed',
        left: '-99999px',
        top: '0',
        width: '800px',
        background: '#ffffff',
        padding: '0',
        margin: '0',
        zIndex: '-1',
        visibility: 'visible',
        opacity: '1'
      });

      document.body.appendChild(pdfElement);
    }

    pdfElement.innerHTML = buildPdfHtml(data);

    await new Promise(resolve => setTimeout(resolve, 150));

    const worker = html2pdf()
      .set({
        margin: 10,
        filename: `quote-${safeName}.pdf`,
        image: {
          type: 'jpeg',
          quality: 1
        },
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
          orientation: 'portrait'
        }
      })
      .from(pdfElement);

    await worker.save();

    showToast('PDF exported!', 'success');

    setTimeout(() => {
      if (pdfElement) pdfElement.innerHTML = '';
    }, 1000);

  } catch (e) {
    console.error('PDF export failed:', e);
    showToast('PDF export failed', 'error');
  }

  closeShareModal();
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

function emailQuote() {
  const t = (el('quote-preview-text') || {}).textContent || '';
  const email = (el('q-email') || {}).value || '';
  window.location.href = `mailto:${email}?subject=${encodeURIComponent('Quote from ' + settings.businessName)}&body=${encodeURIComponent(t)}`;
  closeShareModal();
}

function smsQuote() {
  const t = (el('quote-preview-text') || {}).textContent || '';
  const phone = (el('q-phone') || {}).value || '';
  window.location.href = `sms:${phone}?body=${encodeURIComponent(t)}`;
  closeShareModal();
}

function whatsappQuote() {
  const t = (el('quote-preview-text') || {}).textContent || '';
  let phone = ((el('q-phone') || {}).value || '').replace(/\s+/g, '');
  if (phone.startsWith('0')) phone = '61' + phone.slice(1);
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(t)}`, '_blank');
  closeShareModal();
}
