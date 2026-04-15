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

  let mount = null;

  try {
    const data = getQuoteData();

    const rawName = (el('q-name')?.value || 'customer').trim();
    const safeName = rawName.replace(/[^a-zA-Z0-9 _-]/g, '') || 'customer';

    mount = document.createElement('div');
    mount.id = 'pdf-export-mount';

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
      <div id="pdf-export-inner" style="
        width: 794px;
        min-height: 1123px;
        margin: 0 auto;
        background: #ffffff;
      ">
        ${buildPdfHtml(data)}
      </div>
    `;

    document.body.appendChild(mount);

    const target = document.getElementById('pdf-export-inner');
    if (!target) throw new Error('PDF target not created');

    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    await html2pdf()
      .set({
        margin: 0,
        filename: `quote-${safeName}.pdf`,
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
      .save();

    showToast('PDF exported!', 'success');
    closeShareModal();
  } catch (e) {
    console.error('PDF export failed:', e);
    showToast('PDF export failed', 'error');
  } finally {
    if (mount && mount.parentNode) {
      mount.parentNode.removeChild(mount);
    }
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
