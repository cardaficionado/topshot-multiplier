/**
 * TopShot Serial Multiples — Content Script
 *
 * Runs on nbatopshot.com pages.
 *
 * TOP SHOT DOM STRUCTURE (as of March 2026):
 * - Search/marketplace pages use a virtualized list inside
 *   [data-testid="scrollable-listings"]
 * - Each listing row is an absolutely-positioned div child with
 *   an "index" attribute (0, 1, 2, ...) and hashed Chakra UI classes
 * - Classes are CSS-in-JS hashes (css-XXXXX) that change between deploys
 *   so we CANNOT rely on class names for selectors
 * - Rows are recycled as the user scrolls (virtual list), so the same
 *   DOM node gets reused with different content
 * - Serial and edition data may appear as plain numbers without # prefix
 * - Prices appear as "$NNN" text
 * - Badge icons (jersey, #1, perfect mint, diamond) appear as img/svg
 *   elements near the serial number
 */

// ── State ────────────────────────────────────────────────────────
let config = null;
let priceCache = new Map();
let annotatedFingerprints = new Set(); // track by content, not DOM node

// ── Initialize ───────────────────────────────────────────────────
async function init() {
  config = await loadConfigFromStorage();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.tsm_config) {
      config = changes.tsm_config.newValue;
      reprocessAllCards();
    }
  });

  listenForGraphQLResponses();
  observeDOM();

  // Initial scan after page has rendered
  setTimeout(() => {
    console.log("[TSM] TopShot Serial Multiples initialized");
    scanAndAnnotate();
  }, 2000);
}

// ── Config Loading ───────────────────────────────────────────────
async function loadConfigFromStorage() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(["tsm_config"], (result) => {
        if (chrome.runtime.lastError) {
          console.error("[TSM] Config load error:", chrome.runtime.lastError);
          resolve(getDefaultConfig());
          return;
        }
        const saved = result.tsm_config;
        if (!saved) {
          resolve(getDefaultConfig());
          return;
        }
        // Migrate: merge any new default tiers that don't exist in saved config
        const merged = migrateConfig(saved, getDefaultConfig());
        resolve(merged);
      });
    } catch (e) {
      console.error("[TSM] Config load exception:", e);
      resolve(getDefaultConfig());
    }
  });
}

function getDefaultConfig() {
  return {
    baselineSource: "largest_edition",
    serialTiers: [
      { id: "serial_1", label: "#1 Serial", type: "badge_detect", badgeType: "first_serial", multiplier: 5.0, enabled: true, color: "#E5243B" },
      { id: "jersey_match", label: "Jersey Match", type: "badge_detect", badgeType: "jersey_number", multiplier: 4.0, enabled: true, color: "#FFD700" },
      { id: "perfect_mint", label: "Perfect Mint", type: "badge_detect", badgeType: "perfect_mint", multiplier: 3.0, enabled: true, color: "#FF1493" },
      { id: "nba75_diamond", label: "#75 Diamond", type: "badge_detect", badgeType: "nba75", multiplier: 2.0, enabled: true, color: "#00CED1" },
      { id: "serial_1_range", label: "#1 Serial (range)", description: "Fallback for #1 if badge not detected", type: "absolute", min: 1, max: 1, multiplier: 5.0, enabled: true, color: "#E5243B" },
      { id: "perfect_mint_range", label: "Perfect Mint (range)", description: "Fallback: serial equals edition size", type: "last_serial", multiplier: 3.0, enabled: true, color: "#FF1493" },
      { id: "narrative", label: "Narrative #", type: "list", values: [
        { value: 23, emoji: "🐐" }, { value: 24, emoji: "🐍" }, { value: 33, emoji: "🍀" },
        { value: 42, emoji: "" }, { value: 69, emoji: "🍆" }, { value: 100, emoji: "💯" },
        { value: 420, emoji: "🌲" }, { value: 666, emoji: "😈" }, { value: 777, emoji: "🎲" },
        { value: 1000, emoji: "🇰" },
      ], multiplier: 1.75, enabled: true, color: "#9B59B6" },
      { id: "single_digit", label: "Single Digit (2-9)", type: "absolute", min: 2, max: 9, multiplier: 2.0, enabled: true, color: "#FF6B35" },
      { id: "low_serial", label: "Low Serial (10-25)", type: "absolute", min: 10, max: 25, multiplier: 1.6, enabled: true, color: "#4ECDC4", minEditionSize: 99 },
      { id: "top_1_pct", label: "Top 1%", type: "percentage", maxPercent: 1, multiplier: 1.2, enabled: true, color: "#7B68EE", minEditionSize: 99 },
      { id: "top_5_pct", label: "Top 5%", type: "percentage", maxPercent: 5, multiplier: 1.1, enabled: true, color: "#45B7D1", minEditionSize: 99 },
      { id: "random", label: "Random", type: "fallback", multiplier: 1.0, enabled: true, color: "#95A5A6" },
    ],
    display: {
      showMultiplier: true,
      showEstimatedValue: true,
      showDeltaToAsk: true,
      compactMode: false,
      overlayPosition: "top-right"
    },
    advanced: { baselineStaleDays: 30, cacheTTLMinutes: 15, debug: false }
  };
}

/**
 * Migrate saved config: ensure any new tiers from defaults are present,
 * and patch missing properties onto existing tiers.
 * Preserves user's customized multipliers/colors/enabled state for
 * tiers they already have.
 */
function migrateConfig(saved, defaults) {
  const merged = { ...defaults, ...saved };

  if (saved.serialTiers && defaults.serialTiers) {
    const defaultsById = new Map(defaults.serialTiers.map(t => [t.id, t]));
    const savedIds = new Set(saved.serialTiers.map(t => t.id));

    // Patch missing properties onto existing saved tiers
    const patchedTiers = saved.serialTiers.map(savedTier => {
      const defaultTier = defaultsById.get(savedTier.id);
      if (defaultTier) {
        const patched = { ...defaultTier, ...savedTier };

        // Special handling for narrative "list" tiers: if saved values are
        // plain numbers but defaults have {value, emoji} objects, upgrade them
        if (patched.type === "list" && patched.values && defaultTier.values) {
          const defaultEmojiMap = new Map();
          for (const v of defaultTier.values) {
            if (typeof v === "object" && v.value !== undefined) {
              defaultEmojiMap.set(v.value, v.emoji || "");
            }
          }

          if (defaultEmojiMap.size > 0) {
            patched.values = patched.values.map(v => {
              if (typeof v === "number") {
                // Upgrade plain number to object, pulling emoji from defaults
                return { value: v, emoji: defaultEmojiMap.get(v) || "" };
              }
              // Already an object — keep it, but fill in missing emoji from defaults
              if (v && v.value !== undefined && !v.emoji && defaultEmojiMap.has(v.value)) {
                return { ...v, emoji: defaultEmojiMap.get(v.value) };
              }
              return v;
            });
          }
        }

        return patched;
      }
      return savedTier;
    });

    // Add any entirely new tiers that don't exist in saved config
    const newTiers = defaults.serialTiers.filter(t => !savedIds.has(t.id));

    let finalTiers;
    if (newTiers.length > 0) {
      const lastBadgeIdx = patchedTiers.reduce((acc, t, i) =>
        t.type === "badge_detect" ? i : acc, -1);
      const insertAt = lastBadgeIdx + 1;

      finalTiers = [
        ...patchedTiers.slice(0, insertAt),
        ...newTiers,
        ...patchedTiers.slice(insertAt),
      ];

      console.log(`[TSM] Migrated config: added ${newTiers.length} new tier(s): ${newTiers.map(t => t.id).join(", ")}`);
    } else {
      finalTiers = patchedTiers;
    }

    // Reorder tiers to match default evaluation order.
    // Tiers that exist in defaults are sorted to match default order;
    // any user-added custom tiers (not in defaults) are appended at the end
    // before the fallback tier.
    const defaultOrder = defaults.serialTiers.map(t => t.id);
    const knownTiers = finalTiers.filter(t => defaultOrder.includes(t.id));
    const customTiers = finalTiers.filter(t => !defaultOrder.includes(t.id));

    knownTiers.sort((a, b) => defaultOrder.indexOf(a.id) - defaultOrder.indexOf(b.id));

    // Insert custom tiers before the fallback (last known tier)
    const fallbackIdx = knownTiers.findIndex(t => t.type === "fallback");
    if (fallbackIdx >= 0 && customTiers.length > 0) {
      knownTiers.splice(fallbackIdx, 0, ...customTiers);
    } else {
      knownTiers.push(...customTiers);
    }

    merged.serialTiers = knownTiers;
  }

  // Ensure display and advanced sections have all keys
  merged.display = { ...defaults.display, ...(saved.display || {}) };
  merged.advanced = { ...defaults.advanced, ...(saved.advanced || {}) };

  return merged;
}

// ── Badge Detection ──────────────────────────────────────────────
/**
 * Top Shot badge icons may be rendered as:
 * - <img> with alt text
 * - <svg> with <title> child
 * - Small elements with aria-label
 * - Elements with specific data attributes
 * - Small colored circles/icons near the serial number
 *
 * Since the exact markup is hard to predict, we also do a broad scan
 * for any small image-like elements near where we detect the serial.
 */
const BADGE_SELECTORS = {
  first_serial: [
    'img[alt="#1 Serial"]',
    'img[alt*="#1 Serial" i]',
    'img[alt*="first" i]', 'img[alt*="#1"]',
    'svg title',
    '[class*="FirstSerial"]', '[class*="first-serial"]',
    '[data-testid*="first-serial"]', '[data-testid*="first_serial"]',
    '[aria-label*="#1 Serial" i]', '[aria-label*="first serial" i]',
    'img[src*="first"]', 'img[src*="serial-1"]',
  ],
  jersey_number: [
    'img[alt="Jersey Number"]',
    'img[alt*="Jersey Number" i]',
    'img[alt*="jersey" i]',
    '[class*="JerseyNumber"]', '[class*="jersey-number"]',
    '[data-testid*="jersey"]', '[aria-label*="jersey" i]',
    'img[src*="jersey"]',
  ],
  perfect_mint: [
    'img[alt="Original Perfect Mint Serial"]',
    'img[alt*="Perfect Mint" i]',
    'img[alt*="perfect" i]', 'img[alt*="last serial" i]',
    '[class*="PerfectMint"]', '[class*="perfect-mint"]',
    '[data-testid*="perfect"]',
    '[aria-label*="perfect" i]', '[aria-label*="Perfect Mint" i]',
    'img[src*="perfect"]',
  ],
  nba75: [
    'img[alt*="diamond" i]', 'img[alt*="75" i]',
    '[class*="Diamond"]', '[class*="diamond"]', '[class*="nba75"]',
    '[data-testid*="nba75"]', '[data-testid*="diamond"]',
    '[aria-label*="diamond" i]', '[aria-label*="#75" i]',
    'img[src*="diamond"]', 'img[src*="nba75"]',
  ],
};

/**
 * Check SVG <title> elements for badge keywords.
 * Top Shot may render badges as SVGs with a <title> for accessibility.
 */
const BADGE_KEYWORDS = {
  first_serial: ["#1 serial", "first serial", "serial 1", "first mint"],
  jersey_number: ["jersey number", "jersey", "shirt number", "jersey match"],
  perfect_mint: ["original perfect mint serial", "perfect mint", "perfect", "last serial", "full count"],
  nba75: ["diamond", "nba75", "#75", "75th"],
};

/**
 * SVG Path Fingerprints — Top Shot renders badge icons as inline SVGs
 * with NO alt text, aria-label, or title. The only way to identify them
 * is by the SVG <path> `d` attribute, which is unique to each icon shape.
 *
 * These are extracted from the actual Top Shot DOM.
 * If Top Shot changes their icon SVGs, these need updating.
 */
const BADGE_SVG_PATHS = {
  // Jersey/shirt icon — the path from the actual DOM
  jersey_number: [
    "M7 7a3 3 0 0 1-3 3v8h16v-8a3 3 0 0 1-3-3V2h-2a3 3 0 1 1-6 0H7zm13 13H4v2h16z",
  ],
  // Add other badge SVG paths here as they're discovered.
  // To find them: inspect the SVG next to a badged serial, copy the <path d="..."> value.
  first_serial: [],
  perfect_mint: [],
  nba75: [],
};

function detectBadges(container) {
  const detected = [];

  for (const [badgeType, selectors] of Object.entries(BADGE_SELECTORS)) {
    let found = false;

    // ── Method 1: CSS selectors (img alt, data-testid, aria-label, etc.) ──
    for (const selector of selectors) {
      if (found) break;
      try {
        if (selector === "svg title") {
          const titles = container.querySelectorAll("svg title");
          for (const title of titles) {
            const titleText = (title.textContent || "").toLowerCase();
            const keywords = BADGE_KEYWORDS[badgeType] || [];
            if (keywords.some(kw => titleText.includes(kw))) {
              found = true;
              break;
            }
          }
        } else if (container.querySelector(selector)) {
          found = true;
        }
      } catch (e) {}
    }

    // ── Method 2: Keyword scan on images near serial number ──
    // Only check img/svg elements adjacent to the serial link to avoid
    // matching badge images from the moment detail card or other rows.
    if (!found) {
      const keywords = BADGE_KEYWORDS[badgeType] || [];
      const serialLink = container.querySelector('a[href*="/moment/"]');
      const searchScope = serialLink?.parentElement || container;
      const nearbyImages = searchScope.querySelectorAll("img, svg, [role='img']");
      for (const img of nearbyImages) {
        const src = (img.getAttribute("src") || "").toLowerCase();
        const alt = (img.getAttribute("alt") || "").toLowerCase();
        const ariaLabel = (img.getAttribute("aria-label") || "").toLowerCase();
        const title = (img.querySelector("title")?.textContent || "").toLowerCase();
        const combined = `${src} ${alt} ${ariaLabel} ${title}`;

        if (keywords.some(kw => combined.includes(kw))) {
          found = true;
          break;
        }
      }
    }

    // ── Method 3: SVG path fingerprinting ──
    // Match badge SVGs by their unique <path d="..."> attribute.
    // IMPORTANT: Only check SVGs that are adjacent to the serial number,
    // not checkboxes or other UI SVGs elsewhere in the row.
    // The badge SVG lives inside a container next to the serial <a> link:
    //   <p> <a href="/moment/...">#77</a> <div><svg>BADGE</svg></div> </p>
    if (!found) {
      const pathFingerprints = BADGE_SVG_PATHS[badgeType] || [];
      if (pathFingerprints.length > 0) {
        // Find the serial number link, then look for SVGs near it
        const serialLink = container.querySelector('a[href*="/moment/"]');
        if (serialLink) {
          // Check siblings and parent's other children for badge SVGs
          const serialParent = serialLink.parentElement;
          if (serialParent) {
            const nearbyPaths = serialParent.querySelectorAll("svg path");
            for (const pathEl of nearbyPaths) {
              const d = pathEl.getAttribute("d") || "";
              if (pathFingerprints.some(fp => d === fp)) {
                found = true;
                break;
              }
            }
          }
        }
      }
    }

    if (found) detected.push(badgeType);
  }

  return detected;
}

// ── Multiplier Engine ────────────────────────────────────────────

/**
 * Check if a serial number matches a narrative values list.
 * Supports both legacy format (plain numbers: [23, 24, 33])
 * and new format (objects: [{ value: 23, emoji: "🐐" }]).
 * Returns the matched entry (with emoji) or null.
 */
function narrativeMatch(values, serialNumber) {
  for (const entry of values) {
    if (typeof entry === "number") {
      if (entry === serialNumber) return { value: entry, emoji: "" };
    } else if (entry && entry.value === serialNumber) {
      return entry;
    }
  }
  return null;
}

function matchSerialTier(serialNumber, editionSize, detectedBadges, tiers) {
  let bestBadgeTier = null;
  for (const tier of tiers) {
    if (!tier.enabled) continue;
    if (tier.type !== "badge_detect") continue;
    if (detectedBadges.includes(tier.badgeType)) {
      if (!bestBadgeTier || tier.multiplier > bestBadgeTier.multiplier) {
        bestBadgeTier = tier;
      }
    }
  }
  if (bestBadgeTier) return bestBadgeTier;

  for (const tier of tiers) {
    if (!tier.enabled) continue;

    // Skip this tier if the edition is too small for it to be meaningful
    if (tier.minEditionSize && editionSize < 99999 && editionSize < tier.minEditionSize) continue;

    switch (tier.type) {
      case "badge_detect": continue;
      case "absolute":
        if (serialNumber >= tier.min && serialNumber <= tier.max) return tier;
        break;
      case "last_serial":
        // Perfect mint fallback: serial equals edition size
        if (editionSize < 99999 && serialNumber === editionSize) return tier;
        break;
      case "percentage":
        const threshold = Math.max(1, Math.ceil(editionSize * (tier.maxPercent / 100)));
        if (serialNumber <= threshold) return tier;
        break;
      case "list":
        if (tier.values) {
          const match = narrativeMatch(tier.values, serialNumber);
          if (match) {
            // Attach the matched emoji to the tier result for rendering
            return { ...tier, _matchedEmoji: match.emoji || "" };
          }
        }
        break;
      case "fallback":
        return tier;
    }
  }
  return { id: "unknown", label: "Unknown", multiplier: 1.0, color: "#95A5A6" };
}

function computeValuation(serialNumber, editionSize, detectedBadges, baselinePrice, askPrice) {
  const tier = matchSerialTier(serialNumber, editionSize, detectedBadges, config.serialTiers);
  const estimatedValue = baselinePrice * tier.multiplier;
  let deltaPercent = null;
  if (askPrice && askPrice > 0) {
    deltaPercent = ((estimatedValue - askPrice) / askPrice) * 100;
  }
  return {
    tier,
    multiplier: tier.multiplier,
    estimatedValue: Math.round(estimatedValue * 100) / 100,
    deltaPercent: deltaPercent !== null ? Math.round(deltaPercent * 10) / 10 : null,
    detectedBadges,
    narrativeEmoji: tier._matchedEmoji || "",
  };
}

// ── DOM Scanning ─────────────────────────────────────────────────
/**
 * Multi-strategy scanning:
 * 1. Extract edition size from page context (header/dropdown)
 * 2. Virtualized list rows inside [data-testid="scrollable-listings"]
 * 3. Any link pointing to /listing/ or /moment/ URLs
 */

// Page-level edition size — extracted once from the header area
let pageEditionSize = 99999;

function extractPageEditionSize() {
  // The page header shows edition info like "BLOCKCHAIN /99", "HEXWAVE /25",
  // "Common #/99", "/15000", etc.
  // Look in the area above the listing table
  const headerArea = document.querySelector("main") || document.body;
  const text = headerArea.textContent || "";

  // Pattern: "/99" or "/ 99" or "#/99" (the edition denominator shown in headers)
  // Match the FIRST /N pattern that appears before the listing rows
  const patterns = [
    /(?:Common|Rare|Legendary|Fandom|Ultimate|Holo|Metallic)\s*(?:#\s*)?\/\s*([\d,]+)/i,
    /\/\s*([\d,]+)\s*(?:edition|LE|CC)?/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const size = parseInt(match[1].replace(/,/g, ""), 10);
      if (size > 0 && size < 100000) {
        return size;
      }
    }
  }

  // Also check dropdown/select elements for edition info
  const selects = document.querySelectorAll("select, button, [role='listbox'], [role='combobox']");
  for (const el of selects) {
    const elText = el.textContent || "";
    const match = elText.match(/\/\s*([\d,]+)/);
    if (match) {
      const size = parseInt(match[1].replace(/,/g, ""), 10);
      if (size > 0 && size < 100000) return size;
    }
  }

  // Look for "N AVAILABLE" near edition info
  // Also look for the moment detail card area on the right side
  const detailText = text.substring(0, 2000); // first chunk of page
  const availMatch = detailText.match(/(\d+)\s+AVAILABLE/i);
  // Not directly edition size but useful context

  return 99999;
}

function scanAndAnnotate() {
  if (!config) return;

  // Extract edition size from page context
  pageEditionSize = extractPageEditionSize();
  log(`Page edition size: ${pageEditionSize}`);

  // ── Collect all visible listing rows ──
  const rowElements = collectListingRows();
  log(`Scan: found ${rowElements.length} listing row elements`);

  if (rowElements.length === 0) return;

  // ── First pass: parse all rows, classify tiers, find baseline ──
  const parsedRows = [];
  for (const row of rowElements) {
    const text = row.textContent || "";
    if (text.length < 5 || text.length > 1000) continue;
    if (row.getAttribute("data-testid") === "scrollable-listings") continue;
    if (row.querySelector('[data-testid="scrollable-listings"]')) continue;
    if (row.tagName === "NAV" || row.tagName === "HEADER" || row.tagName === "FOOTER") continue;

    const parsed = parseListingText(text);
    if (!parsed) continue;

    const { serial, edition: rowEdition, askPrice } = parsed;
    const edition = (rowEdition < 99999) ? rowEdition : pageEditionSize;

    // Detect badges — only scan within the row itself
    // (parent scan was removed: it would match badges from sibling rows
    // or the moment detail card, causing false positives)
    const detectedBadges = detectBadges(row);

    // Classify tier (without valuation yet — just need to know if it's "random")
    const tier = matchSerialTier(serial, edition, detectedBadges, config.serialTiers);

    parsedRows.push({
      row,
      serial,
      edition,
      askPrice,
      detectedBadges,
      tier,
      text,
    });
  }

  // ── Determine baseline price ──
  // The baseline is the lowest ask price among "random" (1.0x) tier listings.
  // This represents the floor price for an unremarkable serial —
  // the price someone would pay for the moment itself, without serial premium.
  // If no random serials are listed, fall back to the overall lowest ask.
  const baselinePrice = computeBaselinePrice(parsedRows);
  log(`Baseline price: $${baselinePrice.toFixed(2)} (from ${parsedRows.length} listings)`);

  // ── Second pass: compute valuations and inject badges ──
  for (const { row, serial, edition, askPrice, detectedBadges, text } of parsedRows) {
    const fingerprint = text.substring(0, 200).trim();

    // Handle recycled rows
    const existingBadge = row.querySelector(".tsm-badge");
    if (existingBadge) {
      if (row.getAttribute("data-tsm-fp") === fingerprint) continue;
      existingBadge.remove();
    }
    if (!existingBadge && row.getAttribute("data-tsm-fp") === fingerprint) continue;

    const valuation = computeValuation(serial, edition, detectedBadges, baselinePrice, askPrice);

    log(`Row: #${serial}/${edition} @ $${askPrice} | baseline: $${baselinePrice} | ${valuation.tier.label} ${valuation.multiplier}x → $${valuation.estimatedValue} (${valuation.deltaPercent !== null ? valuation.deltaPercent + '%' : 'n/a'})`);

    injectBadge(row, valuation);
    row.setAttribute("data-tsm-annotated", "1");
    row.setAttribute("data-tsm-fp", fingerprint);
  }
}

/**
 * Collect all listing row DOM elements from the page.
 */
function collectListingRows() {
  const rows = [];

  // Strategy 1: Virtualized listing rows
  const scrollContainer = document.querySelector('[data-testid="scrollable-listings"]');
  if (scrollContainer) {
    const indexedRows = scrollContainer.querySelectorAll('[index]');
    if (indexedRows.length > 0) {
      rows.push(...indexedRows);
    } else {
      const divRows = scrollContainer.querySelectorAll(':scope > div > div > div[style*="position: absolute"]');
      rows.push(...divRows);
    }
  }

  // Strategy 2: Links to /listing/ or /moment/ pages
  const momentLinks = document.querySelectorAll('a[href*="/listing/"], a[href*="/moment/"]');
  for (const link of momentLinks) {
    if (!link.closest("[data-tsm-annotated]") && !rows.includes(link)) {
      rows.push(link);
    }
  }

  return rows;
}

/**
 * Compute the baseline price from visible listings.
 *
 * Strategy: find the lowest ask price among listings classified as
 * "random" tier (1.0x multiplier) — these are the unremarkable serials
 * whose price reflects the moment's intrinsic value without serial premium.
 *
 * Fallbacks:
 * 1. Lowest random-tier ask price (ideal — true floor)
 * 2. Lowest overall ask price (if no random serials visible)
 * 3. $1.00 (if no prices found at all)
 */
function computeBaselinePrice(parsedRows) {
  const randomPrices = [];
  const allPrices = [];

  for (const { askPrice, tier } of parsedRows) {
    if (askPrice && askPrice > 0) {
      allPrices.push(askPrice);
      // "Random" tier = fallback tier with 1.0x multiplier
      if (tier.type === "fallback" || tier.multiplier === 1.0) {
        randomPrices.push(askPrice);
      }
    }
  }

  if (randomPrices.length > 0) {
    return Math.min(...randomPrices);
  }

  if (allPrices.length > 0) {
    return Math.min(...allPrices);
  }

  return 1.0;
}

/**
 * Parse serial, edition, and price from the text content of a listing row.
 *
 * Top Shot formats vary but typically include:
 * - A price like "$5" or "$1,234"
 * - Numbers that could be serial/edition in various formats:
 *   "72 / 1000", "#72 / 1000", "72/1000", just "72"
 * - Edition might be in a separate element or not visible in list view
 *
 * The text of a typical listing row might look like:
 * "Player Name Play Type $5 #72 LE 1000" or similar
 */
function parseListingText(text) {
  // Extract price
  const priceMatch = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  const askPrice = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null;

  // Try various serial/edition patterns
  let serial = null;
  let edition = 99999;

  // Pattern 1: "#72 / 1000" or "72 / 1000" or "#72/1000"
  const slashPattern = text.match(/(?:#\s*)?(\d+)\s*\/\s*([\d,]+)/);
  if (slashPattern) {
    serial = parseInt(slashPattern[1], 10);
    edition = parseInt(slashPattern[2].replace(/,/g, ""), 10);
  }

  // Pattern 2: "#72" standalone (no slash)
  if (serial === null) {
    const hashPattern = text.match(/#(\d+)/);
    if (hashPattern) {
      serial = parseInt(hashPattern[1], 10);
    }
  }

  // Pattern 3: Look for "LE NNNN" or "CC NNNN" for edition size
  if (edition === 99999) {
    const lePattern = text.match(/(?:LE|CC|Edition|Mint)\s*([\d,]+)/i);
    if (lePattern) {
      edition = parseInt(lePattern[1].replace(/,/g, ""), 10);
    }
  }

  // Pattern 4: Look for "/NNNN" anywhere (edition after slash)
  if (edition === 99999) {
    const slashOnly = text.match(/\/\s*([\d,]+)/);
    if (slashOnly) {
      edition = parseInt(slashOnly[1].replace(/,/g, ""), 10);
    }
  }

  if (serial === null) return null;

  return { serial, edition, askPrice };
}

// ── Badge Rendering ──────────────────────────────────────────────
function injectBadge(row, valuation) {
  const badge = document.createElement("div");
  const position = config?.display?.overlayPosition || "top-right";
  badge.className = `tsm-badge tsm-badge--${position}`;

  const parts = [];

  if (config.display.showMultiplier && valuation.multiplier !== 1.0) {
    parts.push(`<span class="tsm-multiplier" style="background:${valuation.tier.color}">${valuation.multiplier}x</span>`);
  }

  // Show narrative emoji if this is a narrative number match
  if (valuation.narrativeEmoji) {
    parts.push(`<span class="tsm-badge-icon">${valuation.narrativeEmoji}</span>`);
  }

  if (valuation.detectedBadges && valuation.detectedBadges.length > 0 && valuation.multiplier > 1.0) {
    const badgeIcons = { first_serial: "①", jersey_number: "🏀", perfect_mint: "⬡", nba75: "◇" };
    const icons = valuation.detectedBadges.map(b => badgeIcons[b] || "").filter(Boolean).join("");
    if (icons) parts.push(`<span class="tsm-badge-icon">${icons}</span>`);
  }

  if (config.display.showEstimatedValue && valuation.estimatedValue > 0) {
    parts.push(`<span class="tsm-est-value">$${valuation.estimatedValue.toFixed(2)}</span>`);
  }

  if (config.display.showDeltaToAsk && valuation.deltaPercent !== null) {
    const sign = valuation.deltaPercent >= 0 ? "+" : "";
    const cls = valuation.deltaPercent > 10 ? "tsm-underpriced" :
                valuation.deltaPercent < -10 ? "tsm-overpriced" : "tsm-fair";
    parts.push(`<span class="tsm-delta ${cls}">${sign}${valuation.deltaPercent.toFixed(1)}%</span>`);
  }

  if (parts.length === 0) {
    parts.push(`<span class="tsm-tier-label" style="color:${valuation.tier.color}">${valuation.tier.label}</span>`);
  }

  badge.innerHTML = parts.join(" ");

  // Ensure the row can be a positioning context
  const currentPosition = window.getComputedStyle(row).position;
  if (currentPosition === "static") {
    row.style.position = "relative";
  }
  row.appendChild(badge);
}

// ── Re-process on config change ──────────────────────────────────
function reprocessAllCards() {
  document.querySelectorAll(".tsm-badge, .tsm-detail-badge").forEach(el => el.remove());
  document.querySelectorAll("[data-tsm-annotated]").forEach(el => {
    el.removeAttribute("data-tsm-annotated");
    el.removeAttribute("data-tsm-fp");
  });
  annotatedFingerprints.clear();
  scanAndAnnotate();
}

// ── DOM Observer ─────────────────────────────────────────────────
function observeDOM() {
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0 || mutation.type === "attributes") {
        shouldScan = true;
        break;
      }
    }
    if (shouldScan) {
      clearTimeout(observeDOM._timeout);
      observeDOM._timeout = setTimeout(scanAndAnnotate, 300);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style"], // catch virtualized list repositioning
  });
}

// ── GraphQL Interception Listener ────────────────────────────────
function listenForGraphQLResponses() {
  window.addEventListener("message", (event) => {
    if (event.data?.type === "TSM_GRAPHQL_RESPONSE") {
      handleGraphQLResponse(event.data);
    }
  });
}

function handleGraphQLResponse(message) {
  const { data } = message;
  if (!data) return;
  try {
    if (data?.data?.searchMomentListings?.momentListings) {
      for (const listing of data.data.searchMomentListings.momentListings) {
        cacheMomentData(listing);
      }
    }
    if (data?.data?.getMintedMoment) {
      cacheMomentData(data.data.getMintedMoment);
    }
    setTimeout(scanAndAnnotate, 200);
  } catch (e) {
    log("Error parsing GraphQL response:", e);
  }
}

function cacheMomentData(momentData) {
  try {
    const moment = momentData?.moment || momentData;
    const id = moment?.id || moment?.flowID;
    if (id) {
      priceCache.set(id, {
        serial: moment?.flowSerialNumber,
        price: momentData?.price || moment?.price,
        editionSize: moment?.setPlay?.circulationCount,
        player: moment?.play?.stats?.playerName,
        tags: moment?.tags || momentData?.tags || [],
        timestamp: Date.now(),
      });
    }
  } catch (e) {
    log("Error caching moment data:", e);
  }
}

// ── Logging ──────────────────────────────────────────────────────
function log(...args) {
  if (config?.advanced?.debug) {
    console.log("[TSM]", ...args);
  }
}

// ── Start ────────────────────────────────────────────────────────
init();
