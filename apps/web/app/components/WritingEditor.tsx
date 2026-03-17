import * as React from "react";
import type { WritingAgent } from "~/utils/writing-agents";

type WritingEditorProps = {
  value: string;
  onChange: (value: string) => void;
  agent: WritingAgent;
  name?: string;
  readOnly?: boolean;
  className?: string;
};

export function WritingEditor({
  value,
  onChange,
  agent,
  name,
  readOnly = false,
  className
}: WritingEditorProps) {
  const wordCount = value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const isBelowMin = wordCount > 0 && wordCount < agent.minWords;
  const isAboveMax = wordCount > agent.maxWords;

  const countClass = [
    "writing-editor-count",
    isBelowMin ? "is-warning" : "",
    isAboveMax ? "is-over" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`writing-editor ${className ?? ""}`}>
      <textarea
        name={name}
        className="writing-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        readOnly={readOnly}
        placeholder="Start writing your essay here..."
        spellCheck
      />
      <div className="writing-editor-footer">
        <span className={countClass}>
          {wordCount} {wordCount === 1 ? "word" : "words"}
          {" · "}
          {agent.minWords}–{agent.maxWords} recommended
        </span>
      </div>
    </div>
  );
}
