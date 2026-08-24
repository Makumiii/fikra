import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  Code,
  LinkBreak,
  LinkSimple,
  ListBullets,
  ListNumbers,
  Minus,
  Quotes,
  TextB,
  TextH,
  TextItalic,
  TextStrikethrough,
} from "@phosphor-icons/react";
import "./article-editor.css";

interface ArticleEditorProps {
  initialContent: string;
  onChange: (html: string) => void;
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <button type="button" className={`article-editor-button${active ? " active" : ""}`} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick} title={label}>{children}</button>;
}

function normalizeLink(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:", "mailto:"].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function ArticleEditor({ initialContent, onChange }: ArticleEditorProps) {
  const [characterCount, setCharacterCount] = useState(0);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Placeholder.configure({ placeholder: "Start with the useful bit..." }),
    ],
    content: initialContent,
    onCreate: ({ editor: createdEditor }) => {
      setCharacterCount(createdEditor.getText().length);
      createdEditor.view.dom.setAttribute("aria-label", "Article body");
    },
    onUpdate: ({ editor: updatedEditor }) => {
      setCharacterCount(updatedEditor.getText().length);
      onChange(updatedEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute("aria-label", "Article body");
    if (editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent, { emitUpdate: false });
      setCharacterCount(editor.getText().length);
    }
  }, [editor, initialContent]);

  function setLink() {
    if (!editor) return;
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const value = window.prompt("Paste a link", "https://");
    if (value === null) return;
    const href = normalizeLink(value);
    if (!href) {
      window.alert("Use an http, https, or mailto link.");
      return;
    }
    editor.chain().focus().setLink({ href }).run();
  }

  const disabled = !editor;
  return <section className="article-editor" aria-label="Article editor">
    <div className="article-editor-toolbar" role="toolbar" aria-label="Article formatting">
      <div className="article-editor-group">
        <ToolbarButton label="Heading 2" disabled={disabled} active={Boolean(editor?.isActive("heading", { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><TextH size={18} /><span>2</span></ToolbarButton>
        <ToolbarButton label="Heading 3" disabled={disabled} active={Boolean(editor?.isActive("heading", { level: 3 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}><TextH size={18} /><span>3</span></ToolbarButton>
        <ToolbarButton label="Paragraph" disabled={disabled} active={Boolean(editor?.isActive("paragraph"))} onClick={() => editor?.chain().focus().setParagraph().run()}><span className="article-editor-text-icon">P</span></ToolbarButton>
      </div>
      <div className="article-editor-group">
        <ToolbarButton label="Bold" disabled={disabled} active={Boolean(editor?.isActive("bold"))} onClick={() => editor?.chain().focus().toggleBold().run()}><TextB size={18} /></ToolbarButton>
        <ToolbarButton label="Italic" disabled={disabled} active={Boolean(editor?.isActive("italic"))} onClick={() => editor?.chain().focus().toggleItalic().run()}><TextItalic size={18} /></ToolbarButton>
        <ToolbarButton label="Strikethrough" disabled={disabled} active={Boolean(editor?.isActive("strike"))} onClick={() => editor?.chain().focus().toggleStrike().run()}><TextStrikethrough size={18} /></ToolbarButton>
      </div>
      <div className="article-editor-group">
        <ToolbarButton label="Bulleted list" disabled={disabled} active={Boolean(editor?.isActive("bulletList"))} onClick={() => editor?.chain().focus().toggleBulletList().run()}><ListBullets size={18} /></ToolbarButton>
        <ToolbarButton label="Numbered list" disabled={disabled} active={Boolean(editor?.isActive("orderedList"))} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListNumbers size={18} /></ToolbarButton>
        <ToolbarButton label="Blockquote" disabled={disabled} active={Boolean(editor?.isActive("blockquote"))} onClick={() => editor?.chain().focus().toggleBlockquote().run()}><Quotes size={18} /></ToolbarButton>
        <ToolbarButton label="Code block" disabled={disabled} active={Boolean(editor?.isActive("codeBlock"))} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}><Code size={18} /></ToolbarButton>
      </div>
      <div className="article-editor-group">
        <ToolbarButton label={editor?.isActive("link") ? "Remove link" : "Add link"} disabled={disabled} active={Boolean(editor?.isActive("link"))} onClick={setLink}>{editor?.isActive("link") ? <LinkBreak size={18} /> : <LinkSimple size={18} />}</ToolbarButton>
        <ToolbarButton label="Horizontal rule" disabled={disabled} onClick={() => editor?.chain().focus().setHorizontalRule().run()}><Minus size={18} /></ToolbarButton>
      </div>
      <div className="article-editor-group article-editor-history">
        <ToolbarButton label="Undo" disabled={!editor || !editor.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><ArrowUUpLeft size={18} /></ToolbarButton>
        <ToolbarButton label="Redo" disabled={!editor || !editor.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><ArrowUUpRight size={18} /></ToolbarButton>
      </div>
    </div>
    <EditorContent editor={editor} className="article-editor-surface" />
    <footer className="article-editor-footer"><span>Rich text, links, lists, quotes, and code blocks</span><span>{characterCount.toLocaleString()} characters</span></footer>
  </section>;
}
