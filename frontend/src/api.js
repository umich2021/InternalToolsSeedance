const BASE = "/api";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ? JSON.stringify(body.detail) : `Request failed (${res.status})`);
  }
  return res.json();
}

export async function generateVideo(payload) {
  const res = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function getTask(taskId) {
  const res = await fetch(`${BASE}/tasks/${taskId}`);
  return handle(res);
}

export async function getModels() {
  const res = await fetch(`${BASE}/models`);
  return handle(res);
}

export async function listReferenceImages() {
  const res = await fetch(`${BASE}/reference-images`);
  return handle(res);
}

export async function saveReferenceImage(file, name) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("name", name);
  const res = await fetch(`${BASE}/reference-images`, { method: "POST", body: formData });
  return handle(res);
}

export async function deleteReferenceImage(id) {
  const res = await fetch(`${BASE}/reference-images/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
}

export function referenceImageFileUrl(id) {
  return `${BASE}/reference-images/${id}/file`;
}

export async function listVideos() {
  const res = await fetch(`${BASE}/videos`);
  return handle(res);
}

export async function refreshVideoUrl(id) {
  const res = await fetch(`${BASE}/videos/${id}/url`);
  return handle(res);
}

export async function deleteVideo(id) {
  const res = await fetch(`${BASE}/videos/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
}
