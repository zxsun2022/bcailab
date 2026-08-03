import { useCallback, useRef, useState } from "react";
import { COMPOSITION_GRACE_MS, useImeGuard, type GuardDecision } from "./useImeGuard";

/*
 * Phase 0 spike 1 — Chinese IME inside canvas text editing.
 *
 * Question: which editing surface lets Enter/Tab act as editor commands without stealing the
 * keys the IME needs to confirm a candidate? The answer decides the whole editing layer, so
 * everything else in Phase 1 waits on it.
 *
 * Three candidate surfaces, same guard, same log. Disposable: delete once findings land in
 * docs/mapdown/spikes/ and the spec.
 */

type Surface = "contenteditable" | "textarea" | "hidden-input";

type LogRow = {
  seq: number;
  surface: Surface;
  event: string;
  key?: string;
  detail: string;
  fired: boolean | null;
};

const SURFACES: { id: Surface; label: string; note: string }[] = [
  {
    id: "contenteditable",
    label: "contentEditable",
    note: "Text lives in the DOM node itself. Caret and selection come free; sanitising pasted HTML and preventing rich-text commands is the cost."
  },
  {
    id: "textarea",
    label: "Overlaid textarea",
    note: "A real form control positioned over the node. Most predictable IME behaviour; the node box and the textarea must be kept in exact visual sync."
  },
  {
    id: "hidden-input",
    label: "Hidden input",
    note: "The node paints its own text; an off-screen input collects keystrokes. Full render control; caret position must be drawn by hand."
  }
];

export function ImeSpike() {
  const [surface, setSurface] = useState<Surface>("textarea");
  const [value, setValue] = useState("");
  const [log, setLog] = useState<LogRow[]>([]);
  const [commands, setCommands] = useState({ sibling: 0, child: 0, spurious: 0 });
  const seq = useRef(0);
  const guard = useImeGuard();

  const push = useCallback((row: Omit<LogRow, "seq" | "surface">) => {
    seq.current += 1;
    setLog((prev) => [{ seq: seq.current, surface, ...row }, ...prev].slice(0, 200));
  }, [surface]);

  const describe = (d: GuardDecision) =>
    `${d.imeOwned ? "IME" : "COMMAND"} · ${d.reason}` +
    (d.sinceCompositionEnd === null ? "" : ` · +${d.sinceCompositionEnd.toFixed(1)}ms`);

  const handleCompositionStart = () => {
    guard.onCompositionStart();
    push({ event: "compositionstart", detail: "composing = true", fired: null });
  };

  const handleCompositionEnd = (data: string) => {
    guard.onCompositionEnd();
    push({ event: "compositionend", detail: `committed "${data}"`, fired: null });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== "Tab") return;
    const decision = guard.inspect(e.nativeEvent);

    if (decision.imeOwned) {
      // Let the IME have it. Critically, do NOT preventDefault — the IME needs the key.
      push({ event: "keydown", key: e.key, detail: describe(decision), fired: false });
      return;
    }

    e.preventDefault();
    push({ event: "keydown", key: e.key, detail: describe(decision), fired: true });
    setCommands((c) =>
      e.key === "Enter" ? { ...c, sibling: c.sibling + 1 } : { ...c, child: c.child + 1 }
    );
  };

  const editorProps = {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: (e: React.CompositionEvent) => handleCompositionEnd(e.data),
    onKeyDown: handleKeyDown
  };

  /**
   * Replays both browser orderings against the guard without needing the browser to differ.
   * This proves the *logic*; it does not replace a session with a real IME, which is the only
   * way to learn the true gap between compositionend and the confirming keydown.
   */
  const runSelfTest = () => {
    guard.reset();
    const results: string[] = [];
    const check = (name: string, got: boolean, want: boolean) =>
      results.push(`${got === want ? "PASS" : "FAIL"}  ${name}`);

    // Chrome / Firefox: keydown carries isComposing, then compositionend.
    guard.onCompositionStart();
    check(
      "chrome: Enter during composition is IME-owned",
      guard.inspect({ isComposing: true, keyCode: 229 }).imeOwned,
      true
    );
    guard.onCompositionEnd();

    // Safari: compositionend already fired, so the confirming keydown looks innocent.
    check(
      "safari: Enter immediately after compositionend is IME-owned",
      guard.inspect({ isComposing: false, keyCode: 13 }).imeOwned,
      true
    );

    // A genuine Enter, well after composition finished, must reach the command layer.
    const genuine = () => guard.inspect({ isComposing: false, keyCode: 13 }).imeOwned;
    setTimeout(() => {
      check("genuine Enter after the grace window is a command", genuine(), false);
      guard.reset();
      check(
        "Enter with no composition history is a command",
        guard.inspect({ isComposing: false, keyCode: 13 }).imeOwned,
        false
      );
      const failures = results.filter((r) => r.startsWith("FAIL")).length;
      push({
        event: "self-test",
        detail: `${results.length - failures}/${results.length} passed — ` + results.join(" | "),
        fired: null
      });
    }, COMPOSITION_GRACE_MS + 20);
  };

  return (
    <div style={{ display: "grid", gap: "1.5rem" }}>
      <section>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          {SURFACES.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSurface(s.id);
                setValue("");
                guard.reset();
              }}
              style={{
                padding: "0.35rem 0.7rem",
                borderRadius: "var(--chrome-radius)",
                border: `1px solid ${surface === s.id ? "var(--chrome-accent)" : "var(--chrome-border-strong)"}`,
                background: surface === s.id ? "var(--chrome-accent)" : "transparent",
                color: surface === s.id ? "var(--chrome-accent-text)" : "var(--chrome-text)",
                cursor: "pointer",
                font: "inherit"
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p style={{ color: "var(--chrome-text-muted)", margin: "0 0 1rem" }}>
          {SURFACES.find((s) => s.id === surface)?.note}
        </p>

        <div
          style={{
            border: "1px solid var(--chrome-border-strong)",
            borderRadius: "var(--chrome-radius)",
            padding: "1rem",
            background: "var(--chrome-bg-sunken)"
          }}
        >
          {surface === "contenteditable" && (
            <div
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setValue(e.currentTarget.textContent ?? "")}
              {...editorProps}
              style={{ minHeight: "2.5rem", outline: "none", fontSize: "1.05rem" }}
            />
          )}

          {surface === "textarea" && (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={2}
              {...editorProps}
              style={{
                width: "100%",
                resize: "none",
                border: "none",
                background: "transparent",
                color: "inherit",
                font: "inherit",
                fontSize: "1.05rem",
                outline: "none"
              }}
            />
          )}

          {surface === "hidden-input" && (
            <HiddenInputSurface value={value} onValue={setValue} editorProps={editorProps} />
          )}
        </div>

        <div style={{ marginTop: "0.75rem", display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
          <span>
            Enter → sibling: <strong>{commands.sibling}</strong>
          </span>
          <span>
            Tab → child: <strong>{commands.child}</strong>
          </span>
          <button onClick={runSelfTest} style={{ font: "inherit", cursor: "pointer" }}>
            Run self-test
          </button>
          <button
            onClick={() => {
              setLog([]);
              setCommands({ sibling: 0, child: 0, spurious: 0 });
            }}
            style={{ font: "inherit", cursor: "pointer" }}
          >
            Clear log
          </button>
        </div>
      </section>

      <section>
        <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>Event log — newest first</h3>
        <p style={{ color: "var(--chrome-text-muted)", marginTop: 0 }}>
          Type 拼音 and press Enter to confirm a candidate. Every confirming Enter must log{" "}
          <code>IME</code>, never <code>COMMAND</code>. A single <code>COMMAND</code> row during
          confirmation is the bug this spike exists to find.
        </p>
        <div
          style={{
            maxHeight: "20rem",
            overflow: "auto",
            border: "1px solid var(--chrome-border)",
            borderRadius: "var(--chrome-radius)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "12px"
          }}
        >
          {log.length === 0 && (
            <div style={{ padding: "0.75rem", color: "var(--chrome-text-muted)" }}>
              No events yet.
            </div>
          )}
          {log.map((row) => (
            <div
              key={row.seq}
              style={{
                padding: "0.35rem 0.75rem",
                borderBottom: "1px solid var(--chrome-border)",
                color:
                  row.fired === true
                    ? "var(--chrome-accent)"
                    : row.fired === false
                      ? "var(--chrome-text-muted)"
                      : "var(--chrome-text)"
              }}
            >
              <span style={{ opacity: 0.5 }}>#{row.seq}</span>{" "}
              <span
                style={{
                  opacity: 0.75,
                  padding: "0 0.3rem",
                  borderRadius: 3,
                  background: "var(--chrome-bg-raised)",
                  border: "1px solid var(--chrome-border)"
                }}
              >
                {row.surface}
              </span>{" "}
              {row.event}
              {row.key ? ` [${row.key}]` : ""} — {row.detail}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function HiddenInputSurface({
  value,
  onValue,
  editorProps
}: {
  value: string;
  onValue: (v: string) => void;
  editorProps: {
    onCompositionStart: () => void;
    onCompositionEnd: (e: React.CompositionEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      onClick={() => input.current?.focus()}
      style={{ minHeight: "2.5rem", cursor: "text", fontSize: "1.05rem" }}
    >
      <span>{value || <span style={{ opacity: 0.4 }}>click here, then type</span>}</span>
      <span style={{ borderLeft: "1px solid var(--chrome-accent)", marginLeft: 1 }} />
      <input
        ref={input}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        {...editorProps}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
      />
    </div>
  );
}
