import { useEffect, useState } from "react";
import {
  deleteReferenceImage,
  getModels,
  listReferenceImages,
  referenceImageFileUrl,
  saveReferenceImage,
} from "../api.js";
import { findMentionedImages, resolveDataUri, toSavedItem } from "../mentions.js";
import MentionAutocompleteTextarea from "./MentionAutocompleteTextarea.jsx";
import { ReferenceImagesField, SavedImagePicker } from "./ReferenceImagesField.jsx";

export function SegmentedGroup({ value, options, onChange, vertical }) {
  return (
    <div className={`segmented ${vertical ? "segmented-vertical" : ""}`}>
      {options.map((opt) => {
        const optValue = typeof opt === "object" ? opt.value : opt;
        const optLabel = typeof opt === "object" ? opt.label : opt;
        return (
          <button
            key={optValue}
            type="button"
            className={value === optValue ? "segmented-active" : ""}
            onClick={() => onChange(optValue)}
          >
            {optLabel}
          </button>
        );
      })}
    </div>
  );
}

function FramePicker({ label, item, onChange, savedImages }) {
  return (
    <label className="field">
      <span>{label}</span>
      {item ? (
        <div className="row">
          <img className="thumb" src={item.previewUrl} alt={label} />
          <div className="field grow">
            <span>{item.name}</span>
            <button type="button" className="button-secondary" onClick={() => onChange(null)}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              onChange({
                key: crypto.randomUUID(),
                source: "upload",
                file,
                name: file.name,
                previewUrl: URL.createObjectURL(file),
              });
            }}
          />
          <SavedImagePicker
            savedImages={savedImages}
            label="— or use a saved image —"
            onPick={(img) => onChange(toSavedItem(img))}
          />
        </>
      )}
    </label>
  );
}

function ImagesWidget({
  firstFrame,
  setFirstFrame,
  lastFrame,
  setLastFrame,
  referenceImages,
  setReferenceImages,
  savedImages,
  handleSaveUploadedImage,
  handleDeleteSavedImage,
}) {
  const [mode, setMode] = useState("reference");

  return (
    <div className="card">
      <span className="hint">Images</span>
      <SegmentedGroup
        value={mode}
        options={[
          { value: "reference", label: "Reference images" },
          { value: "frames", label: "First / Last frame" },
        ]}
        onChange={setMode}
        vertical
      />

      {mode === "reference" ? (
        <div style={{ marginTop: 12 }}>
          <ReferenceImagesField
            referenceImages={referenceImages}
            setReferenceImages={setReferenceImages}
            savedImages={savedImages}
            onSaveUploadedImage={handleSaveUploadedImage}
          />
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <FramePicker label="First frame" item={firstFrame} onChange={setFirstFrame} savedImages={savedImages} />
          <FramePicker label="Last frame" item={lastFrame} onChange={setLastFrame} savedImages={savedImages} />
        </div>
      )}

      {savedImages.length > 0 && (
        <div className="field" style={{ marginTop: 12 }}>
          <span>Saved images</span>
          <div className="ref-chip-list">
            {savedImages.map((img) => (
              <span key={img.id} className="ref-chip">
                <img className="ref-chip-preview" src={referenceImageFileUrl(img.id)} alt={img.name} />
                {img.name}
                <button type="button" className="chip-action" onClick={() => handleDeleteSavedImage(img.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GenerateForm({ onSubmit, submitting, draft, onDraftConsumed }) {
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [duration, setDuration] = useState(4);
  const [watermark, setWatermark] = useState(false);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [seed, setSeed] = useState("");

  const [firstFrame, setFirstFrame] = useState(null);
  const [lastFrame, setLastFrame] = useState(null);
  const [referenceImages, setReferenceImages] = useState([]);
  const [savedImages, setSavedImages] = useState([]);
  const [savedImagesLoaded, setSavedImagesLoaded] = useState(false);

  useEffect(() => {
    getModels()
      .then(({ models, default: defaultModel }) => {
        setModels(models);
        // Don't clobber a model already set by a "draft" (Edit again) that
        // may have applied before this network call resolved.
        setModel((current) => current || defaultModel);
      })
      .catch(() => {});
    refreshSavedImages();
  }, []);

  function refreshSavedImages() {
    listReferenceImages()
      .then((list) => {
        setSavedImages(list);
        setSavedImagesLoaded(true);
      })
      .catch(() => setSavedImagesLoaded(true));
  }

  // Settings apply immediately at mount. Reference-image chips are handled
  // in a separate effect below, gated on savedImagesLoaded — otherwise this
  // could clear `draft` (via onDraftConsumed) before the saved-images fetch
  // resolves, silently dropping any reference images from the draft.
  useEffect(() => {
    if (!draft) return;
    setPrompt(draft.prompt ?? "");
    setModel(draft.model ?? "");
    setRatio(draft.ratio ?? "16:9");
    setResolution(draft.resolution ?? "720p");
    setDuration(draft.duration ?? 4);
    setWatermark(draft.watermark ?? false);
    setGenerateAudio(draft.generate_audio ?? true);
    setSeed(draft.seed ?? "");
    setFirstFrame(null);
    setLastFrame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  useEffect(() => {
    if (!draft || !savedImagesLoaded) return;
    const ids = draft.reference_image_ids ?? [];
    const items = ids
      .map((id) => savedImages.find((s) => s.id === id))
      .filter(Boolean)
      .map(toSavedItem);
    setReferenceImages(items);
    onDraftConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, savedImagesLoaded, savedImages]);

  async function handleSaveUploadedImage(item, onSaved) {
    const name = window.prompt("Name this reference image:", item.name);
    if (!name || !name.trim()) return;
    await saveReferenceImage(item.file, name.trim());
    refreshSavedImages();
    if (onSaved) onSaved(name.trim());
  }

  async function handleDeleteSavedImage(id) {
    await deleteReferenceImage(id);
    setFirstFrame((f) => (f?.source === "saved" && f.savedImageId === id ? null : f));
    setLastFrame((f) => (f?.source === "saved" && f.savedImageId === id ? null : f));
    setReferenceImages((prev) => prev.filter((i) => !(i.source === "saved" && i.savedImageId === id)));
    refreshSavedImages();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!prompt.trim()) return;

    const images = [];
    const referenceImageIds = new Set();

    if (firstFrame) {
      images.push({ url: await resolveDataUri(firstFrame), role: "first_frame" });
      if (firstFrame.source === "saved") referenceImageIds.add(firstFrame.savedImageId);
    }
    if (lastFrame) {
      images.push({ url: await resolveDataUri(lastFrame), role: "last_frame" });
      if (lastFrame.source === "saved") referenceImageIds.add(lastFrame.savedImageId);
    }

    const mentionedIds = findMentionedImages(prompt, savedImages).map((img) => img.id);
    const refItems = [...referenceImages];
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

    onSubmit({
      prompt: prompt.trim(),
      model: model || undefined,
      images,
      reference_image_ids: [...referenceImageIds],
      ratio,
      resolution,
      duration: Number(duration),
      watermark,
      generate_audio: generateAudio,
      seed: seed === "" ? null : Number(seed),
    });
  }

  return (
    <div className="generate-layout">
      <div className="sidebar-left">
        {models.length > 0 && (
          <div className="card">
            <span className="hint">Model</span>
            <SegmentedGroup
              value={model}
              options={models.map((m) => ({ value: m.id, label: m.label }))}
              onChange={setModel}
              vertical
            />
          </div>
        )}

        <ImagesWidget
          firstFrame={firstFrame}
          setFirstFrame={setFirstFrame}
          lastFrame={lastFrame}
          setLastFrame={setLastFrame}
          referenceImages={referenceImages}
          setReferenceImages={setReferenceImages}
          savedImages={savedImages}
          handleSaveUploadedImage={handleSaveUploadedImage}
          handleDeleteSavedImage={handleDeleteSavedImage}
        />
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <label className="field">
          <span>Prompt</span>
          <MentionAutocompleteTextarea
            value={prompt}
            onChange={setPrompt}
            savedImages={savedImages}
            placeholder="A cinematic close-up of a weary astronaut looking at Earth... (type @ to reference a saved image)"
            required
          />
          <span className="hint">
            Type @ followed by a saved reference image's name to pull it in as a consistency
            reference (e.g. "make sure the character looks like @AstronautJane").
          </span>
        </label>

        <label className="field">
          <span>Seed (optional)</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
          />
        </label>

        <div className="row checkboxes">
          <label className="checkbox">
            <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
            <span>Watermark</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={generateAudio} onChange={(e) => setGenerateAudio(e.target.checked)} />
            <span>Generate audio</span>
          </label>
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? "Submitting..." : "Generate video"}
        </button>
      </form>

      <div className="sidebar-right">
        <div className="card">
          <span className="hint">Settings</span>
          <label className="field">
            <span>Ratio</span>
            <SegmentedGroup value={ratio} options={["16:9", "9:16", "4:3", "3:4", "21:9", "1:1", "adaptive"]} onChange={setRatio} vertical />
          </label>
          <label className="field">
            <span>Resolution</span>
            <SegmentedGroup value={resolution} options={["480p", "720p", "1080p", "2K"]} onChange={setResolution} vertical />
          </label>
          <label className="field">
            <span>Duration: {duration}s</span>
            <input
              type="range"
              min={4}
              max={15}
              step={1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
