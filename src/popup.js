// Check if we're on a Top Shot page
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const url = tabs[0]?.url || "";
  const isTopShot = url.includes("nbatopshot.com");
  const dot = document.getElementById("statusDot");
  const label = document.getElementById("statusLabel");

  if (isTopShot) {
    dot.classList.remove("inactive");
    label.textContent = "Active on Top Shot";
  } else {
    dot.classList.add("inactive");
    label.textContent = "Navigate to nbatopshot.com";
  }
});

// Show version
chrome.runtime.sendMessage({ type: "TSM_GET_VERSION" }, (resp) => {
  if (resp?.version) {
    document.getElementById("version").textContent = `v${resp.version}`;
  }
});

// Load baseline config display
chrome.storage.local.get(["tsm_config"], (result) => {
  const config = result.tsm_config;
  if (config?.baselineSource) {
    const labels = {
      largest_edition: "Largest edition last sale",
      common: "Common parallel",
      fandom: "Fandom parallel",
      rare: "Rare parallel",
      legendary: "Legendary parallel",
    };
    const info = document.getElementById("baselineInfo");
    info.innerHTML = `<strong>Baseline:</strong> ${labels[config.baselineSource] || config.baselineSource}`;
  }
});

// Button handlers
document.getElementById("btnRefresh").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.reload(tabs[0].id);
    window.close();
  });
});

document.getElementById("btnSettings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
