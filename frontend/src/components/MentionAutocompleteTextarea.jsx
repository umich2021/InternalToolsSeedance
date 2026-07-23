import { useEffect, useMemo, useRef, useState } from "react";
import { mentionTag } from "../mentions.js";

export default function MentionAutocompleteTextarea({ value, onChange, savedImages, ...textareaProps }) {
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef(null);

  const mentionMatches = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return savedImages.filter((img) => mentionTag(img.name).toLowerCase().startsWith(q));
  }, [mentionQuery, savedImages]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionQuery]);

  function handleChange(e) {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(newValue);

    const uptoCursor = newValue.slice(0, cursor);
    const match = uptoCursor.match(/@([^\s@]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(cursor - match[0].length);
    } else {
      setMentionQuery(null);
    }
  }

  function insertMention(img) {
    const tag = mentionTag(img.name);
    const cursor = mentionStart + 1 + (mentionQuery?.length ?? 0);
    const before = value.slice(0, mentionStart);
    const after = value.slice(cursor);
    const insertion = `@${tag} `;
    const newValue = `${before}${insertion}${after}`;
    onChange(newValue);
    setMentionQuery(null);

    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e) {
    if (mentionQuery === null || mentionMatches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMentionIndex((i) => (i + 1) % mentionMatches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(mentionMatches[mentionIndex]);
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }
  }

  return (
    <div className="mention-wrapper">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        {...textareaProps}
      />
      {mentionQuery !== null && mentionMatches.length > 0 && (
        <ul className="mention-list">
          {mentionMatches.map((img, i) => (
            <li
              key={img.id}
              className={i === mentionIndex ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(img);
              }}
            >
              @{mentionTag(img.name)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
