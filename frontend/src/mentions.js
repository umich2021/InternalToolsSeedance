import { referenceImageFileUrl } from "./api.js";

export function fileToDataUri(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function urlToDataUri(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return fileToDataUri(blob);
}

export function resolveDataUri(item) {
  return item.source === "upload" ? fileToDataUri(item.file) : urlToDataUri(referenceImageFileUrl(item.savedImageId));
}

export function toSavedItem(img) {
  return { key: img.id, source: "saved", savedImageId: img.id, name: img.name, previewUrl: referenceImageFileUrl(img.id) };
}

export function mentionTag(name) {
  return name.replace(/\s+/g, "");
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMentionedImages(promptText, savedImages) {
  const mentioned = [];
  for (const img of savedImages) {
    const tag = mentionTag(img.name);
    if (!tag) continue;
    const re = new RegExp(`@${escapeRegExp(tag)}\\b`, "i");
    if (re.test(promptText)) mentioned.push(img);
  }
  return mentioned;
}
