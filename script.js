(() => {
  const params = new URLSearchParams(window.location.search);
  const assetId = params.get("assetId");

  const assetIdElement = document.getElementById("assetId");
  const statusElement = document.getElementById("status");

  if (assetId && assetId.trim()) {
    // textContent is intentionally used instead of innerHTML
    // so values coming from the URL are displayed as text.
    assetIdElement.textContent = assetId.trim();
    statusElement.textContent = "";
  } else {
    assetIdElement.textContent = "Not provided";
    statusElement.textContent =
      "Please provide an assetId parameter in the URL.";
  }
})();
