/**
 * errors.ts — Typed MCP error responses for all tool handlers.
 *
 * MCP tool errors are returned as successful MCP responses (not thrown)
 * with isError: true and a structured content block. This lets agents
 * read the error_code and decide whether to retry or surface to user.
 * (FR-8.3, FR-8.4)
 */

export type ToolErrorCode =
  | 'TOKEN_EXPIRED'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'TOOL_NOT_ENABLED'
  | 'PERMISSION_DENIED'
  | 'INVALID_INPUT';

export interface ToolErrorPayload {
  error_code: ToolErrorCode;
  message: string;
  retryable: boolean;
}

/**
 * toolError — builds a structured MCP error response envelope.
 *
 * Returns the shape expected by McpServer tool handlers:
 *   { isError: true, content: [{ type: 'text', text: JSON.stringify(payload) }] }
 */
export function toolError(
  code: ToolErrorCode,
  message: string,
  retryable = false,
): { isError: true; content: Array<{ type: 'text'; text: string }> } {
  const payload: ToolErrorPayload = { error_code: code, message, retryable };
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify(payload) }],
  };
}

/**
 * toolSuccess — wraps a plain object as a successful MCP content envelope.
 *
 * All tool handlers return content blocks with type 'text' containing JSON.
 */
export function toolSuccess(
  data: unknown,
): { content: Array<{ type: 'text'; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * classifyError — maps known error types to ToolErrorCode.
 *
 * Called in every tool handler's catch block to translate BasecampClient
 * errors (RateLimitError, TokenExpiredError, HTTP 404s) into typed codes.
 */
export function classifyError(error: unknown): ReturnType<typeof toolError> {
  if (error instanceof Error) {
    // TokenExpiredError from src/auth/store.ts
    if ('code' in error && (error as { code: string }).code === 'TOKEN_EXPIRED') {
      return toolError('TOKEN_EXPIRED', error.message, false);
    }
    // RateLimitError from src/client/types.ts
    if (error.constructor.name === 'RateLimitError') {
      return toolError('RATE_LIMITED', error.message, true);
    }
    // got HTTP errors — check statusCode
    if ('response' in error) {
      const resp = (error as { response: { statusCode: number } }).response;
      if (resp?.statusCode === 404) {
        return toolError('NOT_FOUND', error.message, false);
      }
      if (resp?.statusCode === 403) {
        return toolError('PERMISSION_DENIED', error.message, false);
      }
    }
  }
  return toolError('NOT_FOUND', String(error), false);
}
