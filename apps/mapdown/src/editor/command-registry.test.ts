import { describe, expect, it } from "vitest";
import { COMMANDS, platformShortcut, searchCommands } from "./command-registry";
import { SHORTCUTS } from "./keymap";

describe("Help command registry", () => {
  it("finds canonical commands by concept, localized synonym, and shortcut", () => {
    expect(searchCommands("child")[0]?.id).toBe("create-child");
    expect(searchCommands("子节点")[0]?.id).toBe("create-child");
    expect(searchCommands("Shift Tab")[0]?.id).toBe("promote");
    expect(searchCommands("Command 0")[0]?.id).toBe("reset-zoom");
  });

  it("attaches every displayed shortcut to a registered command", () => {
    const ids = new Set(COMMANDS.map((command) => command.id));
    expect(SHORTCUTS.every((shortcut) => ids.has(shortcut.commandId))).toBe(true);
    expect(COMMANDS.flatMap((command) => command.shortcuts)).toHaveLength(SHORTCUTS.length);
  });

  it("renders platform-specific Primary labels without changing the registry", () => {
    const undo = COMMANDS.find((command) => command.id === "undo")!.shortcuts[0]!;
    expect(platformShortcut(undo, true)).toEqual(["⌘", "Z"]);
    expect(platformShortcut(undo, false)).toEqual(["Ctrl", "Z"]);
  });
});
