/**
 * TopShot Serial Multiples — Storage Helper
 *
 * Wraps chrome.storage.sync for config persistence.
 * Falls back to defaults for any missing keys.
 */

import { DEFAULT_CONFIG } from "./config.js";

const STORAGE_KEY = "tsm_config";

/**
 * Load the user's config, merged with defaults.
 * Any keys the user hasn't customized fall back to DEFAULT_CONFIG.
 * Uses chrome.storage.local — sync has an 8KB per-item limit that
 * our config object easily exceeds with 10+ tiers.
 */
export async function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const saved = result[STORAGE_KEY] || {};
      const merged = deepMerge(DEFAULT_CONFIG, saved);
      resolve(merged);
    });
  });
}

/**
 * Save the user's config (only the delta from defaults if you want,
 * but for simplicity we save the whole object).
 */
export async function saveConfig(config) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [STORAGE_KEY]: config }, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Reset config to defaults.
 */
export async function resetConfig() {
  return saveConfig(DEFAULT_CONFIG);
}

/**
 * Listen for config changes (useful for content script hot-reload).
 */
export function onConfigChange(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      callback(changes[STORAGE_KEY].newValue);
    }
  });
}

/**
 * Deep merge: target values are overwritten by source values,
 * but nested objects are merged recursively.
 * Arrays are replaced wholesale (not concatenated).
 */
function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}
