import { useState } from "react";
import { toSavedItem } from "../mentions.js";

export function SavedImagePicker({ savedImages, onPick, label }) {
  const [choice, setChoice] = useState("");
  if (savedImages.length === 0) return null;

  return (
    <div className="row">
      <select className="grow" value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">{label}</option>
        {savedImages.map((img) => (
          <option key={img.id} value={img.id}>{img.name}</option>
        ))}
      </select>
      <button
        type="button"
        className="button-secondary"
        disabled={!choice}
        onClick={() => {
          const img = savedImages.find((i) => i.id === choice);
          if (img) onPick(img);
          setChoice("");
        }}
      >
        Add
      </button>
    </div>
  );
}

export function ReferenceImagesField({ referenceImages, setReferenceImages, savedImages, onSaveUploadedImage }) {
  return (
    <div className="field">
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length === 0) return;
          setReferenceImages((prev) => [
            ...prev,
            ...files.map((file) => ({
              key: crypto.randomUUID(),
              source: "upload",
              file,
              name: file.name,
              previewUrl: URL.createObjectURL(file),
            })),
          ]);
          e.target.value = "";
        }}
      />
      <SavedImagePicker
        savedImages={savedImages}
        label="— add a saved image —"
        onPick={(img) => {
          setReferenceImages((prev) =>
            prev.some((i) => i.source === "saved" && i.savedImageId === img.id)
              ? prev
              : [...prev, toSavedItem(img)]
          );
        }}
      />
      {referenceImages.length > 0 && (
        <div className="ref-chip-list">
          {referenceImages.map((item) => (
            <span key={item.key} className="ref-chip">
              <img className="ref-chip-preview" src={item.previewUrl} alt={item.name} />
              {item.name}
              {item.source === "upload" && (
                <button
                  type="button"
                  className="chip-action"
                  onClick={() =>
                    onSaveUploadedImage(item, (newName) => {
                      setReferenceImages((prev) =>
                        prev.map((i) => (i.key === item.key ? { ...i, name: newName } : i))
                      );
                    })
                  }
                >
                  save
                </button>
              )}
              <button
                type="button"
                className="chip-action"
                onClick={() =>
                  setReferenceImages((prev) => {
                    const removed = prev.find((i) => i.key === item.key);
                    if (removed?.source === "upload") URL.revokeObjectURL(removed.previewUrl);
                    return prev.filter((i) => i.key !== item.key);
                  })
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
