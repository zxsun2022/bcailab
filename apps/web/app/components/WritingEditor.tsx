import * as React from "react";
import type { WritingAgent } from "~/utils/writing-agents";

type WritingEditorProps = {
  value: string;
  onChange: (value: string) => void;
  agent: WritingAgent;
  name?: string;
  readOnly?: boolean;
  className?: string;
  showGuide?: boolean;
  topic?: string;
  onTopicChange?: (value: string) => void;
  showTopic?: boolean;
  topicReadOnly?: boolean;
};

type WritingGuidePanelProps = {
  agent: WritingAgent;
};

type WritingEssayPromptFieldProps = {
  value?: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  optional?: boolean;
};

export function WritingGuidePanel({ agent }: WritingGuidePanelProps) {
  const [scaffoldOpen, setScaffoldOpen] = React.useState(false);

  return (
    <div className="writing-scaffold">
      <button
        type="button"
        className="writing-scaffold-toggle"
        onClick={() => setScaffoldOpen((open) => !open)}
        aria-expanded={scaffoldOpen}
      >
        <span className="writing-scaffold-toggle-icon">{scaffoldOpen ? "▾" : "▸"}</span>
        Writing guide
      </button>
      {scaffoldOpen ? (
        <div className="writing-scaffold-body">
          {agent.scaffold.split("\n").map((line, i) =>
            line.trim() === "" ? (
              <div key={i} className="writing-scaffold-gap" />
            ) : (
              <p key={i} className="writing-scaffold-line">{line}</p>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}

export function WritingEssayPromptField({
  value,
  onChange,
  readOnly = false,
  optional = false
}: WritingEssayPromptFieldProps) {
  const isEmptyReadOnly = readOnly && !value?.trim();

  return (
    <div className="writing-topic-area">
      <label className="writing-label" htmlFor="writing-topic-input">
        Essay prompt {optional ? <span className="writing-label-optional">(optional)</span> : null}
      </label>
      <textarea
        id="writing-topic-input"
        className={`writing-topic-input${readOnly ? " is-readonly" : ""}${isEmptyReadOnly ? " is-empty" : ""}`}
        value={value ?? ""}
        onChange={(e) => {
          if (!readOnly) onChange?.(e.currentTarget.value);
        }}
        placeholder={
          readOnly
            ? undefined
            : "Paste the essay question or topic here for more accurate Task Response evaluation…"
        }
        rows={isEmptyReadOnly ? 1 : 2}
        readOnly={readOnly}
      />
    </div>
  );
}

export function WritingEditor({
  value,
  onChange,
  agent,
  name,
  readOnly = false,
  className,
  showGuide = true,
  topic,
  onTopicChange,
  showTopic = false,
  topicReadOnly = false
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
      {showGuide ? <WritingGuidePanel agent={agent} /> : null}

      {showTopic ? (
        <WritingEssayPromptField
          value={topic}
          onChange={onTopicChange}
          readOnly={topicReadOnly}
          optional={!topicReadOnly}
        />
      ) : null}

      <textarea
        name={name}
        className="writing-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        readOnly={readOnly}
        placeholder="Start writing your essay here…"
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
