import { useState } from "react";
import { downloadNamed, suggestFilename } from "../download.js";

export default function VideoResult({ videoUrl, prompt }) {
  const [filename, setFilename] = useState(() => suggestFilename(prompt || ""));
  const [error, setError] = useState("");

  if (!videoUrl) return null;

  function handleDownload() {
    setError("");
    try {
      downloadNamed(videoUrl, filename.trim() || "seedance-video.mp4");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <video src={videoUrl} controls autoPlay style={{ maxWidth: 360, width: "100%", borderRadius: 8 }} />
      <p className="hint">
        This video is being archived to your Gallery automatically. The link above from the API
        expires after 24 hours, so download it now if you want a local copy right away.
      </p>
      <div className="row">
        <input
          type="text"
          className="grow"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
        />
        <button type="button" onClick={handleDownload}>
          Download video
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
