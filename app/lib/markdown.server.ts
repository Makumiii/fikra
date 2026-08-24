import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

marked.setOptions({ gfm: true, breaks: true });

const richTextOptions = {
  allowedTags: ["p", "br", "strong", "em", "del", "s", "blockquote", "code", "pre", "ul", "ol", "li", "h2", "h3", "h4", "a", "hr"],
  allowedAttributes: { a: ["href", "title", "target", "rel"], code: ["class"] },
  transformTags: { a: (_: string, attributes: Record<string, string>) => ({ tagName: "a", attribs: { ...attributes, target: "_blank", rel: "noopener noreferrer" } }) },
  allowedSchemes: ["http", "https", "mailto"],
};

export function sanitizeArticleHtml(html: string) {
  return sanitizeHtml(html, richTextOptions);
}

export function articleText(html: string) {
  const withBreaks = html.replace(/<br\s*\/?>/gi, " ").replace(/<\/(?:p|h[2-4]|li|blockquote|pre)>/gi, " ");
  return sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {}, allowedSchemes: ["http", "https", "mailto"] })
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function renderMarkdown(markdown: string) {
  const rendered = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(rendered, richTextOptions);
}

export function renderArticleHtml(html: string) {
  return sanitizeArticleHtml(html);
}
