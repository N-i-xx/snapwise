import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { upsertComment, type CommentApi } from "../src/action/comment.js";
import { COMMENT_MARKER } from "../src/render/markdown.js";
import { VAULT_BASE, VAULT_HEAD } from "./helpers.js";

// ---- mocks for @actions/core and @actions/github --------------------------

const state = vi.hoisted(() => ({
  inputs: {} as Record<string, string>,
  outputs: {} as Record<string, unknown>,
  failed: undefined as string | undefined,
  warnings: [] as string[],
  summary: "",
  comments: [] as Array<{ id: number; body: string }>,
  commentError: undefined as { status: number } | undefined,
  payload: {} as Record<string, unknown>,
}));

vi.mock("@actions/core", () => ({
  getInput: (name: string) => state.inputs[name] ?? "",
  getBooleanInput: (name: string) => (state.inputs[name] ?? "false") === "true",
  setOutput: (name: string, value: unknown) => void (state.outputs[name] = value),
  setFailed: (msg: string) => void (state.failed = msg),
  info: () => undefined,
  warning: (msg: string) => void state.warnings.push(msg),
  summary: {
    addRaw(text: string) {
      state.summary += text;
      return this;
    },
    async write() {
      return this;
    },
  },
}));

vi.mock("@actions/github", () => {
  const issues = {
    listComments: vi.fn(),
    createComment: vi.fn(async ({ body }: { body: string }) => {
      if (state.commentError) throw state.commentError;
      const c = { id: 100 + state.comments.length, body };
      state.comments.push(c);
      return { data: c };
    }),
    updateComment: vi.fn(async ({ comment_id, body }: { comment_id: number; body: string }) => {
      if (state.commentError) throw state.commentError;
      state.comments.find((c) => c.id === comment_id)!.body = body;
      return { data: {} };
    }),
  };
  return {
    context: {
      get payload() {
        return state.payload;
      },
      repo: { owner: "N-thnl", repo: "snapwise" },
      runId: 42,
      serverUrl: "https://github.com",
    },
    getOctokit: () => ({
      rest: { issues },
      paginate: async () => {
        if (state.commentError) throw state.commentError;
        return state.comments.map((c) => ({ ...c }));
      },
    }),
  };
});

const { run } = await import("../src/action/main.js");

// ---- a git repo with the vault fixtures as base and head commits ----------

let repo: string;
let baseSha: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "snapwise-action-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "test");
  git("config", "core.autocrlf", "false");
  cpSync(VAULT_BASE, repo, { recursive: true });
  git("add", ".");
  git("commit", "-q", "-m", "base");
  baseSha = git("rev-parse", "HEAD");
  cpSync(VAULT_HEAD, repo, { recursive: true });
  git("commit", "-q", "-am", "add a deposit fee");
  process.env["GITHUB_WORKSPACE"] = repo;
  process.env["RUNNER_TEMP"] = join(repo, ".tmp");
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

beforeEach(() => {
  state.inputs = { comment: "true", "github-token": "t0ken", "fail-on": "none" };
  state.outputs = {};
  state.failed = undefined;
  state.warnings = [];
  state.summary = "";
  state.comments = [];
  state.commentError = undefined;
  state.payload = { pull_request: { number: 7, base: { sha: baseSha, ref: "main" } } };
});

describe("action", () => {
  it("creates one sticky comment, writes the summary and sets outputs", async () => {
    await run();
    expect(state.failed).toBeUndefined();
    expect(state.comments).toHaveLength(1);
    expect(state.comments[0]!.body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(state.comments[0]!.body).toContain(`main@${baseSha.slice(0, 7)}`);
    expect(state.comments[0]!.body).toContain("actions/runs/42");
    expect(state.summary).toContain("Snapwise");
    expect(state.outputs).toMatchObject({ changed: 5, added: 0, removed: 0, "auth-changed": 5 });
  });

  it("updates the existing comment instead of adding another", async () => {
    state.comments.push(
      { id: 1, body: "unrelated" },
      { id: 2, body: `${COMMENT_MARKER}\nold report` },
    );
    await run();
    expect(state.comments).toHaveLength(2);
    expect(state.comments[1]!.body).toContain("5 changed");
  });

  it("does not create a comment when nothing changed", async () => {
    state.inputs["base-ref"] = "HEAD";
    await run();
    expect(state.comments).toHaveLength(0);
    expect(state.outputs["changed"]).toBe(0);
  });

  it("does update an existing comment when the PR no longer changes snapshots", async () => {
    state.inputs["base-ref"] = "HEAD";
    state.comments.push({ id: 9, body: `${COMMENT_MARKER}\nold report` });
    await run();
    expect(state.comments[0]!.body).toContain("No test snapshot changes");
  });

  it("warns instead of failing when the token cannot comment (fork PRs)", async () => {
    state.commentError = { status: 403 };
    await run();
    expect(state.failed).toBeUndefined();
    expect(state.warnings.join()).toMatch(/HTTP 403/);
  });

  it("fails the check when fail-on matches", async () => {
    state.inputs["fail-on"] = "auth";
    await run();
    expect(state.failed).toMatch(/authorization changed/);
    expect(state.comments).toHaveLength(1); // the comment is still posted
  });

  it("explains how to fix a missing base commit", async () => {
    state.inputs["base-ref"] = "0123456789abcdef0123456789abcdef01234567";
    await run();
    expect(state.failed).toMatch(/fetch-depth: 0/);
  });

  it("asks for base-ref outside pull requests", async () => {
    state.payload = {};
    await run();
    expect(state.failed).toMatch(/base-ref/);
  });

  it("rejects an invalid fail-on value", async () => {
    state.inputs["fail-on"] = "gas";
    await run();
    expect(state.failed).toMatch(/Unknown fail-on category/);
  });
});

describe("upsertComment", () => {
  const fake = (bodies: string[]): CommentApi & { created: string[]; updated: string[] } => {
    const created: string[] = [];
    const updated: string[] = [];
    return {
      created,
      updated,
      list: async () => bodies.map((body, i) => ({ id: i + 1, body })),
      create: async (b) => (created.push(b), { id: 99 }),
      update: async (_id, b) => void updated.push(b),
    };
  };

  it("leaves an identical comment alone", async () => {
    const body = `${COMMENT_MARKER}\nsame`;
    const api = fake([body]);
    expect(await upsertComment(api, body, { create: true })).toEqual({
      action: "unchanged",
      id: 1,
    });
    expect(api.updated).toEqual([]);
  });

  it("skips when told not to create", async () => {
    const api = fake(["hello"]);
    expect(await upsertComment(api, `${COMMENT_MARKER}\nx`, { create: false })).toEqual({
      action: "skipped",
    });
    expect(api.created).toEqual([]);
  });
});
