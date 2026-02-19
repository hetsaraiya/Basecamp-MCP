/**
 * message.ts — Zod schema for normalized Basecamp Message (board post).
 *
 * Field name mapping (raw Basecamp → normalized):
 *   subject    → title
 *   content    → content (HTML → markdown converted by caller)
 *   app_url    → url
 *   creator    → author
 */

import { z } from 'zod';

const AuthorSchema = z.object({
  name: z.string(),
  email_address: z.string().optional().default(''),
});

export const MessageSchema = z.object({
  id: z.number(),
  title: z.string(),
  author: AuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string(),
  content: z.string(),
  replies_count: z.number().optional().default(0),
});

export type Message = z.infer<typeof MessageSchema>;
