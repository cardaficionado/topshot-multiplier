# TopShot Serial Multiples

A Chrome extension that overlays serial-based valuation multiples on [NBA Top Shot](https://nbatopshot.com) marketplace listings, helping collectors quickly identify underpriced and overpriced moments based on serial number characteristics.

## What It Does

When browsing the Top Shot marketplace, this extension:

- **Detects serial numbers** on listing pages
- **Classifies each serial** into a valuation tier (#1, Jersey Match, Low Serial, Narrative, Random, etc.)
- **Computes an estimated value** by applying a user-configurable multiplier to a baseline price
- **Shows the delta** between estimated value and ask price, color-coded as underpriced (green), fair (amber), or overpriced (red)

## Serial Tiers (Defaults)

The extension uses a **two-phase matching** system:

### Phase 1: Badge-Detected Tiers
Top Shot badges special serials with icons in the marketplace UI. The extension reads these badges directly from the DOM — including matching inline SVG icons by their path data — rather than trying to replicate Dapper's logic. This means jersey matches, #1 serials, and perfect mints are identified accurately without maintaining a separate player/jersey lookup table.

| Tier | Detection | Default Multiplier |
|---|---|---|
| #1 Serial | Top Shot "1" badge icon | 5.0x |
| Jersey Match | Top Shot jersey badge icon | 4.0x |
| Perfect Mint | Top Shot perfect mint badge (last serial) | 3.0x |
| #75 Diamond | Top Shot diamond badge (Series 3 NBA75) | 2.0x |

### Phase 2: Range-Based & Narrative Tiers
For serials that don't carry a Top Shot badge, the extension falls back to configurable rules evaluated in this order (first match wins):

| Tier | Rule | Default Multiplier | Notes |
|---|---|---|---|
| #1 Serial (range) | Serial #1 (fallback if badge not detected) | 5.0x | |
| Perfect Mint (range) | Serial equals edition size | 3.0x | |
| Narrative | Culturally significant numbers | 1.75x | With emoji: 🐐 23, 🐍 24, 🍀 33, 🍆 69, 💯 100, 🌲 420, 😈 666, 🎲 777, 🇰 1000 |
| Single Digit | Serials #2–9 | 2.0x | |
| Low Serial | Serials #10–25 | 1.6x | Skipped if edition < 99 |
| Top 1% | Serial ≤ 1% of edition size | 1.2x | Skipped if edition < 99 |
| Top 5% | Serial ≤ 5% of edition size | 1.1x | Skipped if edition < 99 |
| Random | Everything else | 1.0x | |

**Narrative numbers are evaluated before range-based tiers**, so #23 always gets the 🐐 narrative classification rather than being caught by "Low Serial."

**Low Serial, Top 1%, and Top 5% have a minimum edition size** (default: 99). These tiers are skipped for small editions where they lose meaning — for example, "Top 5%" on a /25 edition would cover the entire first serial, which is already handled by dedicated tiers. The threshold is configurable per-tier in settings.

**All multipliers are fully configurable.** The defaults are a starting point — adjust them based on your own market observations.

## Baseline Price

The baseline is the "1.0x" reference price that multipliers are applied against. Currently, the extension uses the **lowest ask price among random-tier (1.0x) serials** on the current listing page as the baseline. This represents what someone would pay for the moment itself without any serial premium.

For example, if the cheapest random serial is listed at $3.00:
- A single-digit serial (2.0x) would have an estimated value of $6.00
- A jersey match (4.0x) would have an estimated value of $12.00
- The delta shows how the actual ask compares to the model estimate

**Planned for a future update:** Cross-parallel baseline selection (e.g., using the Common floor as the baseline when viewing Rare listings) to identify arbitrage opportunities across parallels.

## Installation

### From Source (Developer Mode)

1. **Download or clone this repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/topshot-serial-multiples.git
   ```
   Or download the ZIP and extract it to a folder on your computer.

2. **Open Chrome's extension manager**
   - Navigate to `chrome://extensions/` in Chrome
   - Or go to **Menu (⋮) → Extensions → Manage Extensions**

3. **Enable Developer Mode**
   - Toggle the **Developer mode** switch in the top-right corner of the extensions page

4. **Load the extension**
   - Click **Load unpacked**
   - Select the `topshot-serial-multiples` folder (the one containing `manifest.json`)
   - The extension icon should appear in your Chrome toolbar

5. **Navigate to Top Shot**
   - Go to [nbatopshot.com](https://nbatopshot.com)
   - Browse to any listing page (click "Purchase" on a moment)
   - The extension activates automatically and overlays valuation badges on each listing row

### Updating

When a new version is available:
1. Pull the latest changes (`git pull`) or download the new ZIP
2. Go to `chrome://extensions/`
3. Click the **reload icon (↻)** on the TopShot Serial Multiples card
4. Reload any open Top Shot tabs

### Troubleshooting

- **No badges appearing?** Make sure you're on a listing detail page (click "Purchase" on a moment). The extension works on listing pages, not the marketplace search grid.
- **Badges showing wrong values?** Open the options page (click extension icon → Settings) and hit **Reset Defaults** to clear any stale config.
- **Console errors?** Open DevTools (F12) and look for `[TSM]` log lines. Enable **Debug logging** in Settings → Advanced for verbose output.

## Configuration

Click the extension icon → **Settings** to open the options page, where you can:

- Enable/disable individual tiers
- Adjust multiplier values
- Add or remove narrative numbers with custom emoji
- Set minimum edition size thresholds for Low Serial, Top 1%, and Top 5% tiers
- Change tier colors
- Toggle display elements (multiplier badge, estimated value, delta %)
- Export your config as JSON (for sharing or backup)

## Project Structure

```
topshot-serial-multiples/
├── manifest.json           # Chrome Extension Manifest V3
├── src/
│   ├── background.js       # Service worker (lifecycle, message routing)
│   ├── content.js          # Content script (DOM scanning, badge injection, baseline calc)
│   ├── content.css         # Badge and overlay styles
│   ├── interceptor.js      # MAIN world script for GraphQL fetch interception
│   ├── config.js           # Default configuration (ES module)
│   ├── engine.js           # Multiplier logic (pure functions)
│   ├── storage.js          # chrome.storage.local wrapper
│   ├── popup.html/js       # Extension icon popup
│   └── options.html/js     # Full settings page
├── icons/                  # Extension icons
├── LICENSE
└── README.md
```

## Current Status

**Phase 1 — Shipped** ✅
- Manifest V3 Chrome extension
- Two-phase serial tier matching (badge detection + range-based fallback)
- SVG path fingerprinting for badge icons without accessible text
- Narrative numbers with custom emoji (🐐 🐍 🍀 🍆 💯 🌲 😈 🎲 🇰)
- Minimum edition size thresholds (skip Low Serial/Top% on small editions)
- Page-level edition size extraction
- Lowest-random-serial baseline pricing
- Virtualized list support (recycled row handling)
- Config migration with property patching and tier reordering across updates
- Full options page with export
- Popup with status indicator

**Phase 2 — Planned**
- [ ] Cross-parallel baseline selection (Common/Fandom/Rare/Legendary)
- [ ] Live baseline price fetching via Top Shot GraphQL API
- [ ] Price cache with configurable TTL
- [ ] Marketplace search grid support (in addition to listing pages)

**Phase 3 — Future**
- [ ] Parallel serial detection (same serial across editions)
- [ ] Set-level collection analysis
- [ ] Historical price tracking per serial tier
- [ ] Community-shared multiplier presets

## Known Limitations

- **Works on listing detail pages.** The extension currently activates on "Purchase a Moment" pages with the virtualized listing table. The marketplace search grid view uses different markup that isn't fully supported yet.
- **DOM selectors can break.** Top Shot is a React SPA with hashed CSS class names (Chakra UI) that change between deploys. The extension uses `data-testid` attributes and structural patterns where possible, but some selectors may need updating after Top Shot UI changes.
- **Badge SVGs are matched by path data.** Top Shot renders badge icons as inline SVGs without accessible text. The extension identifies them by their unique `<path d="...">` values. If Top Shot changes the icon artwork, the fingerprints in `BADGE_SVG_PATHS` need updating.
- **Edition size comes from page context.** The extension extracts edition size from the page header (e.g., "STANDARD /1000"). If the header format changes, edition-dependent tiers (Top 1%, Top 5%, Perfect Mint range) may not work correctly.

## Contributing

Fork it, break it, make it better. The multiplier model is intentionally opinionated as a starting point — if your market thesis differs, adjust the defaults and share your config.

If you discover new badge SVG paths (for #1, perfect mint, or diamond icons in listing rows), add them to the `BADGE_SVG_PATHS` object in `content.js` and submit a PR.

Issues and PRs welcome.

## License

MIT
