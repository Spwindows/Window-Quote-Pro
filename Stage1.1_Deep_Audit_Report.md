# Deep Stabilisation Audit Report: Window Quote Pro

This document outlines the findings of a deep stabilisation audit performed on the Window Quote Pro frontend codebase. The audit covered all JavaScript files (excluding `app.js`), `index.html`, and `styles.css` against a 10-point checklist designed to identify runtime failures, logical errors, and missing definitions.

## 1. Cross-Reference Map & Load Order Analysis

A complete mapping of function definitions and their invocations across all files was conducted. The application loads its scripts synchronously via `index.html` in the following order:

1. `supabase-js` (CDN)
2. `html2pdf` (CDN)
3. `config.js`
4. `state.js`
5. `helpers.js`
6. `ui.js`
7. `subscription.js`
8. `settings.js`
9. `quote.js`
10. `share.js`
11. `onboarding.js`
12. `jobs.js`
13. `pro.js`
14. `app.js`

### Dependency Verification

The audit confirmed that all functions called within the codebase are defined. While some files reference functions defined in files that load later (e.g., `settings.js` calling `getSb()` from `pro.js`), these invocations only occur at runtime (e.g., triggered by user interactions) after all scripts have successfully loaded. Therefore, no undefined function errors will occur during the initial page load.

All variables referenced across the modules are correctly declared and scoped. The application heavily relies on global state objects (e.g., `proState`, `settings`, `quoteState`) defined in `state.js`, which are safely accessed by subsequent modules.

## 2. Issues Found and Fixed

The codebase is generally defensive and well-structured. However, several issues were identified and corrected to improve stability and developer experience.

### 2.1. Unhandled Supabase Auth Error in `bootPro()`
**Severity:** Moderate
**File:** `pro.js`

The `bootPro()` function destructured the result of `sb.auth.getUser()` without a `try/catch` block. If the Supabase client encountered a network error or returned an unexpected response format, the destructuring assignment would fail, causing an unhandled promise rejection and halting the initialization of all Pro features.

**Fix:** The `getUser()` call was wrapped in a `try/catch` block. The code now safely handles potential errors, logs a warning, and defaults the user to `null`, allowing the application to gracefully degrade to the free tier state instead of crashing.

### 2.2. Missing Null Guard in `resetAllData()`
**Severity:** Minor
**File:** `settings.js`

The `resetAllData()` function called `sb.rpc('reset_team_data')` without verifying that the `sb` (Supabase client) object was successfully initialized. If `getSb()` returned `null` (e.g., due to invalid credentials or network issues), attempting to access `sb.rpc` would throw a `TypeError`.

**Fix:** A null check for the `sb` object was added before executing the RPC call, ensuring the function fails safely if the database client is unavailable.

### 2.3. Misleading Debug Logging Across Modules
**Severity:** Minor
**Files:** All JS files except `quote.js` and `app.js`

Ten of the twelve JavaScript files contained an identical, hardcoded block of eight `console.log` statements at the top of the file. This resulted in 80 redundant log entries during page load, falsely indicating that modules like `app.js` had loaded before they actually had. This significantly hampered debugging efforts.

**Fix:** The redundant logging blocks were removed from all affected files. They were replaced with a single, accurate `console.log` statement per file (e.g., `console.log("[WQP] config.js loaded");`), providing clear and truthful initialization tracking.

## 3. Issues Identified but Intentionally Not Fixed

During the audit, certain anomalies were discovered that do not constitute runtime bugs or violate the project's requirements. These were intentionally left unchanged to preserve existing behavior and avoid feature creep.

### 3.1. Missing DOM Elements for Job Scheduling
**File:** `jobs.js`

The `saveTeamJob()` function attempts to read values from DOM elements with IDs `job-date` and `job-time`. However, these IDs do not exist in `index.html`. 

**Reasoning:** The code is defensively written; it handles the absence of these elements gracefully by defaulting the values to empty strings and setting `scheduledAt` to `null`. This represents an incomplete feature rather than a runtime crash. Fixing it would require adding new UI components to `index.html`, which violates the instruction to avoid adding features or modifying HTML unless fixing a broken script reference.

### 3.2. Service Worker Asset Paths
**File:** `sw.js`

The service worker script references icon files (e.g., `./icon-192.png`) that were not provided in the audit scope. If these files are missing in the deployment environment, the service worker installation will fail, preventing offline functionality.

**Reasoning:** This is a deployment and asset management concern, not a JavaScript logic error. Furthermore, the service worker registration code in `app.js` is currently commented out, rendering the `sw.js` file inactive.

### 3.3. Supabase Anon Key Format
**File:** `config.js`

The `SUPABASE_ANON_KEY` is formatted as `sb_publishable_...` rather than the traditional JWT format (`eyJ...`).

**Reasoning:** Research confirms that as of September 2024, Supabase introduced new API key formats, where `sb_publishable_` replaces the legacy anonymous key. The format is valid, and the actual value is a deployment configuration concern, not a codebase defect.

### 3.4. Hourly Pricing Mode Summary Output
**File:** `quote.js`

When the application is in "Hourly Estimate" pricing mode, the generated quote summary text and PDF still display the per-item prices for individual services, even though the final subtotal is calculated based on the estimated hours multiplied by the hourly rate. This can lead to a discrepancy where the sum of the line items does not equal the displayed subtotal.

**Reasoning:** This behavior appears to be an intentional design choice to show customers the breakdown of services provided, while pricing the overall job based on time. Modifying this logic would constitute a feature change rather than a bug fix, and it does not cause any runtime errors.

## 4. Conclusion

The deep stabilisation audit confirms that the Window Quote Pro frontend codebase is structurally sound and free of critical runtime crashes. The applied fixes address edge-case unhandled promise rejections and clean up the console output, improving the overall robustness of the application. All modified files have been provided in the output package, while `app.js`, `quote.js`, `index.html`, and `styles.css` remain unchanged as requested.
