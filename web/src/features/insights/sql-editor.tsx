import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo, useRef } from "react";

const theme = EditorView.theme({
  "&": {
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "12.5px",
  },
  ".cm-content": {
    fontFamily: "var(--font-mono)",
    padding: "12px 0",
    caretColor: "var(--foreground)",
  },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--subtle-foreground)",
    border: "none",
    fontFamily: "var(--font-mono)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--primary) 30%, transparent) !important",
  },
  ".cm-cursor": { borderLeftColor: "var(--foreground)" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--foreground)",
  },
  ".cm-placeholder": { color: "var(--subtle-foreground)" },
});

const highlight = HighlightStyle.define([
  { tag: t.keyword, color: "var(--primary)", fontWeight: "500" },
  { tag: [t.string, t.special(t.string)], color: "var(--series-3)" },
  { tag: [t.number, t.bool, t.null], color: "var(--series-2)" },
  { tag: t.comment, color: "var(--subtle-foreground)", fontStyle: "italic" },
  { tag: [t.operator, t.punctuation], color: "var(--muted-foreground)" },
  { tag: t.typeName, color: "var(--series-7)" },
]);

export const EVENTS_SCHEMA = {
  events: ["uuid", "event", "distinct_id", "properties", "timestamp"],
};

export function SqlEditor({
  value,
  onChange,
  onRun,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
}) {
  const runRef = useRef(onRun);
  runRef.current = onRun;

  const extensions = useMemo(
    () => [
      sql({ dialect: PostgreSQL, schema: EVENTS_SCHEMA, upperCaseKeywords: false }),
      theme,
      syntaxHighlighting(highlight),
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              runRef.current();
              return true;
            },
          },
        ]),
      ),
    ],
    [],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="none"
      minHeight="180px"
      maxHeight="420px"
      placeholder="SELECT event, count(*) FROM events GROUP BY 1 ORDER BY 2 DESC"
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: true,
        bracketMatching: true,
      }}
    />
  );
}
