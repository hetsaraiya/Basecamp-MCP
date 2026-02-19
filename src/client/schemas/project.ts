/**
 * project.ts — Zod schema for normalized Basecamp Project.
 *
 * Field name mapping (raw Basecamp → normalized):
 *   name       → title
 *   app_url    → url
 *   creator    → author
 *   description → description (plain text, not HTML)
 */

import { z } from 'zod';

const AuthorSchema = z.object({
  name: z.string(),
  email_address: z.string().optional().default(''),
});

export const ProjectSchema = z.object({
  id: z.number(),
  title: z.string(),
  author: AuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string(),
  status: z.string(),
  description: z.string().default(''),
});

export type Project = z.infer<typeof ProjectSchema>;
