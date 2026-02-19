/**
 * campfire.ts — Zod schema for normalized Basecamp Campfire chat line.
 *
 * Field name mapping (raw Basecamp → normalized):
 *   (no title field on campfire lines) → title defaults to ''
 *   content (HTML)  → content (markdown converted by caller)
 *   app_url         → url
 *   creator         → author
 */

import { z } from 'zod';

const AuthorSchema = z.object({
  name: z.string(),
  email_address: z.string().optional().default(''),
});

export const CampfireLineSchema = z.object({
  id: z.number(),
  title: z.string().default(''),
  author: AuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string(),
  content: z.string(),
});

export type CampfireLine = z.infer<typeof CampfireLineSchema>;
