/**
 * TopShot Serial Multiples — Multiplier Engine
 *
 * Pure functions for determining which tier a serial belongs to
 * and computing estimated values. No side effects, no DOM access.
 */

/**
 * Determine which serial tier applies to a given moment.
 *
 * Two-phase matching:
 * 1. BADGE PHASE: If Top Shot badges were detected on this listing,
 *    match against badge_detect tiers. Highest multiplier wins.
 * 2. RANGE PHASE: For unbadged serials, fall through to range-based
 *    tiers (absolute, percentage, list, fallback). First match wins.
 *
 * @param {number} serialNumber - The moment's serial number
 * @param {number} editionSize  - Total mints in this edition
 * @param {string[]} detectedBadges - Badge types found in the DOM (e.g. ["jersey_number"])
 * @param {Array} tiers - The user's configured serial tiers
 * @returns {object} The matched tier config object
 */
export function matchSerialTier(serialNumber, editionSize, detectedBadges, tiers) {
  // Phase 1: Badge-detected tiers — highest multiplier wins
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

  // Phase 2: Range-based tiers (first match wins)
  for (const tier of tiers) {
    if (!tier.enabled) continue;

    switch (tier.type) {
      case "badge_detect":
        continue; // already handled

      case "absolute":
        if (serialNumber >= tier.min && serialNumber <= tier.max) return tier;
        break;

      case "percentage":
        const threshold = Math.max(1, Math.ceil(editionSize * (tier.maxPercent / 100)));
        if (serialNumber <= threshold) return tier;
        break;

      case "list":
        if (tier.values && tier.values.includes(serialNumber)) return tier;
        break;

      case "fallback":
        return tier;

      default:
        break;
    }
  }

  // If somehow nothing matched (all disabled), return a neutral result
  return { id: "unknown", label: "Unknown", multiplier: 1.0, color: "#95A5A6" };
}

/**
 * Compute the estimated value and delta for a marketplace listing.
 *
 * @param {object} params
 * @param {number} params.serialNumber
 * @param {number} params.editionSize
 * @param {string[]} params.detectedBadges - Badge types from DOM detection
 * @param {number} params.baselinePrice  - The reference floor price
 * @param {number|null} params.askPrice  - Current listing price (if any)
 * @param {Array} params.tiers
 * @returns {object} { tier, multiplier, estimatedValue, deltaPercent, deltaAbsolute, detectedBadges }
 */
export function computeValuation({ serialNumber, editionSize, detectedBadges = [], baselinePrice, askPrice, tiers }) {
  const tier = matchSerialTier(serialNumber, editionSize, detectedBadges, tiers);
  const estimatedValue = baselinePrice * tier.multiplier;

  let deltaPercent = null;
  let deltaAbsolute = null;

  if (askPrice && askPrice > 0) {
    deltaAbsolute = estimatedValue - askPrice;
    deltaPercent = ((estimatedValue - askPrice) / askPrice) * 100;
  }

  return {
    tier,
    multiplier: tier.multiplier,
    estimatedValue: Math.round(estimatedValue * 100) / 100,
    deltaPercent: deltaPercent !== null ? Math.round(deltaPercent * 10) / 10 : null,
    deltaAbsolute: deltaAbsolute !== null ? Math.round(deltaAbsolute * 100) / 100 : null,
  };
}

/**
 * Format a dollar amount for display.
 */
export function formatPrice(value) {
  if (value === null || value === undefined) return "—";
  return `$${value.toFixed(2)}`;
}

/**
 * Format a delta percentage with sign and color hint.
 */
export function formatDelta(deltaPercent) {
  if (deltaPercent === null) return { text: "—", sentiment: "neutral" };
  const sign = deltaPercent >= 0 ? "+" : "";
  const sentiment = deltaPercent > 10 ? "underpriced" :
                    deltaPercent < -10 ? "overpriced" : "fair";
  return {
    text: `${sign}${deltaPercent.toFixed(1)}%`,
    sentiment,
  };
}
