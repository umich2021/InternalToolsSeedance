import { useEffect, useRef, useState } from "react";
import GenerateForm from "./components/GenerateForm.jsx";
import TaskStatus from "./components/TaskStatus.jsx";
import VideoResult from "./components/VideoResult.jsx";
import Gallery from "./components/Gallery.jsx";
import BatchForm from "./components/BatchForm.jsx";
import { generateVideo, getTask } from "./api.js";

const TERMINAL_STATES = new Set(["succeeded", "failed", "expired", "cancelled"]);

export default function App() {
  const [view, setView] = useState("generate");
  const [submitting, setSubmitting] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(null);
  const pollRefs = useRef({});

  useEffect(
    () => () => {
      Object.values(pollRefs.current).forEach(clearTimeout);
    },
    []
  );

  function pollTask(taskId, delayMs = 3000) {
    pollRefs.current[taskId] = setTimeout(async () => {
      try {
        const result = await getTask(taskId);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...result } : t)));
        if (!TERMINAL_STATES.has(result.status)) {
          pollTask(taskId, Math.min(delayMs * 1.5, 15000));
        }
      } catch (err) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: "failed", error: { message: err.message } } : t))
        );
      }
    }, delayMs);
  }

  async function handleSubmit(payload) {
    setError("");
    setSubmitting(true);
    try {
      const { task_id } = await generateVideo(payload);
      setTasks((prev) => [{ id: task_id, status: "queued", prompt: payload.prompt }, ...prev]);
      pollTask(task_id, 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function dismissTask(taskId) {
    clearTimeout(pollRefs.current[taskId]);
    delete pollRefs.current[taskId];
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }

  function handleEditAgain(v) {
    setDraft(v);
    setView("generate");
  }

  return (
    <div className="app">
      <header>
        <h1>Seedance Video Generator</h1>
        <p className="subtitle">A simple wrapper around the BytePlus ModelArk Seedance API</p>
      </header>

      <nav className="tabs">
        <button className={view === "generate" ? "active" : ""} onClick={() => setView("generate")}>
          Generate
        </button>
        <button className={view === "gallery" ? "active" : ""} onClick={() => setView("gallery")}>
          Gallery
        </button>
        <button className={view === "batch" ? "active" : ""} onClick={() => setView("batch")}>
          Batch
        </button>
      </nav>

      {view === "batch" ? (
        <BatchForm />
      ) : view === "generate" ? (
        <>
          <GenerateForm
            onSubmit={handleSubmit}
            submitting={submitting}
            draft={draft}
            onDraftConsumed={() => setDraft(null)}
          />

          {error && <div className="card error-card">{error}</div>}

          {tasks.map((t) => (
            <div key={t.id}>
              <TaskStatus task={t} />
              {t.status === "succeeded" && <VideoResult videoUrl={t.content?.video_url} prompt={t.prompt} />}
              {TERMINAL_STATES.has(t.status) && (
                <button type="button" className="button-secondary" onClick={() => dismissTask(t.id)}>
                  Dismiss
                </button>
              )}
            </div>
          ))}
        </>
      ) : (
        <Gallery onEditAgain={handleEditAgain} />
      )}
    </div>
  );
}
