export function downloadNamed(url, filename) {
  const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  const a = document.createElement("a");
  a.href = proxyUrl;
  // target="_blank" so a non-download error response from the proxy (bad
  // host, expired source URL) opens in a new tab instead of navigating the
  // whole app away.
  a.target = "_blank";
  a.rel = "noreferrer";
  a.click();
}

export function suggestFilename(prompt) {
  const slug = prompt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${slug || "seedance-video"}.mp4`;
}
