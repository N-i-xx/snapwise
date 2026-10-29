import { COMMENT_MARKER } from "../render/markdown.js";

/** The small slice of the GitHub issues-comments API Snapwise needs. */
export interface CommentApi {
  list(): Promise<Array<{ id: number; body?: string | null }>>;
  create(body: string): Promise<{ id: number }>;
  update(id: number, body: string): Promise<void>;
}

export type CommentResult =
  | { action: "created"; id: number }
  | { action: "updated"; id: number }
  | { action: "unchanged"; id: number }
  | { action: "skipped" };

/**
 * Creates or updates the single Snapwise comment on a pull request.
 *
 * - An existing comment (found by its hidden marker) is always updated, so a
 *   PR that goes from "changes" to "no changes" does not keep a stale report.
 * - A new comment is only created when `create` is true (normally: when there
 *   is something to report), so quiet PRs stay quiet.
 */
export async function upsertComment(
  api: CommentApi,
  body: string,
  opts: { create: boolean },
): Promise<CommentResult> {
  const comments = await api.list();
  const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));
  if (existing) {
    if (existing.body === body) return { action: "unchanged", id: existing.id };
    await api.update(existing.id, body);
    return { action: "updated", id: existing.id };
  }
  if (!opts.create) return { action: "skipped" };
  const created = await api.create(body);
  return { action: "created", id: created.id };
}
