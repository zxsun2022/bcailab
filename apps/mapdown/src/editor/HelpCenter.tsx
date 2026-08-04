import { useEffect, useMemo, useRef, useState } from "react";
import {
  platformShortcut,
  searchCommands,
  type CommandDefinition
} from "./command-registry";

export interface RuntimeCommand extends CommandDefinition {
  disabledReason: string | null;
  execute: () => void;
}

interface HelpCenterProps {
  mode: "help" | "search";
  commands: RuntimeCommand[];
  onClose: () => void;
}

const HELP_TOPICS = [
  {
    title: "Getting started",
    body: "Select the root and type. Enter creates a sibling, Tab creates a child, Shift+Tab promotes, arrows navigate after editing, and Space collapses a branch."
  },
  {
    title: "Select versus edit",
    body: "A selected node receives structural commands. F2 or normal typing starts text editing. Delete edits text while the textarea is active; outside editing it deletes the whole branch. Escape keeps typed text and exits."
  },
  {
    title: "Two-sided navigation",
    body: "Arrow toward the root selects the parent; arrow away selects a child. Left-side branches mirror horizontal direction. Home always returns to the root."
  },
  {
    title: "Branches and dragging",
    body: "The minus badge collapses a branch; a number shows direct hidden children. Drag before/after to reorder, onto a body to make a child, or across the root band to change side. Toolbar and command actions provide non-drag alternatives."
  },
  {
    title: "Local save and files",
    body: "Work autosaves in this browser, not to a cloud file. Export Markdown for a durable complete copy. Markdown includes collapsed descendants; SVG and PNG reflect only the currently visible map."
  },
  {
    title: "Markdown format",
    body: "# Root, followed by indented list items, represents the tree. Standard Markdown preserves content and hierarchy, but not collapse state or viewport position."
  },
  {
    title: "Keyboard and accessibility",
    body: "The canvas is one Tab stop. Escape clears selection, then Tab leaves the canvas. Screen readers receive label, level, side, expansion and child-count context. All drag operations have command or toolbar alternatives."
  },
  {
    title: "Privacy",
    body: "Mapdown is static and local-first. Document content is not uploaded by default."
  }
];

const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export function HelpCenter({ mode, commands, onClose }: HelpCenterProps) {
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isMac = isMacPlatform();
  const definitions = useMemo(() => commands.map(({ execute: _execute, disabledReason: _reason, ...command }) => command), [commands]);
  const matchedIds = useMemo(
    () => new Set(searchCommands(query, definitions).map((command) => command.id)),
    [definitions, query]
  );
  const results = commands.filter((command) => matchedIds.has(command.id));

  useEffect(() => {
    if (mode === "search") searchRef.current?.focus();
    else headingRef.current?.focus();
  }, [mode]);

  const trapKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (
      event.key === "/" &&
      document.activeElement !== searchRef.current &&
      !(document.activeElement instanceof HTMLInputElement)
    ) {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...dialogRef.current!.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])'
      )
    ];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const groups = [...new Set(results.map((command) => command.category))];

  return (
    <div className="help-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div
        ref={dialogRef}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        aria-describedby="help-description"
        onKeyDownCapture={trapKeys}
      >
        <header className="help-header">
          <div>
            <h2 id="help-title" ref={headingRef} tabIndex={-1}>Help &amp; Commands</h2>
            <p id="help-description">Search actions, shortcuts, and editor concepts.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Help and commands">Close</button>
        </header>

        <label className="help-search">
          <span className="sr-only">Search actions and shortcuts</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search actions and shortcuts…"
          />
        </label>
        <p className="sr-only" role="status" aria-live="polite">
          {results.length} matching {results.length === 1 ? "command" : "commands"}
        </p>

        <div className="help-content">
          {!query && mode === "help" && (
            <section className="help-topics" aria-label="Help topics">
              {HELP_TOPICS.map((topic) => (
                <details key={topic.title} open={topic.title === "Getting started"}>
                  <summary>{topic.title}</summary>
                  <p>{topic.body}</p>
                </details>
              ))}
            </section>
          )}

          <section className="help-results" aria-label="Commands and shortcuts">
            {results.length === 0 ? (
              <div className="help-empty">
                <strong>No matching command</strong>
                <p>Try child, Shift Tab, zoom, Markdown, or 导出.</p>
              </div>
            ) : groups.map((group) => (
              <section key={group} aria-labelledby={`help-group-${group.replaceAll(" ", "-")}`}>
                <h3 id={`help-group-${group.replaceAll(" ", "-")}`}>{group}</h3>
                <ul className="command-list">
                  {results.filter((command) => command.category === group).map((command) => (
                    <li key={command.id}>
                      <button
                        type="button"
                        onClick={command.execute}
                        disabled={command.disabledReason !== null}
                        aria-describedby={command.disabledReason ? `reason-${command.id}` : undefined}
                      >
                        <span>
                          <strong>{command.title}</strong>
                          <small>{command.description}</small>
                          {command.disabledReason && (
                            <small id={`reason-${command.id}`} className="command-reason">
                              Unavailable: {command.disabledReason}
                            </small>
                          )}
                        </span>
                        {command.shortcuts[0] && (
                          <span
                            className="keycaps"
                            aria-label={command.shortcuts[0].accessibleKeys}
                          >
                            {platformShortcut(command.shortcuts[0], isMac).map((key) => (
                              <kbd key={key}>{key}</kbd>
                            ))}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
