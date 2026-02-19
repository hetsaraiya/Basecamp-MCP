/**
 * html-to-markdown.ts — Converts Basecamp HTML rich-text content to Markdown.
 *
 * Uses node-html-parser for a single-pass DOM traversal. Handles standard
 * HTML elements and Basecamp-specific custom tags.
 *
 * Enforces:
 *   NFR-3.1: Standard HTML converted to Markdown equivalents
 *   NFR-3.2: Basecamp-specific tags (bc-attachment, mention, bc-gallery) converted to readable refs
 *   NFR-3.3: No HTML angle brackets remain in output — safety net regex applied after pass
 */

import { parse, type HTMLElement } from 'node-html-parser';

/**
 * Converts a node-html-parser HTMLElement tree to Markdown text.
 * Handles both element and text nodes recursively.
 */
function nodeToMarkdown(node: HTMLElement | ReturnType<typeof parse>): string {
  // Text node — return text content directly
  if (node.nodeType === 3) {
    // Node.TEXT_NODE = 3
    return node.rawText ?? '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName?.toLowerCase() ?? '';

  // Basecamp-specific tags (NFR-3.2) — handle before generic unknown-tag fallback
  if (tag === 'bc-attachment') {
    const filename = el.getAttribute('filename') ?? '';
    const contentType = el.getAttribute('content-type') ?? '';
    if (filename || contentType) {
      return `[Attachment: ${filename} (${contentType})]`;
    }
    return '[Attachment]';
  }

  if (tag === 'mention') {
    const name = el.innerText.trim();
    return `[@${name}]`;
  }

  if (tag === 'bc-gallery') {
    return '[Gallery]';
  }

  // Standard HTML → Markdown (NFR-3.1)
  const inner = () => el.childNodes.map((child) => nodeToMarkdown(child as HTMLElement)).join('');

  switch (tag) {
    case 'strong':
    case 'b':
      return `**${inner()}**`;

    case 'em':
    case 'i':
      return `*${inner()}*`;

    case 'a': {
      const href = el.getAttribute('href') ?? '';
      return `[${inner()}](${href})`;
    }

    case 'h1':
      return `# ${inner()}\n\n`;
    case 'h2':
      return `## ${inner()}\n\n`;
    case 'h3':
      return `### ${inner()}\n\n`;

    case 'ul': {
      const items = el.querySelectorAll('li').map((li) => `- ${li.innerText.trim()}`).join('\n');
      return items + '\n';
    }

    case 'ol': {
      const liNodes = el.querySelectorAll('li');
      const items = liNodes.map((li, idx) => `${idx + 1}. ${li.innerText.trim()}`).join('\n');
      return items + '\n';
    }

    case 'li':
      // Only reached if li is processed outside of ul/ol context — rare
      return `- ${inner()}\n`;

    case 'p':
      return `${inner()}\n\n`;

    case 'br':
      return '\n';

    case 'code':
      return `\`${inner()}\``;

    case 'pre':
      return `\`\`\`\n${inner()}\n\`\`\``;

    case 'blockquote':
      return `> ${inner()}`;

    case 'hr':
      return '---\n';

    case 'div':
    case 'span':
    case 'section':
    case 'article':
    case 'header':
    case 'footer':
    case 'main':
    case 'aside':
    case 'nav':
    case '': // root / document node
      // Pass through — render children
      return inner();

    default:
      // Unknown tags: strip tag, keep inner text (NFR-3.1: "strip all other unknown tags")
      return inner();
  }
}

/**
 * Converts an HTML string (including Basecamp-specific tags) to Markdown.
 *
 * @param html  HTML string, null, or undefined
 * @returns     Markdown string. Empty string on null/undefined/empty input.
 *              Guaranteed to contain no HTML angle brackets (NFR-3.3).
 */
export function htmlToMarkdown(html: string | null | undefined): string {
  const input = html ?? '';
  if (!input.trim()) return '';

  const root = parse(input, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: {
      script: false,
      noscript: false,
      style: false,
    },
  });

  let result = nodeToMarkdown(root as unknown as HTMLElement);

  // NFR-3.3: Safety net — strip any remaining HTML tags that weren't handled above
  result = result.replace(/<[^>]+>/g, '');

  // Normalize excessive blank lines (3+ newlines → 2)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}
