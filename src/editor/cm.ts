// CodeMirror: tema que segue as variáveis CSS do tema do app, realce de sintaxe e linguagens sob demanda.
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import type { Lang } from './lang';

export const cmTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--surface)', color: 'var(--ink)', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--ink)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--ink)' },
  '.cm-gutters': { backgroundColor: 'var(--raised)', color: 'var(--ink-dim)', border: 'none', borderRight: '1px solid var(--line)' },
  '.cm-activeLine': { backgroundColor: 'var(--accent-a20)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--accent-a20)', color: 'var(--ink)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: 'var(--accent-a46) !important' },
  '.cm-panels': { backgroundColor: 'var(--raised)', color: 'var(--ink)' },
  '.cm-panels input, .cm-panels button': { fontFamily: 'var(--font-ui)' },
  '.cm-searchMatch': { backgroundColor: 'var(--accent-a46)' },
  '.cm-tooltip': { backgroundColor: 'var(--raised)', border: '1px solid var(--line)', color: 'var(--ink)' },
}, { dark: true });

export const cmHighlight = syntaxHighlighting(HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier, t.definitionKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--syn-string)' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: 'var(--syn-comment)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--syn-number)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--syn-func)' },
  { tag: [t.typeName, t.className, t.tagName, t.attributeName], color: 'var(--syn-type)' },
  { tag: [t.heading, t.strong], color: 'var(--syn-heading)' },
  { tag: [t.link, t.url], color: 'var(--syn-type)', textDecoration: 'underline' },
  { tag: t.emphasis, fontStyle: 'italic' },
]));

export async function langExtension(l: Lang): Promise<Extension> {
  switch (l) {
    case 'markdown': return (await import('@codemirror/lang-markdown')).markdown();
    case 'typescript': return (await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true });
    case 'javascript': return (await import('@codemirror/lang-javascript')).javascript({ jsx: true });
    case 'json': return (await import('@codemirror/lang-json')).json();
    case 'python': return (await import('@codemirror/lang-python')).python();
    case 'rust': return (await import('@codemirror/lang-rust')).rust();
    case 'css': return (await import('@codemirror/lang-css')).css();
    case 'html': return (await import('@codemirror/lang-html')).html();
    case 'powershell': {
      const { StreamLanguage } = await import('@codemirror/language');
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/powershell')).powerShell);
    }
    case 'yaml': {
      const { StreamLanguage } = await import('@codemirror/language');
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/yaml')).yaml);
    }
    case 'sql': {
      const { StreamLanguage } = await import('@codemirror/language');
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/sql')).standardSQL);
    }
    case 'shell': {
      const { StreamLanguage } = await import('@codemirror/language');
      return StreamLanguage.define((await import('@codemirror/legacy-modes/mode/shell')).shell);
    }
    default: return [];
  }
}
