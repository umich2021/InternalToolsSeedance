import { useEffect, useRef, useState } from "react";
import { deleteVideo, listVideos, refreshVideoUrl } from "../api.js";
import { downloadNamed, suggestFilename } from "../download.js";

const GENERATION_LABELS = {
  queued: "Queued",
  running: "Generating...",
  succeeded: "Succeeded",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

const ARCHIVE_LABELS = {
  not_started: "Not archived",
  archiving: "Archiving...",
  archived: "Archived",
  failed: "Archive failed",
};

const PENDING = new Set(["queued", "running"]);

function formatDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleString();
}

function VideoCard({ v, onError, onDelete, onEditAgain }) {
  const [filename, setFilename] = useState(() => suggestFilename(v.prompt));
  const [downloadError, setDownloadError] = useState("");
  const [copied, setCopied] = useState(false);

  function handleDownload() {
    setDownloadError("");
    try {
      downloadNamed(v.video_url, filename.trim() || "seedance-video.mp4");
    } catch (err) {
      setDownloadError(err.message);
    }
  }

  async function handleCopyPrompt() {
    await navigator.clipboard.writeText(v.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card gallery-card">
      {v.video_url ? (
        <video
          src={v.video_url}
          controls
          loop
          style={{ width: "100%", borderRadius: 8 }}
          onError={() => onError(v.id)}
        />
      ) : (
        <div className="gallery-placeholder">{ARCHIVE_LABELS[v.archive_status]}</div>
      )}

      <p className="gallery-prompt" onClick={handleCopyPrompt} title="Click to copy">
        {v.prompt}
      </p>
      {copied && <span className="hint">Copied!</span>}

      <div className="row">
        <span className={`status-badge status-${v.generation_status}`}>
          {GENERATION_LABELS[v.generation_status] ?? v.generation_status}
        </span>
        <span className={`status-badge archive-${v.archive_status}`}>
          {ARCHIVE_LABELS[v.archive_status] ?? v.archive_status}
        </span>
      </div>

      <p className="hint">
        {v.model} · {v.ratio} · {v.resolution} · {v.duration}s
      </p>
      <p className="hint">{formatDate(v.created_at)}</p>
      {v.archive_error && <p className="error-text">{v.archive_error}</p>}

      {v.video_url && (
        <div className="row">
          <input
            type="text"
            className="grow"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
          <button type="button" className="button-secondary" onClick={handleDownload}>
            Download
          </button>
        </div>
      )}
      {downloadError && <p className="error-text">{downloadError}</p>}

      <div className="row">
        <button type="button" className="button-secondary" onClick={() => onEditAgain(v)}>
          Edit again
        </button>
        <button type="button" className="button-secondary" onClick={() => onDelete(v.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}

export default function Gallery({ onEditAgain }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    load();
    return () => clearTimeout(pollRef.current);
  }, []);

  async function load() {
    try {
      const list = await listVideos();
      setVideos(list);
      setError("");
      clearTimeout(pollRef.current);
      const hasPending = list.some(
        (v) => PENDING.has(v.generation_status) || v.archive_status === "archiving"
      );
      if (hasPending) pollRef.current = setTimeout(load, 4000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleVideoError(id) {
    try {
      const { video_url } = await refreshVideoUrl(id);
      setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, video_url } : v)));
    } catch {
      // archive may genuinely be gone (e.g. expired past retention) — leave as-is
    }
  }

  async function handleDelete(id) {
    await deleteVideo(id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }

  if (loading) return <div className="card hint">Loading gallery...</div>;

  return (
    <div>
      {error && <div className="card error-card">{error}</div>}
      {videos.length === 0 && <div className="card hint">No generations yet.</div>}
      <div className="gallery-grid">
        {videos.map((v) => (
          <VideoCard key={v.id} v={v} onError={handleVideoError} onDelete={handleDelete} onEditAgain={onEditAgain} />
        ))}
      </div>
    </div>
  );
}
