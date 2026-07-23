import { useEffect, useRef, useState } from "react";
import { generateVideo, getModels, getTask, listReferenceImages, saveReferenceImage } from "../api.js";
import { findMentionedImages, mentionTag, resolveDataUri, toSavedItem } from "../mentions.js";
import { parseShotList } from "../shotParser.js";
import { SegmentedGroup } from "./GenerateForm.jsx";
import MentionAutocompleteTextarea from "./MentionAutocompleteTextarea.jsx";
import { ReferenceImagesField } from "./ReferenceImagesField.jsx";
import TaskStatus from "./TaskStatus.jsx";
import VideoResult from "./VideoResult.jsx";

const TERMINAL_STATES = new Set(["succeeded", "failed", "expired", "cancelled"]);

const DEFAULT_SETTINGS = {
  model: "",
  ratio: "16:9",
  resolution: "720p",
  duration: 4,
  watermark: false,
  generateAudio: true,
  seed: "",
};

function newRow(shot, settings) {
  return {
    key: shot.key,
    label: shot.label,
    prompt: shot.prompt,
    referenceImages: [],
    ...settings,
    selected: false,
    status: "idle",
    taskId: null,
    error: null,
    videoUrl: null,
  };
}

function extractMentionTokens(text) {
  const matches = text.match(/@([^\s@]+)/g) || [];
  return [...new Set(matches.map((m) => m.slice(1)))];
}

function MentionChips({ prompt, savedImages }) {
  const tokens = extractMentionTokens(prompt);
  if (tokens.length === 0) return null;
  const matched = new Set(findMentionedImages(prompt, savedImages).map((img) => mentionTag(img.name).toLowerCase()));

  return (
    <div className="ref-chip-list">
      {tokens.map((token) => (
        <span key={token} className={`ref-chip ${matched.has(token.toLowerCase()) ? "" : "ref-chip-missing"}`}>
          @{token} {matched.has(token.toLowerCase()) ? "" : "(no saved image)"}
        </span>
      ))}
    </div>
  );
}

function SettingsFields({ values, onChange, models }) {
  function set(patch) {
    onChange({ ...values, ...patch });
  }

  return (
    <div className="settings-fields">
      {models.length > 0 && (
        <label className="field">
          <span>Model</span>
          <select value={values.model} onChange={(e) => set({ model: e.target.value })}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>Ratio</span>
        <select value={values.ratio} onChange={(e) => set({ ratio: e.target.value })}>
          {["16:9", "9:16", "4:3", "3:4", "21:9", "1:1", "adaptive"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Resolution</span>
        <select value={values.resolution} onChange={(e) => set({ resolution: e.target.value })}>
          {["480p", "720p", "1080p", "2K"].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Duration (s)</span>
        <input
          type="number"
          min={4}
          max={15}
          value={values.duration}
          onChange={(e) => set({ duration: Number(e.target.value) })}
        />
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={values.watermark} onChange={(e) => set({ watermark: e.target.checked })} />
        <span>Watermark</span>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={values.generateAudio}
          onChange={(e) => set({ generateAudio: e.target.checked })}
        />
        <span>Generate audio</span>
      </label>
    </div>
  );
}

export default function BatchForm() {
  const [pasteText, setPasteText] = useState("");
  const [rows, setRows] = useState([]);
  const [defaults, setDefaults] = useState(DEFAULT_SETTINGS);
  const [concurrency, setConcurrency] = useState(2);
  const [models, setModels] = useState([]);
  const [savedImages, setSavedImages] = useState([]);
  const [labelFilter, setLabelFilter] = useState("");
  const [running, setRunning] = useState(false);
  const pollRefs = useRef({});

  useEffect(() => {
    getModels()
      .then(({ models, default: defaultModel }) => {
        setModels(models);
        setDefaults((prev) => ({ ...prev, model: prev.model || defaultModel }));
      })
      .catch(() => {});
    refreshSavedImages();
  }, []);

  useEffect(
    () => () => {
      Object.values(pollRefs.current).forEach(clearTimeout);
    },
    []
  );

  function refreshSavedImages() {
    listReferenceImages()
      .then(setSavedImages)
      .catch(() => {});
  }

  async function handleSaveUploadedImage(item, onSaved) {
    const name = window.prompt("Name this reference image:", item.name);
    if (!name || !name.trim()) return;
    await saveReferenceImage(item.file, name.trim());
    refreshSavedImages();
    if (onSaved) onSaved(name.trim());
  }

  function handleSplit() {
    const shots = parseShotList(pasteText);
    if (shots.length === 0) return;
    setRows((prev) => [...prev, ...shots.map((shot) => newRow(shot, defaults))]);
    setPasteText("");
  }

  function updateRow(key, patch) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function toggleSelect(key) {
    updateRow(key, { selected: !rows.find((r) => r.key === key)?.selected });
  }

  function selectByFilter() {
    if (!labelFilter.trim()) return;
    const needle = labelFilter.trim().toLowerCase();
    setRows((prev) => prev.map((r) => (r.label.toLowerCase().includes(needle) ? { ...r, selected: true } : r)));
  }

  function clearSelection() {
    setRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  }

  function applyToSelected(patch) {
    setRows((prev) => prev.map((r) => (r.selected ? { ...r, ...patch } : r)));
  }

  const selectedCount = rows.filter((r) => r.selected).length;

  async function buildPayload(row) {
    const images = [];
    const referenceImageIds = new Set();

    const mentionedIds = findMentionedImages(row.prompt, savedImages).map((img) => img.id);
    const refItems = [...row.referenceImages];
    for (const id of mentionedIds) {
      if (!refItems.some((i) => i.source === "saved" && i.savedImageId === id)) {
        const img = savedImages.find((s) => s.id === id);
        if (img) refItems.push(toSavedItem(img));
      }
    }
    for (const item of refItems) {
      images.push({ url: await resolveDataUri(item), role: "reference_image" });
      if (item.source === "saved") referenceImageIds.add(item.savedImageId);
    }

    return {
      prompt: row.prompt.trim(),
      model: row.model || undefined,
      images,
      reference_image_ids: [...referenceImageIds],
      ratio: row.ratio,
      resolution: row.resolution,
      duration: Number(row.duration),
      watermark: row.watermark,
      generate_audio: row.generateAudio,
      seed: row.seed === "" || row.seed == null ? null : Number(row.seed),
    };
  }

  function pollUntilTerminal(taskId, onUpdate) {
    return new Promise((resolve) => {
      function tick(delay) {
        pollRefs.current[taskId] = setTimeout(async () => {
          try {
            const result = await getTask(taskId);
            onUpdate(result);
            if (TERMINAL_STATES.has(result.status)) {
              resolve(result);
            } else {
              tick(Math.min(delay * 1.5, 15000));
            }
          } catch (err) {
            onUpdate({ status: "failed", error: { message: err.message } });
            resolve(null);
          }
        }, delay);
      }
      tick(3000);
    });
  }

  async function runRow(key, snapshot) {
    updateRow(key, { status: "queued", error: null, videoUrl: null });
    try {
      const payload = await buildPayload(snapshot);
      const { task_id } = await generateVideo(payload);
      updateRow(key, { taskId: task_id });
      await pollUntilTerminal(task_id, (result) => {
        updateRow(key, {
          status: result.status,
          videoUrl: result.content?.video_url ?? null,
          error: result.error ?? null,
        });
      });
    } catch (err) {
      updateRow(key, { status: "failed", error: { message: err.message } });
    }
  }

  async function runAll() {
    const queue = rows.filter((r) => r.status === "idle" || r.status === "failed");
    if (queue.length === 0) return;
    setRunning(true);
    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const row = queue[cursor++];
        await runRow(row.key, row);
      }
    }
    const workerCount = Math.min(concurrency, queue.length);
    await Promise.all(Array.from({ length: workerCount }, worker));
    setRunning(false);
  }

  return (
    <div className="batch-layout">
      <div className="card">
        <label className="field">
          <span>Paste a shot list</span>
          <textarea
            className="batch-paste"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Paste your whole shot list here — lines starting with "Shot 4", "Shot 5b", etc. are used as split points.'}
          />
        </label>
        <button type="button" onClick={handleSplit} disabled={!pasteText.trim()}>
          Split into shots
        </button>
      </div>

      <div className="card">
        <span className="hint">Defaults for newly split shots</span>
        <SettingsFields values={defaults} onChange={setDefaults} models={models} />
        <label className="field">
          <span>Concurrent generations</span>
          <input
            type="number"
            min={1}
            max={4}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
          />
        </label>
      </div>

      {rows.length > 0 && (
        <>
          <div className="card bulk-bar">
            <div className="row">
              <input
                type="text"
                className="grow"
                placeholder="Select rows whose label contains…"
                value={labelFilter}
                onChange={(e) => setLabelFilter(e.target.value)}
              />
              <button type="button" className="button-secondary" onClick={selectByFilter}>
                Select matching
              </button>
              <button type="button" className="button-secondary" onClick={clearSelection}>
                Clear selection
              </button>
            </div>
            {selectedCount > 0 && (
              <div className="bulk-apply">
                <span className="hint">{selectedCount} row(s) selected — apply settings:</span>
                <SettingsFields values={defaults} onChange={setDefaults} models={models} />
                <button type="button" onClick={() => applyToSelected(defaults)}>
                  Apply to selected
                </button>
              </div>
            )}
          </div>

          <button type="button" onClick={runAll} disabled={running}>
            {running ? "Generating…" : "Generate all"}
          </button>

          {rows.map((row) => (
            <div key={row.key} className="card batch-row">
              <div className="row">
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={() => toggleSelect(row.key)}
                />
                <input
                  type="text"
                  className="grow"
                  value={row.label}
                  onChange={(e) => updateRow(row.key, { label: e.target.value })}
                />
                <button type="button" className="button-secondary" onClick={() => removeRow(row.key)}>
                  Remove
                </button>
              </div>

              <label className="field">
                <span>Prompt</span>
                <MentionAutocompleteTextarea
                  value={row.prompt}
                  onChange={(value) => updateRow(row.key, { prompt: value })}
                  savedImages={savedImages}
                />
              </label>

              <MentionChips prompt={row.prompt} savedImages={savedImages} />

              <ReferenceImagesField
                referenceImages={row.referenceImages}
                setReferenceImages={(updater) =>
                  updateRow(row.key, {
                    referenceImages:
                      typeof updater === "function" ? updater(row.referenceImages) : updater,
                  })
                }
                savedImages={savedImages}
                onSaveUploadedImage={handleSaveUploadedImage}
              />

              <details>
                <summary>Settings</summary>
                <SettingsFields values={row} onChange={(patch) => updateRow(row.key, patch)} models={models} />
              </details>

              <div className="row">
                <button
                  type="button"
                  className="button-secondary"
                  disabled={row.status === "queued" || row.status === "running"}
                  onClick={() => runRow(row.key, row)}
                >
                  {row.status === "failed" ? "Retry" : "Generate"}
                </button>
              </div>

              {row.status !== "idle" && <TaskStatus task={{ id: row.taskId, status: row.status, error: row.error }} />}
              {row.status === "succeeded" && <VideoResult videoUrl={row.videoUrl} prompt={row.prompt} />}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
