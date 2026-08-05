# Mapdown Interaction State Machine

This is the executable interaction model for the production editor. The normative source
documents remain `spec/interaction.md` and `spec/keyboard.md`; this table brings their rules
together so implementation, Help copy and browser tests can be checked against one model.

## 1. State shape

Mapdown does not have one flat state enum. Four independent axes avoid impossible combinations
and make transition priority explicit.

| Axis | States | Owns |
|---|---|---|
| Primary editing mode | `Idle`, `Node selected`, `Node editing`, `IME composing` | selection, caret, text vs. structural key meaning |
| Pointer gesture | `None`, `Canvas panning`, `Node dragging` | temporary pointer capture and drop resolution |
| Overlay | `None`, `Toolbar menu`, `Help`, `Command Center`, `File picker` | focus trap and shortcut priority |
| Persistence | `Idle`, `Unsaved`, `Saving`, `Saved`, `Failed` | local snapshot status only; never changes editing semantics |

`IME composing` is a substate of `Node editing`. Pointer and overlay states temporarily take
priority over the primary mode without erasing the selected node. Pan and zoom never enter
semantic history.

## 2. Primary modes

| Mode | Invariant | Keyboard owner | Visible focus |
|---|---|---|---|
| `Idle` | no selected node, no textarea | application/canvas | canvas |
| `Node selected` | exactly one selected node, no textarea | structural keymap | canvas |
| `Node editing` | selected node equals editing node; one draft and one history `groupId` | native text editing first, then documented editing commands | overlaid textarea |
| `IME composing` | all `Node editing` invariants plus active composition | IME/browser | overlaid textarea |

## 3. Enter is mode-dependent

| Current state | Guard | Enter action | Next state | History/document result |
|---|---|---|---|---|
| `Idle` | — | no map action | `Idle` | unchanged |
| `Node selected` | selected node is root | create last first-level child and edit it | `Node editing` | one creation group |
| `Node selected` | selected non-root node | create next sibling and edit it | `Node editing` | one creation group |
| `Node editing` | existing node, or new node with non-empty text/children | commit the current draft only | `Node selected` | one coalesced editing group; no node created |
| `Node editing` | newly created empty leaf | no-op; do not create another empty node | `Node editing` | unchanged |
| `IME composing` | browser/guard reports composition ownership | confirm IME candidate only | `Node editing` or `IME composing` | no structural command |
| modal/command search | overlay owns Enter | activate the focused modal action | overlay-defined | no canvas Enter action |

This creates a deliberate two-step authoring loop: Enter saves text; a second Enter, now in
`Node selected`, creates the next sibling. `Shift+Enter` remains reserved and has no structural
action.

## 4. Primary transition table

| Current state | Event | Guard | Action | Next state |
|---|---|---|---|---|
| `Idle` | click node | — | select node | `Node selected` |
| `Node selected` | printable input | no command modifier | replace label with first input and start a grouped draft | `Node editing` |
| `Node selected` | double-click node text | — | open textarea with caret after existing text | `Node editing` |
| `Node selected` | `F2` | — | open textarea and select all text | `Node editing` |
| `Node selected` | `Enter` | — | create sibling/root child | `Node editing` |
| `Node selected` | `Tab` | — | create child | `Node editing` |
| `Node selected` | `Shift+Tab` | promotable | promote branch | `Node selected` |
| `Node selected` | arrows/Home | target exists | move semantic selection | `Node selected` |
| `Node selected` | `Space` | branch has children | toggle collapse | `Node selected` |
| `Node selected` | Delete/Backspace | non-root | delete subtree and select fallback | `Node selected` or `Idle` |
| `Node selected` | `Escape` | — | clear selection | `Idle` |
| `Node editing` | text/paste/caret keys | not composing command | update draft and live geometry | `Node editing` |
| `Node editing` | `Enter` | non-empty/structural node | commit only | `Node selected` |
| `Node editing` | `Enter` | new empty leaf | no-op | `Node editing` |
| `Node editing` | `Tab` | — | commit; create child | `Node editing` on child |
| `Node editing` | `Shift+Tab` | promotable | commit; promote | `Node selected` |
| `Node editing` | `Escape` | existing/non-empty | commit and exit | `Node selected` |
| `Node editing` | `Escape` | new empty leaf | remove creation group; restore anchor | `Node selected` |
| `Node editing` | click another node | — | commit, or remove new empty leaf; select target | `Node selected` |
| `Node editing` | click blank | — | commit, or remove new empty leaf; clear selection | `Idle` |
| `Node editing` | open application modal | — | commit draft before focus leaves | modal overlay |
| any non-modal mode | `Primary+0` | — | set canvas zoom to 100%; preserve viewport centre | same primary mode |

## 5. Pointer and overlay states

| State | Entry | Commit | Cancel | Semantic history |
|---|---|---|---|---|
| `Canvas panning` | blank pointer drag | pointer release keeps viewport | pointer cancel ends gesture | none |
| `Node dragging` | selected-node drag passes threshold | valid before/after/inside/side drop applies one move | Escape, invalid drop or pointer cancel restores original structure | one move group on valid drop only |
| toolbar menu | activate toolbar menu | chosen command decides | Escape/outside click restores invoker focus | command-dependent |
| Help/Command Center | Help button, `Primary+/`, `Primary+K` | executable command decides | Escape/close restores invoker focus | command-dependent |
| file picker | Open Markdown | valid parse replaces document after confirmation | cancel/invalid parse leaves document intact | replacement starts a fresh history |

Overlay focus rules run before IME, editing and canvas shortcuts. Application-level
`Primary+0` is available in normal editing modes, including while the textarea is active, but
does not override an open modal.

## 6. Draft, history and persistence

| Event | Live node/layout | Semantic history | Autosave snapshot |
|---|---|---|---|
| character typed | derived from current draft immediately | unchanged | includes current draft after debounce |
| Enter/Escape/blur commit | committed text | one entry for the entire editing session | includes committed document |
| cancel new empty leaf | node removed | creation group removed | includes resulting document |
| undo during an active existing-node draft | draft is abandoned | prior unrelated entry is not consumed | next snapshot follows resulting document |
| `visibilitychange` / `pagehide` | unchanged | unchanged | flushes latest visible draft |

The saved indicator describes the latest visible document snapshot, including the active draft.
It must never say “Saved on this device” for text that exists only in an unscheduled textarea
state.

## 7. Export and viewport rules

| Action | Content source | Filename | History effect |
|---|---|---|---|
| Export Markdown | complete semantic tree plus active visible draft | sanitized root-node label + `.md`; `mind-map.md` fallback | none |
| Export SVG | current visible/collapsed projection plus active visible draft | sanitized root-node label + `.svg`; fallback as above | none |
| Export PNG | same visible projection as SVG | sanitized root-node label + `.png`; fallback as above | none |
| `Primary+0` / Reset zoom | current viewport | — | scale becomes `1`; centre and document unchanged |

## 8. Regression gates

1. Editing text and pressing Enter changes no node count.
2. Pressing Enter again from the selected state increases node count by exactly one.
3. A new empty leaf cannot multiply through repeated Enter.
4. IME-confirmation Enter never commits a structural command.
5. All three downloads use the current root label, including an active root draft.
6. `Primary+0` works while selected and while editing, preserves the viewport centre, and never
   changes undo/redo state.
