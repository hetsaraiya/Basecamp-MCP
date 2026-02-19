/**
 * todo.ts — Zod schemas for normalized Basecamp Todo and TodoList.
 *
 * Todo field name mapping (raw Basecamp → normalized):
 *   content (the title text)  → title
 *   description (HTML)        → content (markdown converted by caller)
 *   app_url                   → url
 *   creator                   → author
 *
 * TodoList field name mapping (raw Basecamp → normalized):
 *   name          → title
 *   description   → content (HTML → markdown converted by caller)
 *   app_url       → url
 *   creator       → author
 */

import { z } from 'zod';

const AuthorSchema = z.object({
  name: z.string(),
  email_address: z.string().optional().default(''),
});

export const TodoSchema = z.object({
  id: z.number(),
  title: z.string(),
  author: AuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string(),
  content: z.string(),
  completed: z.boolean(),
  due_on: z.string().nullable(),
});

export type Todo = z.infer<typeof TodoSchema>;

export const TodoListSchema = z.object({
  id: z.number(),
  title: z.string(),
  author: AuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  url: z.string(),
  content: z.string().default(''),
  todos_count: z.number().optional(),
});

export type TodoList = z.infer<typeof TodoListSchema>;
