'use client';
import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { defaultHighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
export function CodeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>(null);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!parent.current) return;
    const view = new EditorView({
      parent: parent.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          javascript(),
          syntaxHighlighting(defaultHighlightStyle),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            'aria-label': 'Playwright 录制脚本',
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString());
          }),
          EditorView.theme({
            '&': { backgroundColor: '#fffefa', fontSize: '12px', minHeight: '400px' },
            '.cm-scroller': {
              fontFamily: 'var(--font-geist-mono), monospace',
              lineHeight: '1.9',
              maxHeight: '650px',
              overflow: 'auto',
            },
            '.cm-content': { padding: '16px 0' },
            '.cm-gutters': {
              backgroundColor: '#f5f4ee',
              color: '#999482',
              borderRight: '1px solid #e2e1da',
            },
            '.cm-activeLine': { backgroundColor: '#f7f3e9' },
            '&.cm-focused': { outline: 'none' },
          }),
        ],
      }),
    });
    editor.current = view;
    return () => {
      editor.current = null;
      view.destroy();
    };
    // The initial document is set once; subsequent external changes are dispatched below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (view && value !== view.state.doc.toString())
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={parent} className="min-w-0 border border-page-line" />;
}
