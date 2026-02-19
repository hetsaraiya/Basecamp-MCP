import got, { type Got, type Response } from 'got';
import { type BasecampCredentials, type BasecampRequestOptions, ReadOnlyError } from './types.js';
import { withRateLimit } from './rate-limit.js';
import { paginate, type PaginatedResult } from './paginate.js';
import { htmlToMarkdown } from './html-to-markdown.js';
import {
  ProjectSchema,
  type Project,
  MessageSchema,
  type Message,
  TodoSchema,
  TodoListSchema,
  type Todo,
  type TodoList,
  DocumentSchema,
  DocumentSummarySchema,
  type Document,
  type DocumentSummary,
  CampfireLineSchema,
  type CampfireLine,
  AttachmentSchema,
  type Attachment,
} from './schemas/index.js';

/**
 * Unwraps got's RequestError wrapper when the cause is a ReadOnlyError.
 *
 * Got wraps errors thrown in beforeRequest hooks in a RequestError with the
 * original error stored in error.cause. Callers should receive ReadOnlyError
 * directly rather than a generic RequestError with an opaque code.
 */
function unwrapHookError(error: unknown): never {
  if (
    error instanceof Error &&
    'cause' in error &&
    error.cause instanceof ReadOnlyError
  ) {
    throw error.cause;
  }
  throw error;
}

/**
 * BasecampClient — core HTTP client for the Basecamp MCP server.
 *
 * Design constraints:
 *   - Read-only: any non-GET method throws ReadOnlyError before a network request (NFR-5.1)
 *   - Per-user isolation: one instance = one accessToken (NFR-5.3)
 *   - accountId is never accepted as a method parameter (NFR-5.2)
 *   - Max 5 concurrent in-flight requests per instance (NFR-1.3)
 *   - All requests wrapped in withRateLimit for 429 handling (NFR-1.1, NFR-1.2)
 *
 * Content endpoint methods (Plan 02-02):
 *   - listProjects()
 *   - listMessages()
 *   - listTodoLists()
 *   - listTodos()
 *   - listDocuments()
 *   - getDocument()
 *   - listCampfireLines()
 *   - listAttachments()
 */
export class BasecampClient {
  private readonly accessToken: string;
  private readonly accountId: string;

  // got instance with prefixed URL, auth headers, and read-only hook
  private readonly instance: Got;

  // Concurrency semaphore — max 5 simultaneous requests (NFR-1.3)
  private readonly maxConcurrent = 5;
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];

  constructor(credentials: BasecampCredentials) {
    this.accessToken = credentials.accessToken;
    this.accountId = credentials.accountId;

    this.instance = got.extend({
      prefixUrl: `https://3.basecampapi.com/${this.accountId}`,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'User-Agent': 'Basecamp MCP Server (contact@openxcell.com)',
        'Accept': 'application/json',
      },
      responseType: 'json',
      timeout: { request: 30_000 },
      // Disable got's built-in retry — we handle retries ourselves in withRateLimit
      retry: { limit: 0 },
      hooks: {
        beforeRequest: [
          (options) => {
            // Enforce read-only access — block any non-GET method before any network activity (NFR-5.1)
            const method = options.method.toUpperCase();
            if (method !== 'GET') {
              throw new ReadOnlyError(options.method);
            }
          },
        ],
      },
    });
  }

  // Acquire a concurrency slot (NFR-1.3)
  private async acquire(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight++;
      return;
    }
    return new Promise<void>((resolve) => this.queue.push(resolve));
  }

  // Release a concurrency slot and unblock next queued request (NFR-1.3)
  private release(): void {
    const next = this.queue.shift();
    if (next) {
      // Hand the slot directly to the next waiter (inFlight count stays the same)
      next();
    } else {
      this.inFlight--;
    }
  }

  /**
   * GET request — returns parsed JSON body as T.
   *
   * path: relative to the account prefix URL (e.g. 'projects.json')
   * options.searchParams: optional query parameters
   */
  async get<T = unknown>(path: string, options?: BasecampRequestOptions): Promise<T> {
    await this.acquire();
    try {
      return await withRateLimit(
        () => this.instance.get(path, { searchParams: options?.searchParams }).json<T>(),
      );
    } catch (error) {
      unwrapHookError(error);
    } finally {
      this.release();
    }
  }

  /**
   * getRaw — returns the full got Response object.
   *
   * Used by paginate() to access the `link` response header
   * for cursor-based pagination through Basecamp's Link headers.
   */
  async getRaw(path: string, options?: BasecampRequestOptions): Promise<Response<unknown>> {
    await this.acquire();
    try {
      return await withRateLimit(
        () => this.instance.get(path, {
          searchParams: options?.searchParams,
          responseType: 'json',
          resolveBodyOnly: false,
        }) as Promise<Response<unknown>>,
      );
    } catch (error) {
      unwrapHookError(error);
    } finally {
      this.release();
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * normalizeEnvelopeFields — extracts common fields from a raw Basecamp object.
   *
   * Centralizes the field name mapping that is consistent across content types:
   *   id, app_url → url, creator/author → author, created_at, updated_at.
   * Title mapping varies per content type — callers pass it explicitly.
   */
  private normalizeEnvelopeFields(raw: Record<string, unknown>) {
    return {
      id: raw['id'],
      title: raw['title'] ?? raw['name'] ?? raw['subject'] ?? raw['filename'] ?? '',
      author: raw['creator'] ?? raw['author'],
      created_at: raw['created_at'],
      updated_at: raw['updated_at'],
      url: raw['app_url'],
    };
  }

  // ---------------------------------------------------------------------------
  // Content endpoint methods
  // ---------------------------------------------------------------------------

  /**
   * listProjects — returns a paginated list of all active Basecamp projects.
   *
   * Raw field mapping: name→title, app_url→url, creator→author, description→description
   */
  async listProjects(page = 1): Promise<PaginatedResult<Project>> {
    return paginate(this, 'projects.json', page, (raw) => {
      const r = raw as Record<string, unknown>;
      const dock = (r['dock'] as Array<{ name: string; enabled: boolean }> ?? []);
      return ProjectSchema.parse({
        id: r['id'],
        title: r['name'],
        author: r['creator'],
        created_at: r['created_at'],
        updated_at: r['updated_at'],
        url: r['app_url'],
        status: r['status'],
        description: r['description'] ?? '',
        tools: dock.filter((d) => d.enabled).map((d) => d.name),
      });
    });
  }

  /**
   * listMessages — returns paginated messages from a project's message board.
   *
   * Raw field mapping: subject→title, content (HTML)→content (markdown), app_url→url
   */
  async listMessages(
    bucketId: number,
    boardId: number,
    page = 1,
  ): Promise<PaginatedResult<Message>> {
    const path = `buckets/${bucketId}/message_boards/${boardId}/messages.json`;
    return paginate(this, path, page, (raw) => {
      const r = raw as Record<string, unknown>;
      return MessageSchema.parse({
        id: r['id'],
        title: r['subject'],
        author: r['creator'],
        created_at: r['created_at'],
        updated_at: r['updated_at'],
        url: r['app_url'],
        content: htmlToMarkdown(r['content'] as string),
        replies_count: (r['comments_count'] as number) ?? 0,
      });
    });
  }

  /**
   * listTodoLists — returns paginated todo lists from a project's todoset.
   *
   * Raw field mapping: name→title, description (HTML)→content (markdown), app_url→url
   */
  async listTodoLists(
    bucketId: number,
    todoSetId: number,
    page = 1,
  ): Promise<PaginatedResult<TodoList>> {
    const path = `buckets/${bucketId}/todosets/${todoSetId}/todolists.json`;
    return paginate(this, path, page, (raw) => {
      const r = raw as Record<string, unknown>;
      return TodoListSchema.parse({
        id: r['id'],
        title: r['name'],
        author: r['creator'],
        created_at: r['created_at'],
        updated_at: r['updated_at'],
        url: r['app_url'],
        content: htmlToMarkdown(r['description'] as string),
        todos_count: r['todos_count'],
      });
    });
  }

  /**
   * listTodos — returns paginated todos from a specific todo list.
   *
   * Raw field mapping: content (the title text)→title, description (HTML)→content (markdown)
   */
  async listTodos(
    bucketId: number,
    todoListId: number,
    page = 1,
  ): Promise<PaginatedResult<Todo>> {
    const path = `buckets/${bucketId}/todolists/${todoListId}/todos.json`;
    return paginate(this, path, page, (raw) => {
      const r = raw as Record<string, unknown>;
      return TodoSchema.parse({
        id: r['id'],
        title: r['content'],            // Basecamp: "content" is the todo title text
        author: r['creator'],
        created_at: r['created_at'],
        updated_at: r['updated_at'],
        url: r['app_url'],
        content: htmlToMarkdown(r['description'] as string),  // description is HTML notes
        completed: r['completed'],
        due_on: r['due_on'] ?? null,
        completed_at: (r['completed_at'] as string | null) ?? null,
        comments_count: (r['comments_count'] as number) ?? 0,
      });
    });
  }

  /**
   * listDocuments — returns paginated documents with truncated content (first 500 chars).
   *
   * Uses DocumentSummarySchema to enforce NFR-4.3: document list truncation.
   * Full content available only via getDocument().
   */
  async listDocuments(
    bucketId: number,
    vaultId: number,
    page = 1,
  ): Promise<PaginatedResult<DocumentSummary>> {
    const path = `buckets/${bucketId}/vaults/${vaultId}/documents.json`;
    return paginate(this, path, page, (raw) => {
      const r = raw as Record<string, unknown>;
      return DocumentSummarySchema.parse({
        id: r['id'],
        title: r['title'],
        author: r['creator'],
        created_at: r['created_at'],
        updated_at: r['updated_at'],
        url: r['app_url'],
        content: htmlToMarkdown(r['content'] as string),
      });
    });
  }

  /**
   * getDocument — returns a single document with full content.
   *
   * Not paginated — fetches a single resource by ID.
   */
  async getDocument(bucketId: number, documentId: number): Promise<Document> {
    const raw = await this.get<Record<string, unknown>>(
      `buckets/${bucketId}/documents/${documentId}.json`,
    );
    return DocumentSchema.parse({
      ...this.normalizeEnvelopeFields(raw),
      content: htmlToMarkdown(raw['content'] as string),
    });
  }

  /**
   * listCampfireLines — returns paginated chat lines from a Campfire room.
   *
   * Raw field mapping: (no title on campfire lines — defaults to ''), content (HTML)→markdown
   */
  async listCampfireLines(
    bucketId: number,
    chatId: number,
    page = 1,
  ): Promise<PaginatedResult<CampfireLine>> {
    const path = `buckets/${bucketId}/chats/${chatId}/lines.json`;
    return paginate(this, path, page, (raw) => {
      const r = raw as Record<string, unknown>;
      return CampfireLineSchema.parse({
        id: r['id'],
        title: '',                       // Campfire lines have no title field
        author: r['creator'],
        created_at: r['created_at'],
        updated_at: r['updated_at'],
        url: r['app_url'],
        content: htmlToMarkdown(r['content'] as string),
      });
    });
  }

  /**
   * listAttachments — returns paginated attachment metadata (no binary content, NFR-4.4).
   *
   * Raw field mapping: filename→title, app_url→url (deeplink, NOT download URL)
   */
  async listAttachments(
    bucketId: number,
    vaultId: number,
    page = 1,
  ): Promise<PaginatedResult<Attachment>> {
    const path = `buckets/${bucketId}/vaults/${vaultId}/attachments.json`;
    return paginate(this, path, page, (raw) => {
      const r = raw as Record<string, unknown>;
      return AttachmentSchema.parse({
        id: r['id'],
        title: r['filename'],
        author: r['creator'],
        created_at: r['created_at'],
        updated_at: r['updated_at'],
        url: r['app_url'],
        content: '',                     // Always empty — no binary content (NFR-4.4)
        content_type: r['content_type'],
        byte_size: r['byte_size'],
        download_url: r['download_url'] as string | undefined,
      });
    });
  }

  /**
   * getProject — returns the raw Basecamp project JSON including the dock array.
   *
   * Used by MCP tools to resolve dock-internal IDs (message_board_id, todoset_id,
   * vault_id, chat_id) without requiring the agent to supply them (FR-2.4).
   *
   * The dock array items have shape: { id, title, name, enabled, position, url, app_url }
   * where `name` is the dock tool type key. Correct name values:
   *   'message_board', 'todoset', 'vault', 'chat', 'schedule', 'questionnaire'
   * NOT the Ruby class names ('Message::Board' etc.) — confirmed 2026-02-19.
   */
  async getProject(projectId: number): Promise<{
    id: number;
    name: string;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
    dock: Array<{
      id: number;
      title: string;
      name: string;
      enabled: boolean;
      position: number;
      url: string;
      app_url: string;
    }>;
  }> {
    return this.get(`projects/${projectId}.json`);
  }
}
