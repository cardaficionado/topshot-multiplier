  // ── Default Config ─────────────────────────────────────────
  const DEFAULT_CONFIG = {
    baselineSource: "largest_edition",
    serialTiers: [
      { id: "serial_1", label: "#1 Serial", description: "Detected via Top Shot badge", type: "badge_detect", badgeType: "first_serial", multiplier: 5.0, enabled: true, color: "#E5243B" },
      { id: "jersey_match", label: "Jersey Match", description: "Detected via Top Shot badge", type: "badge_detect", badgeType: "jersey_number", multiplier: 4.0, enabled: true, color: "#FFD700" },
      { id: "perfect_mint", label: "Perfect Mint", description: "Detected via Top Shot badge", type: "badge_detect", badgeType: "perfect_mint", multiplier: 3.0, enabled: true, color: "#FF1493" },
      { id: "nba75_diamond", label: "#75 Diamond", description: "Detected via Top Shot badge", type: "badge_detect", badgeType: "nba75", multiplier: 2.0, enabled: true, color: "#00CED1" },
      { id: "serial_1_range", label: "#1 Serial (range)", description: "Fallback for #1 if badge not detected", type: "absolute", min: 1, max: 1, multiplier: 5.0, enabled: true, color: "#E5243B" },
      { id: "perfect_mint_range", label: "Perfect Mint (range)", description: "Fallback: serial equals edition size", type: "last_serial", multiplier: 3.0, enabled: true, color: "#FF1493" },
      { id: "narrative", label: "Narrative Number", description: "Culturally significant numbers", type: "list", values: [
        { value: 23, emoji: "🐐" }, { value: 24, emoji: "🐍" }, { value: 33, emoji: "🍀" },
        { value: 42, emoji: "" }, { value: 69, emoji: "🍆" }, { value: 100, emoji: "💯" },
        { value: 420, emoji: "🌲" }, { value: 666, emoji: "😈" }, { value: 777, emoji: "🎲" },
        { value: 1000, emoji: "🇰" },
      ], multiplier: 1.75, enabled: true, color: "#9B59B6" },
      { id: "single_digit", label: "Single Digit (2-9)", description: "Serials #2 through #9", type: "absolute", min: 2, max: 9, multiplier: 2.0, enabled: true, color: "#FF6B35" },
      { id: "low_serial", label: "Low Serial (10-25)", description: "Serials #10 through #25", type: "absolute", min: 10, max: 25, multiplier: 1.6, enabled: true, color: "#4ECDC4", minEditionSize: 99 },
      { id: "top_1_pct", label: "Top 1% Serial", description: "Top 1% of edition size", type: "percentage", maxPercent: 1, multiplier: 1.2, enabled: true, color: "#7B68EE", minEditionSize: 99 },
      { id: "top_5_pct", label: "Top 5% Serial", description: "Top 5% of edition size", type: "percentage", maxPercent: 5, multiplier: 1.1, enabled: true, color: "#45B7D1", minEditionSize: 99 },
      { id: "random", label: "Random Serial", description: "All other serials", type: "fallback", multiplier: 1.0, enabled: true, color: "#95A5A6" },
    ],
    display: { showMultiplier: true, showEstimatedValue: true, showDeltaToAsk: true, compactMode: false },
    advanced: { baselineStaleDays: 30, cacheTTLMinutes: 15, debug: false },
  };

  let currentConfig = null;

  // ── Config Migration ──────────────────────────────────────────
  function migrateConfig(saved) {
    const merged = { ...DEFAULT_CONFIG, ...saved };
    if (saved.serialTiers && DEFAULT_CONFIG.serialTiers) {
      const defaultsById = new Map(DEFAULT_CONFIG.serialTiers.map(t => [t.id, t]));
      const savedIds = new Set(saved.serialTiers.map(t => t.id));

      // Patch missing properties onto existing saved tiers
      const patchedTiers = saved.serialTiers.map(savedTier => {
        const defaultTier = defaultsById.get(savedTier.id);
        if (defaultTier) {
          const patched = { ...defaultTier, ...savedTier };

          // Upgrade narrative plain number arrays to {value, emoji} objects
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
                  return { value: v, emoji: defaultEmojiMap.get(v) || "" };
                }
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

      // Add entirely new tiers
      const newTiers = DEFAULT_CONFIG.serialTiers.filter(t => !savedIds.has(t.id));
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
      } else {
        finalTiers = patchedTiers;
      }

      // Reorder to match default evaluation order
      const defaultOrder = DEFAULT_CONFIG.serialTiers.map(t => t.id);
      const knownTiers = finalTiers.filter(t => defaultOrder.includes(t.id));
      const customTiers = finalTiers.filter(t => !defaultOrder.includes(t.id));
      knownTiers.sort((a, b) => defaultOrder.indexOf(a.id) - defaultOrder.indexOf(b.id));
      const fallbackIdx = knownTiers.findIndex(t => t.type === "fallback");
      if (fallbackIdx >= 0 && customTiers.length > 0) {
        knownTiers.splice(fallbackIdx, 0, ...customTiers);
      } else {
        knownTiers.push(...customTiers);
      }
      merged.serialTiers = knownTiers;
    }
    merged.display = { ...DEFAULT_CONFIG.display, ...(saved.display || {}) };
    merged.advanced = { ...DEFAULT_CONFIG.advanced, ...(saved.advanced || {}) };
    return merged;
  }

  // ── Load ────────────────────────────────────────────────────
  async function loadConfig() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(["tsm_config"], (result) => {
          if (chrome.runtime.lastError) {
            resolve(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
            return;
          }
          const saved = result.tsm_config;
          if (!saved) {
            resolve(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
            return;
          }
          resolve(migrateConfig(saved));
        });
      } catch (e) {
        resolve(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
      }
    });
  }

  async function saveConfig(config) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set({ tsm_config: config }, () => {
          if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
          else resolve();
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // ── Render ─────────────────────────────────────────────────
  function renderAll() {
    renderBaseline();
    renderTiers();
    renderDisplay();
    renderAdvanced();
  }

  function renderBaseline() {
    document.querySelectorAll(".baseline-option").forEach(el => {
      el.classList.toggle("active", el.dataset.value === currentConfig.baselineSource);
    });
  }

  function renderTiers() {
    const tbody = document.getElementById("tierTableBody");
    tbody.innerHTML = "";

    currentConfig.serialTiers.forEach((tier, idx) => {
      const tr = document.createElement("tr");
      tr.className = `tier-row ${tier.enabled ? "" : "disabled"}`;

      let rangeText = "";
      switch (tier.type) {
        case "badge_detect": rangeText = `🏷 TS badge: ${(tier.badgeType || "").replace(/_/g, " ")}`; break;
        case "absolute": rangeText = `#${tier.min}${tier.max > tier.min ? ` – #${tier.max}` : ""}`; break;
        case "last_serial": rangeText = "Serial = edition size"; break;
        case "percentage": rangeText = `Top ${tier.maxPercent}% of edition`; break;
        case "list": rangeText = `${tier.values?.length || 0} numbers`; break;
        case "fallback": rangeText = "Everything else"; break;
      }

      // Show minEditionSize input for tiers that support it
      const minEdField = tier.minEditionSize !== undefined
        ? `<div style="margin-top:4px;"><span style="font-size:10px;color:var(--text-muted);">Min edition:</span>
           <input type="number" data-tier-idx="${idx}" data-field="minEditionSize"
                  value="${tier.minEditionSize}" min="1" max="99999" step="1"
                  style="width:60px;font-size:11px;"></div>`
        : "";

      tr.innerHTML = `
        <td>
          <label class="toggle">
            <input type="checkbox" data-tier-idx="${idx}" data-field="enabled" ${tier.enabled ? "checked" : ""}>
            <span class="toggle-track"></span>
            <span class="toggle-thumb"></span>
          </label>
        </td>
        <td>
          <span class="tier-color-dot" style="background:${tier.color}"></span>
          <span class="tier-label">${tier.label}</span>
          <div class="tier-desc">${tier.description || ""}</div>
        </td>
        <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary);">
          ${rangeText}${minEdField}
        </td>
        <td>
          <input type="number" data-tier-idx="${idx}" data-field="multiplier"
                 value="${tier.multiplier}" min="0.1" max="100" step="0.1">
        </td>
        <td>
          <input type="color" data-tier-idx="${idx}" data-field="color"
                 value="${tier.color}" style="width:28px;height:28px;border:none;background:none;cursor:pointer;">
        </td>
      `;
      tbody.appendChild(tr);
    });

    const narrativeTier = currentConfig.serialTiers.find(t => t.type === "list");
    const editor = document.getElementById("narrativeEditor");
    if (narrativeTier) {
      editor.style.display = "block";
      renderNarrativeTags(narrativeTier.values || []);
    } else {
      editor.style.display = "none";
    }
  }

  function renderNarrativeTags(values) {
    const container = document.getElementById("narrativeTags");
    // Normalize: support both plain numbers and {value, emoji} objects
    const normalized = values.map(v => typeof v === "number" ? { value: v, emoji: "" } : v);
    container.innerHTML = normalized
      .sort((a, b) => a.value - b.value)
      .map(v => `<span class="narrative-tag">${v.emoji ? v.emoji + ' ' : ''}#${v.value}<span class="remove" data-value="${v.value}">×</span></span>`)
      .join("");
  }

  function renderDisplay() {
    document.getElementById("dispMultiplier").checked = currentConfig.display.showMultiplier;
    document.getElementById("dispEstValue").checked = currentConfig.display.showEstimatedValue;
    document.getElementById("dispDelta").checked = currentConfig.display.showDeltaToAsk;
    document.getElementById("dispCompact").checked = currentConfig.display.compactMode;
  }

  function renderAdvanced() {
    document.getElementById("advStaleDays").value = currentConfig.advanced.baselineStaleDays;
    document.getElementById("advCacheTTL").value = currentConfig.advanced.cacheTTLMinutes;
    document.getElementById("advDebug").checked = currentConfig.advanced.debug;
  }

  // ── Event Handlers ─────────────────────────────────────────
  document.getElementById("baselineOptions").addEventListener("click", (e) => {
    const option = e.target.closest(".baseline-option");
    if (!option) return;
    currentConfig.baselineSource = option.dataset.value;
    renderBaseline();
  });

  document.getElementById("tierTableBody").addEventListener("change", (e) => {
    const input = e.target;
    const idx = parseInt(input.dataset.tierIdx, 10);
    const field = input.dataset.field;
    if (isNaN(idx) || !field) return;
    if (field === "enabled") {
      currentConfig.serialTiers[idx].enabled = input.checked;
      renderTiers();
    } else if (field === "multiplier") {
      currentConfig.serialTiers[idx].multiplier = parseFloat(input.value) || 1.0;
    } else if (field === "color") {
      currentConfig.serialTiers[idx].color = input.value;
    } else if (field === "minEditionSize") {
      currentConfig.serialTiers[idx].minEditionSize = parseInt(input.value, 10) || 99;
    }
  });

  document.getElementById("narrativeTags").addEventListener("click", (e) => {
    if (!e.target.classList.contains("remove")) return;
    const val = parseInt(e.target.dataset.value, 10);
    const tier = currentConfig.serialTiers.find(t => t.type === "list");
    if (tier) {
      tier.values = tier.values.filter(v =>
        (typeof v === "number" ? v : v.value) !== val
      );
      renderNarrativeTags(tier.values);
    }
  });

  document.getElementById("addNarrativeBtn").addEventListener("click", () => {
    const numInput = document.getElementById("addNarrativeInput");
    const emojiInput = document.getElementById("addNarrativeEmoji");
    const val = parseInt(numInput.value, 10);
    if (!val || val < 1) return;
    const emoji = emojiInput ? emojiInput.value.trim() : "";

    const tier = currentConfig.serialTiers.find(t => t.type === "list");
    if (tier) {
      // Check for duplicates
      const exists = tier.values.some(v =>
        (typeof v === "number" ? v : v.value) === val
      );
      if (!exists) {
        tier.values.push({ value: val, emoji: emoji });
        renderNarrativeTags(tier.values);
      }
    }
    numInput.value = "";
    if (emojiInput) emojiInput.value = "";
  });

  ["dispMultiplier", "dispEstValue", "dispDelta", "dispCompact"].forEach(id => {
    document.getElementById(id).addEventListener("change", (e) => {
      const map = { dispMultiplier: "showMultiplier", dispEstValue: "showEstimatedValue", dispDelta: "showDeltaToAsk", dispCompact: "compactMode" };
      currentConfig.display[map[id]] = e.target.checked;
    });
  });

  document.getElementById("advStaleDays").addEventListener("change", (e) => {
    currentConfig.advanced.baselineStaleDays = parseInt(e.target.value, 10) || 30;
  });
  document.getElementById("advCacheTTL").addEventListener("change", (e) => {
    currentConfig.advanced.cacheTTLMinutes = parseInt(e.target.value, 10) || 15;
  });
  document.getElementById("advDebug").addEventListener("change", (e) => {
    currentConfig.advanced.debug = e.target.checked;
  });

  // ── Footer Buttons ─────────────────────────────────────────
  document.getElementById("btnSave").addEventListener("click", async () => {
    try {
      await saveConfig(currentConfig);
      showToast("Settings saved", "success");
    } catch (e) {
      showToast("Failed to save: " + e.message, "error");
    }
  });

  document.getElementById("btnReset").addEventListener("click", async () => {
    if (!confirm("Reset all settings to defaults? This cannot be undone.")) return;
    currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    renderAll();
    await saveConfig(currentConfig);
    showToast("Reset to defaults", "success");
  });

  document.getElementById("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(currentConfig, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "topshot-serial-multiples-config.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Config exported", "success");
  });

  // ── Toast ──────────────────────────────────────────────────
  function showToast(message, type = "success") {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.className = `toast ${type} visible`;
    setTimeout(() => toast.classList.remove("visible"), 2500);
  }

  // ── Init ───────────────────────────────────────────────────
  (async () => {
    try {
      currentConfig = await loadConfig();
      renderAll();
      console.log("[TSM] Options page loaded.");
    } catch (e) {
      console.error("[TSM] Failed to initialize options:", e);
      currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      renderAll();
      showToast("Could not load saved settings — using defaults", "error");
    }
  })();
