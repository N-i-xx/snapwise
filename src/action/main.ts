import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { compareSources, GitSource } from "../sources.js";
import { evaluatePolicy, parseFailOn } from "../policy.js";
import { renderMarkdown } from "../render/markdown.js";
import type { Report } from "../diff.js";
import { upsertComment, type CommentApi, type CommentResult } from "./comment.js";

const execFileAsync = promisify(execFile);

/** Entry point of the GitHub Action. Never throws; failures go through core.setFailed. */
export async function run(): Promise<void> {
  try {
    await runUnsafe();
  } catch (err) {
    core.setFailed((err as Error).message);
  }
}

async function runUnsafe(): Promise<void> {
  const ctx = github.context;
  const workspace = process.env["GITHUB_WORKSPACE"] ?? process.cwd();
  const cwd = resolve(workspace, core.getInput("working-directory") || ".");
  const failOn = parseFailOn(core.getInput("fail-on"));
  const wantComment = core.getBooleanInput("comment");
  const commentWhenClean = core.getBooleanInput("comment-on-no-changes");
  const includeNonces = core.getBooleanInput("include-nonces");

  const pr = ctx.payload.pull_request as
    { number: number; base: { sha: string; ref: string } } | undefined;
  const baseRef =
    core.getInput("base-ref") || pr?.base.sha || (ctx.payload["before"] as string | undefined);
  const headRef = core.getInput("head-ref") || "HEAD";
  if (!baseRef) {
    throw new Error(
      "Could not work out what to compare against. Run on pull_request events, or set the base-ref input.",
    );
  }
  await ensureCommit(baseRef, cwd);

  const baseLabel =
    pr && baseRef === pr.base.sha ? `${pr.base.ref}@${baseRef.slice(0, 7)}` : baseRef;
  const report = await compareSources(
    new GitSource(baseRef, cwd, baseLabel),
    new GitSource(headRef, cwd, headRef === "HEAD" ? "this PR" : headRef),
    { includeNonces },
  );

  const runUrl = `${ctx.serverUrl}/${ctx.repo.owner}/${ctx.repo.repo}/actions/runs/${ctx.runId}`;
  const markdown = renderMarkdown(report, { footer: `[workflow run](${runUrl})` });

  await writeOutputs(report, markdown);
  await core.summary.addRaw(markdown, true).write();

  if (wantComment && pr) {
    const hasNews = report.tests.length > 0;
    const result = await tryComment(pr.number, markdown, hasNews || commentWhenClean);
    core.info(`PR comment: ${result.action}`);
  }

  const reasons = evaluatePolicy(report, failOn);
  if (reasons.length > 0) {
    core.setFailed(
      `Snapshot changes matched fail-on (${failOn.join(", ")}):\n${reasons.map((r) => `- ${r}`).join("\n")}`,
    );
  } else {
    core.info(
      `Snapwise: ${report.totals.changed} changed, ${report.totals.added} added, ${report.totals.removed} removed, ${report.unchanged} unchanged.`,
    );
  }
}

async function writeOutputs(report: Report, markdown: string): Promise<void> {
  const dir = join(process.env["RUNNER_TEMP"] ?? ".", "snapwise");
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, "report.json");
  const mdPath = join(dir, "report.md");
  await writeFile(jsonPath, JSON.stringify(report, null, 2));
  await writeFile(mdPath, markdown);
  core.setOutput("changed", report.totals.changed);
  core.setOutput("added", report.totals.added);
  core.setOutput("removed", report.totals.removed);
  core.setOutput("auth-changed", report.totals.auth);
  core.setOutput("report-json", jsonPath);
  core.setOutput("report-markdown", mdPath);
}

async function tryComment(
  issueNumber: number,
  body: string,
  create: boolean,
): Promise<CommentResult> {
  const token = core.getInput("github-token");
  if (!token) {
    core.warning("No github-token; skipping the PR comment. The report is in the job summary.");
    return { action: "skipped" };
  }
  const octokit = github.getOctokit(token);
  const { owner, repo } = github.context.repo;
  const api: CommentApi = {
    list: () =>
      octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: issueNumber,
        per_page: 100,
      }),
    create: async (b) =>
      (await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body: b }))
        .data,
    update: async (id, b) => {
      await octokit.rest.issues.updateComment({ owner, repo, comment_id: id, body: b });
    },
  };
  try {
    return await upsertComment(api, body, { create });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 403 || status === 404) {
      // Typical for PRs from forks, where the token is read-only.
      core.warning(
        `Could not write the PR comment (HTTP ${status}). This is expected for pull requests from forks. The report is in the job summary.`,
      );
      return { action: "skipped" };
    }
    throw err;
  }
}

/** Makes sure `ref` exists locally, fetching it from origin if the checkout was shallow. */
async function ensureCommit(ref: string, cwd: string): Promise<void> {
  const exists = async () =>
    execFileAsync("git", ["cat-file", "-e", `${ref}^{commit}`], { cwd }).then(
      () => true,
      () => false,
    );
  if (await exists()) return;
  core.info(`Base ${ref} is not in the checkout; fetching it.`);
  await execFileAsync("git", ["fetch", "--no-tags", "--depth=1", "origin", ref], { cwd }).catch(
    () => undefined,
  );
  if (!(await exists())) {
    throw new Error(
      `Base commit ${ref} is not available. Use actions/checkout with "fetch-depth: 0", or set base-ref.`,
    );
  }
}
