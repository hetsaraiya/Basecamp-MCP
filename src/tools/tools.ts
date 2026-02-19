/**
 * tools.ts — createTools() factory for all Phase 3 MCP tools.
 *
 * Architecture decision (STATE.md 2026-02-19):
 *   createTools(userId, tokenStore) is called once per MCP session.
 *   Phase 3 uses BASECAMP_TEST_USER_ID env var; Phase 4 passes per-session userId.
 *   The McpServer instance is created inside this factory and returned for transport wiring.
 *
 * Tool pattern:
 *   1. Parse and validate inputs with zod (z.object inputSchema)
 *   2. Call tokenStore.get(userId) to obtain credentials
 *   3. Construct BasecampClient(credentials)
 *   4. Call the appropriate client method
 *   5. Return toolSuccess(result) or classifyError(error)
 *
 * Dock lookup pattern (FR-2.4, decided 2026-02-19):
 *   Tools that need internal Basecamp IDs call client.getProject(projectId)
 *   and find dock items by `name` field (NOT `type`). Values: 'message_board',
 *   'todoset', 'vault', 'chat'. A disabled dock item returns TOOL_NOT_ENABLED.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BasecampClient } from '../client/BasecampClient.js';
import { TokenStore } from '../auth/store.js';
import { toolError, toolSuccess, classifyError } from './errors.js';
import { htmlToMarkdown } from '../client/html-to-markdown.js';
import { MessageSchema, TodoSchema } from '../client/schemas/index.js';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createTools(userId: number, tokenStore: TokenStore): McpServer {
  const server = new McpServer({
    name: 'basecamp-mcp',
    version: '1.0.0',
  });

  // -------------------------------------------------------------------------
  // list_projects — FR-2.1, FR-2.2, FR-2.3
  // -------------------------------------------------------------------------
  server.registerTool(
    'list_projects',
    {
      description: 'List all Basecamp projects accessible to the authenticated user. Returns project IDs, names, descriptions, statuses, and which tools (messages, todos, docs, campfire) are active in each project. Use project_id from results to call other tools.',
      inputSchema: {
        status: z.enum(['active', 'archived', 'all']).optional().default('active').describe(
          'Filter by project status. "active" (default) returns only active projects. "archived" returns archived only. "all" returns both.'
        ),
        page: z.number().int().positive().optional().default(1).describe(
          'Page number for pagination. Check has_more in response to determine if more pages exist.'
        ),
      },
    },
    async ({ status, page }) => {
      try {
        const record = tokenStore.get(userId);
        if (!record) return toolError('TOKEN_EXPIRED', 'No token found for user. Re-authenticate at /oauth/start', false);
        const client = new BasecampClient({ accessToken: record.accessToken, accountId: record.accountId });
        const result = await client.listProjects(page);
        // Apply status filter (Basecamp API returns all statuses, we filter client-side for 'active'/'archived')
        const items = status === 'all'
          ? result.items
          : result.items.filter((p) => p.status === (status === 'active' ? 'active' : 'archived'));
        return toolSuccess({ ...result, items });
      } catch (error) {
        return classifyError(error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_project_tools — FR-2.4
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_project_tools',
    {
      description: 'Get the internal tool IDs for a Basecamp project. Returns message_board_id, todoset_id, vault_id, and chat_id needed to call content tools. Also shows which tools are currently enabled. Always call this before calling list_messages, list_todolists, list_documents, or list_campfire_lines for a project you have not queried before.',
      inputSchema: {
        project_id: z.number().int().positive().describe('The Basecamp project ID from list_projects'),
      },
    },
    async ({ project_id }) => {
      try {
        const record = tokenStore.get(userId);
        if (!record) return toolError('TOKEN_EXPIRED', 'No token found for user. Re-authenticate at /oauth/start', false);
        const client = new BasecampClient({ accessToken: record.accessToken, accountId: record.accountId });
        const project = await client.getProject(project_id);
        // Build a clean map of dock tool names → their IDs and enabled status
        const tools: Record<string, { id: number; enabled: boolean; url: string }> = {};
        for (const item of project.dock) {
          tools[item.name] = { id: item.id, enabled: item.enabled, url: item.app_url };
        }
        return toolSuccess({
          project_id: project.id,
          project_name: project.name,
          message_board_id: tools['message_board']?.id ?? null,
          todoset_id: tools['todoset']?.id ?? null,
          vault_id: tools['vault']?.id ?? null,
          chat_id: tools['chat']?.id ?? null,
          tools,
        });
      } catch (error) {
        return classifyError(error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // list_messages — FR-3.1, FR-3.3, FR-3.4
  // -------------------------------------------------------------------------
  server.registerTool(
    'list_messages',
    {
      description: 'List message board posts in a Basecamp project. Returns message subjects, authors, creation dates, content as markdown, and replies_count. Get message_board_id from get_project_tools first.',
      inputSchema: {
        project_id: z.number().int().positive().describe('The Basecamp project ID'),
        message_board_id: z.number().int().positive().describe('The message board ID from get_project_tools'),
        page: z.number().int().positive().optional().default(1).describe('Page number for pagination'),
      },
    },
    async ({ project_id, message_board_id, page }) => {
      try {
        const record = tokenStore.get(userId);
        if (!record) return toolError('TOKEN_EXPIRED', 'No token found for user. Re-authenticate at /oauth/start', false);
        const client = new BasecampClient({ accessToken: record.accessToken, accountId: record.accountId });
        const result = await client.listMessages(project_id, message_board_id, page);
        return toolSuccess(result);
      } catch (error) {
        return classifyError(error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_message — FR-3.2, FR-3.3, FR-3.4
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_message',
    {
      description: 'Get a single Basecamp message board post with full content as markdown. Returns the message subject, author (name and email), creation date, and the full post body converted to markdown. Use message IDs from list_messages.',
      inputSchema: {
        project_id: z.number().int().positive().describe('The Basecamp project ID'),
        message_id: z.number().int().positive().describe('The message ID from list_messages'),
      },
    },
    async ({ project_id, message_id }) => {
      try {
        const record = tokenStore.get(userId);
        if (!record) return toolError('TOKEN_EXPIRED', 'No token found for user. Re-authenticate at /oauth/start', false);
        const client = new BasecampClient({ accessToken: record.accessToken, accountId: record.accountId });
        // get_message fetches a single message — no paginate, direct GET
        const raw = await client.get<Record<string, unknown>>(
          `buckets/${project_id}/messages/${message_id}.json`
        );
        const message = MessageSchema.parse({
          id: raw['id'],
          title: raw['subject'],
          author: raw['creator'],
          created_at: raw['created_at'],
          updated_at: raw['updated_at'],
          url: raw['app_url'],
          content: htmlToMarkdown(raw['content'] as string),
          replies_count: (raw['comments_count'] as number) ?? 0,
        });
        return toolSuccess(message);
      } catch (error) {
        return classifyError(error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // list_todolists — FR-4.1
  // -------------------------------------------------------------------------
  server.registerTool(
    'list_todolists',
    {
      description: 'List to-do lists in a Basecamp project. Returns list names, descriptions, and item counts. Get todoset_id from get_project_tools first. Use todolist IDs from results to call list_todos.',
      inputSchema: {
        project_id: z.number().int().positive().describe('The Basecamp project ID'),
        todoset_id: z.number().int().positive().describe('The todoset ID from get_project_tools'),
        page: z.number().int().positive().optional().default(1).describe('Page number for pagination'),
      },
    },
    async ({ project_id, todoset_id, page }) => {
      try {
        const record = tokenStore.get(userId);
        if (!record) return toolError('TOKEN_EXPIRED', 'No token found for user. Re-authenticate at /oauth/start', false);
        const client = new BasecampClient({ accessToken: record.accessToken, accountId: record.accountId });
        const result = await client.listTodoLists(project_id, todoset_id, page);
        return toolSuccess(result);
      } catch (error) {
        return classifyError(error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // list_todos — FR-4.2, FR-4.4
  // -------------------------------------------------------------------------
  server.registerTool(
    'list_todos',
    {
      description: 'List to-do items in a specific to-do list. Returns todo titles, descriptions as markdown, assignees, due dates, completion status, completed_at timestamp, and comments_count. Use todolist_id from list_todolists.',
      inputSchema: {
        project_id: z.number().int().positive().describe('The Basecamp project ID'),
        todolist_id: z.number().int().positive().describe('The to-do list ID from list_todolists'),
        completed: z.boolean().optional().default(false).describe(
          'If false (default), returns only incomplete todos. If true, returns completed todos.'
        ),
        page: z.number().int().positive().optional().default(1).describe('Page number for pagination'),
      },
    },
    async ({ project_id, todolist_id, completed, page }) => {
      try {
        const record = tokenStore.get(userId);
        if (!record) return toolError('TOKEN_EXPIRED', 'No token found for user. Re-authenticate at /oauth/start', false);
        const client = new BasecampClient({ accessToken: record.accessToken, accountId: record.accountId });
        // listTodos fetches all todos; filter by completed status client-side
        const result = await client.listTodos(project_id, todolist_id, page);
        const items = result.items.filter((t) => t.completed === completed);
        return toolSuccess({ ...result, items });
      } catch (error) {
        return classifyError(error);
      }
    },
  );

  // -------------------------------------------------------------------------
  // get_todo — FR-4.3, FR-4.4
  // -------------------------------------------------------------------------
  server.registerTool(
    'get_todo',
    {
      description: 'Get a single Basecamp to-do item with full detail. Returns the todo title, description as markdown, assignees with names and emails, due date, completion status, completed_at timestamp, comments_count, and creation date.',
      inputSchema: {
        project_id: z.number().int().positive().describe('The Basecamp project ID'),
        todo_id: z.number().int().positive().describe('The to-do item ID from list_todos'),
      },
    },
    async ({ project_id, todo_id }) => {
      try {
        const record = tokenStore.get(userId);
        if (!record) return toolError('TOKEN_EXPIRED', 'No token found for user. Re-authenticate at /oauth/start', false);
        const client = new BasecampClient({ accessToken: record.accessToken, accountId: record.accountId });
        const raw = await client.get<Record<string, unknown>>(
          `buckets/${project_id}/todos/${todo_id}.json`
        );
        // Assignees are in raw['assignees'] as array
        const assignees = (raw['assignees'] as Array<{ name: string; email_address: string }> ?? [])
          .map((a) => ({ name: a.name, email: a.email_address }));
        const todo = TodoSchema.parse({
          id: raw['id'],
          title: raw['content'],  // Basecamp: "content" is the todo title text
          author: raw['creator'],
          created_at: raw['created_at'],
          updated_at: raw['updated_at'],
          url: raw['app_url'],
          content: htmlToMarkdown(raw['description'] as string),
          completed: raw['completed'],
          due_on: raw['due_on'] ?? null,
          completed_at: (raw['completed_at'] as string | null) ?? null,
          comments_count: (raw['comments_count'] as number) ?? 0,
        });
        return toolSuccess({ ...todo, assignees });
      } catch (error) {
        return classifyError(error);
      }
    },
  );

  return server;
}
