/**
 * document.ts — Zod schemas for normalized Basecamp Document.
 *
 * Field name mapping (raw Basecamp → normalized):
 *   title    → title (same field name)
 *   content  → content (HTML → markdown converted by caller)
 *   app_url  → url
 *   creator  → author
 *
 * Two schemas:
 *   DocumentSchema        — full content (for get_document)
 *   DocumentSummarySchema — content truncated to 500 chars (for list_documents, NFR-4.3)
 */

import { z } from 'zod';

const AuthorSchema = z.object({
  name: z.string(),
  email_address: z.string().optional().default(''),
});

export const DocumentSchema = z.object({
  id: z.number(),
  title: z.string(),
  author: AuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string(),
  content: z.string(),
});

export type Document = z.infer<typeof DocumentSchema>;

/**
 * DocumentSummarySchema — used for list_documents responses.
 * Content is truncated to 500 characters to keep list payloads compact (NFR-4.3).
 * Full content is only available via get_document using DocumentSchema.
 */
export const DocumentSummarySchema = DocumentSchema.extend({
  content: z.string().transform((c) => c.slice(0, 500)),
  truncated: z.boolean().optional().default(true),
});

export type DocumentSummary = z.infer<typeof DocumentSummarySchema>;
