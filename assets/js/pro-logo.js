console.log("[WQP] pro-logo.js loaded");

(function () {
  function safeGetProState() {
    if (typeof window.proState !== "object" || !window.proState) {
      window.proState = {};
    }
    return window.proState;
  }

  function updateLogoPreview() {
    const state = safeGetProState();
    const el = document.getElementById("logo-preview");

    if (!el) return;

    if (state.logoDataUrl) {
      el.src = state.logoDataUrl;
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
  }

  function handleLogoUpload(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const state = safeGetProState();
      state.logoDataUrl = e.target.result;

      localStorage.setItem("wqp-logo", state.logoDataUrl);
      updateLogoPreview();
    };

    reader.readAsDataURL(file);
  }

  function removeLogo() {
    const state = safeGetProState();

    state.logoDataUrl = null;
    localStorage.removeItem("wqp-logo");

    updateLogoPreview();
  }

  function loadLogoFromStorage() {
    const state = safeGetProState();

    const saved = localStorage.getItem("wqp-logo");
    if (saved) {
      state.logoDataUrl = saved;
    }
  }

  // EXPOSE GLOBALS (THIS WAS YOUR CORE FAILURE)
  window.removeLogo = removeLogo;
  window.handleLogoUpload = handleLogoUpload;
  window.updateLogoPreview = updateLogoPreview;

  // INIT SAFE
  document.addEventListener("DOMContentLoaded", () => {
    loadLogoFromStorage();
    updateLogoPreview();
  });
})();
