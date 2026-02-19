/**
 * attachment.ts — Zod schema for normalized Basecamp Attachment (metadata only).
 *
 * NFR-4.4: Attachment responses never include binary content.
 * Only metadata fields are returned. The `content` field is always empty string.
 *
 * Field name mapping (raw Basecamp → normalized):
 *   filename  → title
 *   app_url   → url  (deeplink to Basecamp UI, NOT the download URL)
 *   creator   → author
 */

import { z } from 'zod';

const AuthorSchema = z.object({
  name: z.string(),
  email_address: z.string().optional().default(''),
});

export const AttachmentSchema = z.object({
  id: z.number(),
  title: z.string(),
  author: AuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string(),
  content: z.string().default(''),   // Always empty — no binary content path exists (NFR-4.4)
  content_type: z.string(),
  byte_size: z.number(),
  download_url: z.string().optional(), // URL string only — NEVER fetch binary content (NFR-4.4)
});

export type Attachment = z.infer<typeof AttachmentSchema>;
