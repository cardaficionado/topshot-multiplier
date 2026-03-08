/**
 * TopShot Serial Multiples — Default Configuration
 *
 * Users can override all values via the extension options page.
 * These defaults reflect a conservative starting model based on
 * observed serial premium patterns in the Top Shot marketplace.
 */

export const DEFAULT_CONFIG = {
  // ── Baseline Settings ──────────────────────────────────────────
  // Which parallel/edition to use as the "floor" reference price.
  // Options: "largest_edition", "common", "fandom", "rare", "legendary"
  // "largest_edition" = last sale of the highest mint-count edition
  baselineSource: "largest_edition",

  // ── Serial Tier Definitions ────────────────────────────────────
  // Each tier defines a serial range (as fraction of mint count or
  // absolute value) and a multiplier applied to the baseline price.
  //
  // Ranges are evaluated top-down; first match wins.
  serialTiers: [
    // ── Badge-detected tiers ─────────────────────────────────
    // These leverage Top Shot's own badge icons in the DOM rather
    // than computing matches ourselves. More accurate, less fragile.
    {
      id: "serial_1",
      label: "#1 Serial",
      description: "The #1 of any edition (detected via Top Shot badge)",
      type: "badge_detect",
      badgeType: "first_serial",
      multiplier: 5.0,
      enabled: true,
      color: "#E5243B",          // red
    },
    {
      id: "jersey_match",
      label: "Jersey Match",
      description: "Serial matches player's jersey number (detected via Top Shot badge)",
      type: "badge_detect",
      badgeType: "jersey_number",
      multiplier: 4.0,
      enabled: true,
      color: "#FFD700",          // gold
    },
    {
      id: "perfect_mint",
      label: "Perfect Mint",
      description: "Last serial in edition, e.g. 15000/15000 (detected via Top Shot badge)",
      type: "badge_detect",
      badgeType: "perfect_mint",
      multiplier: 3.0,
      enabled: true,
      color: "#FF1493",          // deep pink
    },
    {
      id: "nba75_diamond",
      label: "#75 Diamond",
      description: "#75 serial from Series 3 / NBA 75th anniversary (detected via Top Shot badge)",
      type: "badge_detect",
      badgeType: "nba75",
      multiplier: 2.0,
      enabled: true,
      color: "#00CED1",          // dark turquoise
    },

    // ── Range-based tiers ────────────────────────────────────
    // Fallback for serials that don't carry a Top Shot badge.
    {
      id: "serial_1_range",
      label: "#1 Serial",
      description: "Fallback for #1 if Top Shot badge is not detected",
      type: "absolute",
      min: 1,
      max: 1,
      multiplier: 5.0,
      enabled: true,
      color: "#E5243B",          // red
    },
    {
      id: "perfect_mint_range",
      label: "Perfect Mint (range)",
      description: "Fallback: serial equals edition size",
      type: "last_serial",
      multiplier: 3.0,
      enabled: true,
      color: "#FF1493",          // deep pink
    },
    {
      id: "narrative",
      label: "Narrative Number",
      description: "Culturally significant numbers (e.g., 23, 24, 33, 42, 69, 100, 420, 666, 777)",
      type: "list",
      values: [
        { value: 23, emoji: "🐐" }, { value: 24, emoji: "🐍" },
        { value: 33, emoji: "🍀" }, { value: 42, emoji: "" },
        { value: 69, emoji: "🍆" }, { value: 100, emoji: "💯" },
        { value: 420, emoji: "🌲" }, { value: 666, emoji: "😈" },
        { value: 777, emoji: "🎲" }, { value: 1000, emoji: "🇰" },
      ],
      multiplier: 1.75,
      enabled: true,
      color: "#9B59B6",          // purple
    },
    {
      id: "single_digit",
      label: "Single Digit (2-9)",
      description: "Serials #2 through #9",
      type: "absolute",
      min: 2,
      max: 9,
      multiplier: 2.0,
      enabled: true,
      color: "#FF6B35",          // orange
    },
    {
      id: "low_serial",
      label: "Low Serial (10-25)",
      description: "Serials #10 through #25",
      type: "absolute",
      min: 10,
      max: 25,
      multiplier: 1.6,
      enabled: true,
      color: "#4ECDC4",          // teal
      minEditionSize: 99,
    },
    {
      id: "top_1_pct",
      label: "Top 1% Serial",
      description: "Serial falls in the top 1% of the edition size",
      type: "percentage",
      maxPercent: 1,
      multiplier: 1.2,
      enabled: true,
      color: "#7B68EE",          // medium slate blue
      minEditionSize: 99,
    },
    {
      id: "top_5_pct",
      label: "Top 5% Serial",
      description: "Serial falls in the top 5% of the edition size",
      type: "percentage",
      maxPercent: 5,
      multiplier: 1.1,
      enabled: true,
      color: "#45B7D1",          // sky blue
      minEditionSize: 99,
    },
    {
      id: "random",
      label: "Random Serial",
      description: "All other serials — valued at baseline",
      type: "fallback",
      multiplier: 1.0,
      enabled: true,
      color: "#95A5A6",          // gray
    },
  ],

  // ── Display Settings ───────────────────────────────────────────
  display: {
    showMultiplier: true,        // show "3.0x" badge
    showEstimatedValue: true,    // show "$XX.XX est."
    showDeltaToAsk: true,        // show "+/-XX%" vs current ask
    compactMode: false,          // smaller badges for dense views
    overlayPosition: "top-right" // where to anchor the badge on each card
  },

  // ── Parallel Definitions (for baseline switching) ──────────────
  parallels: [
    { id: "common",    label: "Common",    editionKeyword: "Common" },
    { id: "fandom",    label: "Fandom",    editionKeyword: "Fandom" },
    { id: "rare",      label: "Rare",      editionKeyword: "Rare" },
    { id: "legendary", label: "Legendary", editionKeyword: "Legendary" },
    { id: "ultimate",  label: "Ultimate",  editionKeyword: "Ultimate" },
  ],

  // ── Advanced ───────────────────────────────────────────────────
  advanced: {
    // How recent a sale must be to count as the baseline (in days).
    // If no sale within this window, show "stale baseline" indicator.
    baselineStaleDays: 30,
    // Cache TTL in minutes for fetched price data
    cacheTTLMinutes: 15,
    // Enable debug logging to console
    debug: false,
  }
};
