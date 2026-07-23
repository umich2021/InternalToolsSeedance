import { useEffect, useRef, useState } from "react";

const LABELS = {
  queued: "Queued",
  running: "Generating video...",
  succeeded: "Done",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

const IN_PROGRESS = new Set(["queued", "running"]);

export default function TaskStatus({ task }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);

  useEffect(() => {
    if (!task || !IN_PROGRESS.has(task.status)) {
      startRef.current = null;
      setElapsed(0);
      return;
    }
    if (!startRef.current) startRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [task?.id, task?.status]);

  if (!task) return null;
  const label = LABELS[task.status] ?? task.status;

  return (
    <div className="card status-card">
      <div className={`status-badge status-${task.status}`}>{label}</div>
      <div className="task-id">Task ID: {task.id}</div>
      {task.status === "failed" && task.error && (
        <p className="error-text">{task.error.message || task.error.code}</p>
      )}
      {IN_PROGRESS.has(task.status) && (
        <div className="progress">
          <div className="progress-bar" aria-label="loading">
            <div className="progress-bar-fill" />
          </div>
          <span className="hint">{elapsed}s elapsed</span>
        </div>
      )}
    </div>
  );
}
