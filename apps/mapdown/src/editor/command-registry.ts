import { SHORTCUTS, type ShortcutDefinition } from "./keymap";

export type CommandCategory =
  | "Create and edit"
  | "Navigate"
  | "Branches"
  | "History"
  | "View"
  | "Files"
  | "Help";

export interface CommandDefinition {
  id: string;
  title: string;
  description: string;
  category: CommandCategory;
  keywords: string[];
  shortcuts: ShortcutDefinition[];
}

const definition = (
  id: string,
  title: string,
  description: string,
  category: CommandCategory,
  keywords: string[]
): CommandDefinition => ({
  id,
  title,
  description,
  category,
  keywords,
  shortcuts: SHORTCUTS.filter((shortcut) => shortcut.commandId === id)
});

export const COMMANDS: CommandDefinition[] = [
  definition("edit", "Edit selected node", "Edit the current label; typing replaces selected text.", "Create and edit", ["rename", "text", "编辑", "重命名"]),
  definition("create-sibling", "Create next sibling", "Add a topic after the selected node.", "Create and edit", ["sibling", "topic", "同级", "兄弟节点"]),
  definition("create-child", "Create child", "Add a subtopic inside the selected node.", "Create and edit", ["child", "subtopic", "indent", "子节点", "缩进"]),
  definition("promote", "Promote node", "Move the selected node one level toward the root.", "Create and edit", ["outdent", "parent", "shift tab", "提升", "减少缩进"]),
  definition("delete", "Delete branch", "Delete the selected node and its descendants; undo remains available.", "Create and edit", ["remove", "backspace", "删除"]),
  definition("navigate", "Navigate nodes", "Move through the visible semantic tree with side-aware arrow keys.", "Navigate", ["arrow", "parent", "child", "方向键", "导航"]),
  definition("root", "Go to root", "Select the root node.", "Navigate", ["home", "top", "根节点"]),
  definition("toggle-collapse", "Collapse or expand branch", "Hide or reveal a branch's visible descendants.", "Branches", ["space", "fold", "收起", "展开"]),
  definition("reorder-before", "Move before previous sibling", "Move the selected branch one semantic position earlier.", "Branches", ["reorder", "up", "前移"]),
  definition("reorder-after", "Move after next sibling", "Move the selected branch one semantic position later.", "Branches", ["reorder", "down", "后移"]),
  definition("reparent-previous", "Move into previous sibling", "Make the selected branch the last child of its previous sibling.", "Branches", ["reparent", "nest", "parent", "移入"]),
  definition("reparent-next", "Move into next sibling", "Make the selected branch the first child of its next sibling.", "Branches", ["reparent", "nest", "parent", "移入"]),
  definition("move-side", "Move first-level branch left or right", "Move a first-level branch across the root in two-sided layout.", "Branches", ["side", "left", "right", "换侧", "左侧", "右侧"]),
  definition("undo", "Undo", "Undo the latest semantic change.", "History", ["history", "撤销"]),
  definition("redo", "Redo", "Redo the latest undone semantic change.", "History", ["history", "重做"]),
  definition("fit", "Fit map", "Show every visible node in the viewport.", "View", ["zoom", "viewport", "适应"]),
  definition("center", "Center selection", "Center the selected node, or the root when none is selected.", "View", ["viewport", "root", "居中"]),
  definition("reset-zoom", "Reset zoom to 100%", "Return the canvas to actual size without changing its centre.", "View", ["zoom", "actual size", "100 percent", "缩放", "原始大小"]),
  definition("toggle-layout", "Toggle layout", "Switch between right-only and two-sided layout.", "View", ["two sided", "right only", "布局", "双侧"]),
  definition("open-markdown", "Open Markdown", "Import a Markdown outline as a new local map.", "Files", ["import", "file", "open", "导入", "打开"]),
  definition("export-markdown", "Export Markdown", "Download the complete semantic tree, including collapsed descendants.", "Files", ["save", "download", "markdown", "导出"]),
  definition("export-svg", "Export SVG", "Download the current visible map as a vector image.", "Files", ["image", "vector", "导出"]),
  definition("export-png", "Export PNG", "Download the current visible map as a bitmap image.", "Files", ["image", "bitmap", "导出"]),
  definition("help", "Help and shortcuts", "Browse editor concepts and the canonical shortcut list.", "Help", ["shortcuts", "documentation", "帮助", "快捷键"]),
  definition("command-center", "Search commands", "Find commands, shortcuts, and disabled reasons.", "Help", ["palette", "search", "命令", "搜索"])
];

const normalize = (value: string) =>
  value.toLocaleLowerCase().replace(/[⌘⇧⌥]/g, " ").replace(/\s+/g, " ").trim();

export function searchCommands(query: string, commands = COMMANDS): CommandDefinition[] {
  const needle = normalize(query);
  if (!needle) return commands;
  return commands
    .map((command, index) => {
      const title = normalize(command.title);
      const shortcutText = command.shortcuts.flatMap((item) => [
        item.accessibleKeys,
        ...item.searchKeys,
        item.keys.join(" ")
      ]);
      const fields = [
        ...command.keywords,
        ...shortcutText,
        command.description,
        command.category
      ].map(normalize);
      const score =
        title === needle ? 0 :
        title.startsWith(needle) ? 1 :
        fields.some((field) => field === needle || field.startsWith(needle)) ? 2 :
        [title, ...fields].some((field) => field.includes(needle)) ? 3 :
        99;
      return { command, score, index };
    })
    .filter((entry) => entry.score < 99)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((entry) => entry.command);
}

export function platformShortcut(shortcut: ShortcutDefinition, isMac: boolean): string[] {
  return shortcut.keys.map((key) => key === "Primary" ? (isMac ? "⌘" : "Ctrl") : key);
}
