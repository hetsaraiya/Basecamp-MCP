/**
 * schemas/index.ts — Re-exports all Basecamp content-type schemas and TypeScript types.
 *
 * Import from this file for all schema/type access:
 *   import { ProjectSchema, Project, MessageSchema, Message, ... } from '../schemas/index.js';
 */

export { ProjectSchema } from './project.js';
export type { Project } from './project.js';

export { MessageSchema } from './message.js';
export type { Message } from './message.js';

export { TodoSchema, TodoListSchema } from './todo.js';
export type { Todo, TodoList } from './todo.js';

export { DocumentSchema, DocumentSummarySchema } from './document.js';
export type { Document, DocumentSummary } from './document.js';

export { CampfireLineSchema } from './campfire.js';
export type { CampfireLine } from './campfire.js';

export { AttachmentSchema } from './attachment.js';
export type { Attachment } from './attachment.js';
