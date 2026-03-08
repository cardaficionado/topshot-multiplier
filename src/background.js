/**
 * TopShot Serial Multiples — Background Service Worker
 *
 * Handles:
 * - Extension installation / update lifecycle
 * - Message routing between content scripts and popup/options
 * - Future: baseline price API calls (Phase 2)
 */

// ── Installation ─────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("[TSM] Extension installed. Opening options page.");
    chrome.tabs.create({ url: "src/options.html" });
  } else if (details.reason === "update") {
    console.log(`[TSM] Extension updated to v${chrome.runtime.getManifest().version}`);
  }
});

// ── Message Handler ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "TSM_GET_BASELINE":
      // Phase 2: Fetch baseline price from Top Shot API
      // For now, return a placeholder
      handleBaselineRequest(message.payload).then(sendResponse);
      return true; // async response

    case "TSM_CLEAR_CACHE":
      // Clear cached price data
      chrome.storage.local.remove(["tsm_price_cache"], () => {
        sendResponse({ success: true });
      });
      return true;

    case "TSM_GET_VERSION":
      sendResponse({ version: chrome.runtime.getManifest().version });
      return false;
  }
});

// ── Baseline Price Fetching (Phase 2 placeholder) ────────────────
async function handleBaselineRequest(payload) {
  // TODO: Implement API calls to fetch baseline prices
  // This would call the Top Shot GraphQL API to get:
  // 1. The last sale of the largest edition (default baseline)
  // 2. Or the last sale of a specific parallel (user-selected baseline)
  //
  // Example GraphQL query structure:
  // query GetMomentListings($input: GetMomentListingsInput!) {
  //   searchMomentListings(input: $input) {
  //     momentListings {
  //       moment { flowSerialNumber setPlay { circulationCount } }
  //       price
  //     }
  //   }
  // }

  return {
    success: false,
    message: "Baseline API not yet implemented — using ask price as proxy",
    price: null,
  };
}
