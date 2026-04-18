console.log("[WQP] app.js booting");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("[WQP] DOM ready");

  try {
    if (typeof loadLocalSettings === "function") loadLocalSettings();
    if (typeof renderSteppers === "function") renderSteppers();
    if (typeof syncSettingsForm === "function") syncSettingsForm();
    if (typeof renderSettingsGrids === "function") renderSettingsGrids();
    if (typeof updateQuoteDisplay === "function") updateQuoteDisplay();

    if (typeof bootPro === "function") {
      await bootPro();
    }

    if (typeof updateLogoPreview === "function") {
      updateLogoPreview();
    }

    bindUI();

  } catch (err) {
    console.error("[WQP] BOOT FAILURE:", err);
  }
});

function bindUI() {
  // SAFE BIND REMOVE LOGO
  const removeBtn = document.getElementById("remove-logo-btn");
  if (removeBtn && typeof window.removeLogo === "function") {
    removeBtn.addEventListener("click", window.removeLogo);
  }

  // SAFE FILE UPLOAD
  const upload = document.getElementById("logo-upload");
  if (upload && typeof window.handleLogoUpload === "function") {
    upload.addEventListener("change", (e) => {
      const file = e.target.files[0];
      window.handleLogoUpload(file);
    });
  }
}
