// Matches an outer shot label like "Shot 4b Yuna Reveals..." but not an inner
// "SHOT 2B: Yuna Approaches..." convention line — those always have a colon
// right after the shot number, which the negative lookahead excludes.
const SHOT_HEADER_RE = /^Shot\s*\d+[a-zA-Z]?(?!\s*:)\b.*$/im;

export function parseShotList(text) {
  const matches = [...text.matchAll(new RegExp(SHOT_HEADER_RE.source, "gim"))];
  if (matches.length === 0) return [];

  const shots = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const label = match[0].trim();
    const bodyStart = match.index + match[0].length;
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const prompt = text.slice(bodyStart, bodyEnd).trim();
    shots.push({ key: crypto.randomUUID(), label, prompt });
  }
  return shots;
}
