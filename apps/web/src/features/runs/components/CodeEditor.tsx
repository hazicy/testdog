'use client';

import studioStyles from '@/features/runs/components/run-studio.module.css';

import { useEffect, useMemo, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
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
  readOnly = false,
  label = 'Playwright 录制脚本',
}: {
  value: string;
  label?: string;
  onChange: (code: string) => void;
  readOnly?: boolean;
}) {
  const parent = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>(null);
  const changed = useRef(onChange);
  const editing = useMemo(() => new Compartment(), []);

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
          editing.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          javascript(),
          syntaxHighlighting(defaultHighlightStyle),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.contentAttributes.of({
            'aria-label': label,
            spellcheck: 'false',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) changed.current(update.state.doc.toString());
          }),
          EditorView.theme({
            '&': { backgroundColor: 'var(--surface)', fontSize: 'var(--text-md)', height: '100%' },
            '.cm-scroller': {
              fontFamily: 'var(--font-geist-mono), monospace',
              lineHeight: '1.8',
              overflow: 'auto',
            },
            '.cm-content': { padding: 'var(--space-4) 0' },
            '.cm-line': { padding: '0 var(--space-4)' },
            '.cm-gutters': {
              backgroundColor: 'var(--surface)',
              color: 'var(--editor-gutter)',
              borderRight: 'none',
              paddingRight: 'var(--space-2)',
            },
            '.cm-activeLine': { backgroundColor: 'var(--editor-active-line)' },
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
    editor.current?.dispatch({
      effects: editing.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [editing, readOnly]);
  useEffect(() => {
    const view = editor.current;

    if (view && value !== view.state.doc.toString())
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={parent} className={studioStyles.recordingCodeEditor} />;
}
