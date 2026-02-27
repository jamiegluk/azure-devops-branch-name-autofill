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

  /** @param {any[]} args */
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

    const text = (link.textContent || "").trim();
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
    const nativeInputValueSetter = /** @type {Function} */ (
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
    );
    nativeInputValueSetter.call(input, value);

    // Dispatch events that React / Azure DevOps BOLT UI listens for
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * Add a "Copy to clipboard" button next to the branch name input,
   * matching the native Azure DevOps bolt-clipboard-button style.
   *
   * @param {HTMLInputElement} branchInput - The branch-name input element.
   */
  function addCopyButton(branchInput) {
    // Don't add twice
    const container = branchInput.closest(".flex-column");
    if (!container || container.querySelector(".bolt-clipboard-button")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "bolt-clipboard-button";
    wrapper.style.cssText =
      "position:absolute;top:50%;transform:translateY(-50%);display:none;";

    const btn = document.createElement("button");
    btn.setAttribute("aria-label", "Copy to clipboard");
    btn.className =
      "bolt-button bolt-icon-button enabled icon-only bolt-focus-treatment";
    btn.type = "button";
    btn.title = "Copy to clipboard";

    const iconOuter = document.createElement("span");
    iconOuter.className = "fluent-icons-enabled";
    const iconInner = document.createElement("span");
    iconInner.setAttribute("aria-hidden", "true");
    iconInner.className =
      "left-icon flex-noshrink fabric-icon ms-Icon--Copy medium";
    iconOuter.appendChild(iconInner);
    btn.appendChild(iconOuter);
    wrapper.appendChild(btn);

    // Place inside the .bolt-textfield, absolute-positioned to the right.
    // Dynamically offset to avoid overlapping any suffix icon (e.g. error).
    const textfieldDiv = branchInput.closest(".bolt-textfield");
    if (textfieldDiv) {
      /** @type {HTMLElement} */ (textfieldDiv).style.position = "relative";
      textfieldDiv.appendChild(wrapper);

      /** Position the button and pad the input to avoid text overlap. */
      const btnSpace = 32; // copy button width + small gap
      // Capture the original padding before we modify it
      const originalPadding =
        parseFloat(getComputedStyle(branchInput).paddingRight) || 0;
      const updatePosition = () => {
        const suffix = textfieldDiv.querySelector(".suffix.bolt-textfield-icon");
        // suffix takes: padding-right 4px + margin-right 7px + 1rem icon ≈ 27px
        const suffixWidth = suffix ? 27 : 0;
        wrapper.style.right = (suffixWidth + 4) + "px";
        branchInput.style.paddingRight = (originalPadding + btnSpace) + "px";
      };
      updatePosition();

      // Re-check position when the error icon may appear/disappear
      const posObserver = new MutationObserver(updatePosition);
      posObserver.observe(textfieldDiv, { childList: true, subtree: true });

      // Show on hover / focus, hide on leave
      const show = () => { wrapper.style.display = ""; };
      const hide = () => { wrapper.style.display = "none"; };
      textfieldDiv.addEventListener("mouseenter", show);
      textfieldDiv.addEventListener("mouseleave", hide);
      branchInput.addEventListener("focus", show);
      branchInput.addEventListener("blur", () => {
        // Small delay so click on button still registers
        setTimeout(hide, 200);
      });
    }

    btn.addEventListener("click", () => {
      const value = branchInput.value;
      navigator.clipboard.writeText(value).then(() => {
        log("Copied to clipboard:", value);
        // Brief visual feedback — swap icon to a checkmark
        iconInner.className =
          "left-icon flex-noshrink fabric-icon ms-Icon--CheckMark medium";
        setTimeout(() => {
          iconInner.className =
            "left-icon flex-noshrink fabric-icon ms-Icon--Copy medium";
        }, 1500);
      });
    });

    log("Copy button added");
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

    // Add a copy button next to the input
    addCopyButton(branchInput);

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

    const branchInput = /** @type {HTMLInputElement | null} */ (
      dialog.querySelector("input.item-name-input")
    );
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
