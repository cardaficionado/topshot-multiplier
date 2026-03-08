/**
 * TopShot Serial Multiples — Page-Context Fetch Interceptor
 *
 * This script runs in the MAIN world (the page's own JS context)
 * so it can monkey-patch window.fetch to intercept GraphQL responses.
 * It communicates back to the content script via window.postMessage.
 *
 * Registered in manifest.json with "world": "MAIN".
 */
(function () {
  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (url.includes("graphql") || url.includes("nbatopshot")) {
        const clone = response.clone();
        clone.json().then(data => {
          window.postMessage({
            type: "TSM_GRAPHQL_RESPONSE",
            url: url,
            data: data,
          }, "*");
        }).catch(() => {});
      }
    } catch (e) {}

    return response;
  };
})();
