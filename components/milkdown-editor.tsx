'use client';

import { defaultValueCtx, Editor, rootCtx } from '@milkdown/kit/core';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import { nord } from '@milkdown/theme-nord';
import { useEffect, useRef } from 'react';

// eslint-disable-next-line import/no-unassigned-import -- A stylesheet has nothing to bind.
import '@milkdown/theme-nord/style.css';
// eslint-disable-next-line import/no-unassigned-import -- A stylesheet has nothing to bind.
import '@/components/milkdown.css';

type MilkdownEditorProperties = {
  /**
   * Read once, when the editor is created. To show other text, such as a restored version, give the editor a new key so that React creates it again.
   */
  readonly initialValue: string;
  readonly onChange: (markdown: string) => void;
};

function InnerEditor({ initialValue, onChange }: MilkdownEditorProperties) {
  /**
   * The editor is created once, so it would keep calling the onChange of the first render. Calling it through a ref always reaches the newest one.
   */
  const onChangeReference = useRef(onChange);
  useEffect(() => {
    onChangeReference.current = onChange;
  });

  useEditor(
    (root) =>
      Editor.make()
        .config(nord)
        .config((context) => {
          context.set(rootCtx, root);
          context.set(defaultValueCtx, initialValue);
          context.get(listenerCtx).markdownUpdated((_, markdown, previousMarkdown) => {
            if (markdown !== previousMarkdown) {
              onChangeReference.current(markdown);
            }
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(clipboard)
        .use(listener),
    /**
     * Empty, so that the editor is created only once. initialValue is read only then, as explained above.
     */
    [],
  );

  return <Milkdown />;
}

/**
 * A WYSIWYG editor that reads and writes markdown: CommonMark plus GitHub's tables, task lists, and strikethrough, with undo and pasting. It came from the NeighborNotes app.
 *
 * It touches the DOM when it is created, so it must be loaded with next/dynamic and ssr: false, as components/notes-page.tsx does.
 */
export default function MilkdownEditor(properties: MilkdownEditorProperties) {
  return (
    <MilkdownProvider>
      <InnerEditor {...properties} />
    </MilkdownProvider>
  );
}
