// ==UserScript==
// @name        Azure DevOps Branch Name Autofill
// @namespace   https://github.com/jamiegluk
// @version     1.0.0
// @description Autofills the "Create a branch" name field in Azure DevOps with a formatted branch name based on the linked work item.
// @author      Jamie Lievesley
// @license     MIT
// @match       https://dev.azure.com/*
// @match       https://*.visualstudio.com/*
// @grant       none
// @homepageURL https://github.com/jamiegluk/azure-devops-branch-name-autofill
// @supportURL  https://github.com/jamiegluk/azure-devops-branch-name-autofill/issues
// ==/UserScript==

(function () {
  "use strict";

  // ──────────────────────────────────────────────
  //  Debug logging — set to false to silence
  // ──────────────────────────────────────────────

  const DEBUG = true;

  function log(...args) {
    if (DEBUG) console.log("[BranchAutofill]", ...args);
  }

  log("Script loaded on", window.location.href);

  // ──────────────────────────────────────────────
  //  Configuration — edit these to taste
  // ──────────────────────────────────────────────

  /** Branch prefix (e.g. "feature/", "bugfix/", or ""). */
  const BRANCH_PREFIX = "feature/";

  /**
   * Format a work-item title into the branch-name suffix.
   *
   * Default: Dash-Separated-Pascal-Case
   *   "hello world example" → "Hello-World-Example"
   *
   * Replace this function to change the naming convention.
   *
   * @param {string} title - The raw work-item title.
   * @returns {string} The formatted title for use in a branch name.
   */
  function formatTitle(title) {
    return title
      .replace(/[/\\|:;_~+&,>]+/g, " ") // treat punctuation as word separators
      .replace(/[^a-zA-Z0-9\s-]/g, "") // strip remaining special characters
      .replace(/\s+/g, " ") // collapse whitespace
      .trim()
      .split(/[\s-]+/) // split on spaces or hyphens
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("-");
  }

  // ──────────────────────────────────────────────
  //  Core logic — you probably don't need to edit below here
  // ──────────────────────────────────────────────

  /**
   * Build the full branch name from a work-item ID and title.
   *
   * @param {string|number} id - The work-item ID.
   * @param {string} title - The raw work-item title.
   * @returns {string} The formatted branch name.
   */
  function buildBranchName(id, title) {
    return `${BRANCH_PREFIX}${id}-${formatTitle(title)}`;
  }

  /**
   * Try to extract the work-item ID and title from the "Create a branch"
   * dialog's linked-work-items table.
   *
   * The linked work item appears inside `.region-createBranchDialogExtensions`
   * as a link whose text is formatted as "Type NNNN: Title".
   *
   * @param {Element} dialog - The dialog element.
   * @returns {{ id: string, title: string } | null}
   */
  function getWorkItemFromDialog(dialog) {
    const extensionsRegion = dialog.querySelector(
      '.region-createBranchDialogExtensions'
    );
    if (!extensionsRegion) {
      log("No .region-createBranchDialogExtensions found in dialog");
      log("Dialog innerHTML preview:", dialog.innerHTML.substring(0, 500));
      return null;
    }
    log("Found extensions region");

    // Look for the first work-item link in the linked-items table
    const link = extensionsRegion.querySelector(
      'a[href*="_workitems/edit/"]'
    );
    if (!link) {
      log("No work-item link found in extensions region");
      log("Extensions region innerHTML:", extensionsRegion.innerHTML.substring(0, 500));
      return null;
    }

    const text = link.textContent.trim();
    log("Work item link text:", text);

    // Format: "Type 12345: Some title here"
    const match = text.match(/^\w+\s+(\d+):\s*(.+)$/);
    if (!match) {
      log("Link text did not match expected pattern");
      return null;
    }

    log("Parsed work item — ID:", match[1], "Title:", match[2].trim());
    return { id: match[1], title: match[2].trim() };
  }

  /**
   * Set the branch name input value and fire React-compatible change events
   * so Azure DevOps picks up the programmatic change.
   *
   * @param {HTMLInputElement} input - The branch-name input element.
   * @param {string} value - The branch name to set.
   */
  function setInputValue(input, value) {
    // Use the native setter to bypass React's synthetic event system
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;
    nativeInputValueSetter.call(input, value);

    // Dispatch events that React / Azure DevOps BOLT UI listens for
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Fill the branch name input once we have the work item info.
   *
   * @param {HTMLInputElement} branchInput - The branch-name input element.
   * @param {{ id: string, title: string }} workItem - The parsed work item.
   */
  function fillBranchName(branchInput, workItem) {
    // Only autofill if the field is still empty (don't overwrite user input)
    if (branchInput.value.trim() !== "") {
      log("Input already has a value, skipping autofill");
      return;
    }

    const branchName = buildBranchName(workItem.id, workItem.title);
    log("Setting branch name to:", branchName);
    setInputValue(branchInput, branchName);

    // Focus the input so the user can see and tweak the value
    branchInput.focus();
    branchInput.select();
    log("Autofill complete");
  }

  /**
   * Wait for the work-item link to appear inside the extensions region,
   * then autofill the branch name. Uses a MutationObserver so we don't
   * rely on a fixed timeout — the linked work items load asynchronously.
   *
   * @param {Element} dialog - The dialog root element.
   * @param {HTMLInputElement} branchInput - The branch-name input element.
   * @param {Element} extensionsRegion - The extensions region element.
   */
  function waitForWorkItem(dialog, branchInput, extensionsRegion) {
    // Check if the link is already present (e.g. fast load / cached)
    const workItem = getWorkItemFromDialog(dialog);
    if (workItem) {
      fillBranchName(branchInput, workItem);
      return;
    }

    log("Work item link not yet loaded, watching for changes...");

    const TIMEOUT_MS = 10000;
    let settled = false;

    const workItemObserver = new MutationObserver(() => {
      if (settled) return;
      const wi = getWorkItemFromDialog(dialog);
      if (wi) {
        settled = true;
        workItemObserver.disconnect();
        fillBranchName(branchInput, wi);
      }
    });

    workItemObserver.observe(extensionsRegion, {
      childList: true,
      subtree: true,
    });

    // Safety timeout — stop watching after a while
    setTimeout(() => {
      if (!settled) {
        settled = true;
        workItemObserver.disconnect();
        log("Timed out waiting for work item link to load");
      }
    }, TIMEOUT_MS);
  }

  /**
   * Handle a newly appeared "Create a branch" dialog.
   *
   * @param {Element} dialog - The dialog root element.
   */
  function handleBranchDialog(dialog) {
    log("handleBranchDialog called");

    const branchInput = dialog.querySelector("input.item-name-input");
    if (!branchInput) {
      log("No input.item-name-input found in dialog");
      return;
    }
    log("Found branch input, current value:", JSON.stringify(branchInput.value));

    if (branchInput.value.trim() !== "") {
      log("Input already has a value, skipping autofill");
      return;
    }

    const extensionsRegion = dialog.querySelector(
      '.region-createBranchDialogExtensions'
    );
    if (!extensionsRegion) {
      log("No .region-createBranchDialogExtensions found in dialog");
      return;
    }

    waitForWorkItem(dialog, branchInput, extensionsRegion);
  }

  // ──────────────────────────────────────────────
  //  MutationObserver — watch for the dialog to appear
  // ──────────────────────────────────────────────

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // The dialog heading has id="__bolt-create-version-dialog"
        // and text "Create a branch". The dialog root is an ancestor.
        const dialogHeading =
          node.id === "__bolt-create-version-dialog"
            ? node
            : node.querySelector?.("#__bolt-create-version-dialog");

        if (!dialogHeading) continue;

        log("Detected 'Create a branch' dialog heading");

        // Walk up to the dialog root
        const dialog = dialogHeading.closest('[role="dialog"]') || node;
        log("Dialog root element:", dialog.tagName, dialog.className);

        // Small delay to let the dialog shell render its children
        setTimeout(() => handleBranchDialog(dialog), 100);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  log("MutationObserver attached to document.body");
})();
