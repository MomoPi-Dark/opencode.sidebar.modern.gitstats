import { Data, Effect, pipe } from "effect";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitError extends Data.TaggedError("GitError")<{
  message: string;
  cause?: unknown;
}> {}

export const gitCommand = (args: string[], cwd: string) =>
  Effect.tryPromise({
    try: () => execFileAsync("git", args, { cwd }),
    catch: (error: any) => {
      const msg =
        typeof error?.stderr === "string" && error.stderr.trim()
          ? error.stderr.trim()
          : error instanceof Error
            ? error.message
            : String(error);
      return new GitError({
        message: msg,
        cause: error,
      });
    },
  });

export const getBranch = (cwd: string) =>
  pipe(
    gitCommand(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    Effect.map((result) => result.stdout.trim()),
  );

export const getStatus = (cwd: string) =>
  pipe(
    gitCommand(["status", "--porcelain"], cwd),
    Effect.map(
      (result) =>
        result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean).length,
    ),
  );

export const getBranches = (cwd: string) =>
  pipe(
    gitCommand(
      ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
      cwd,
    ),
    Effect.map((result) =>
      result.stdout
        .split("\n")
        .map((name: string) => name.trim())
        .filter(Boolean),
    ),
  );

export const worktreeUsingBranch = (directory: string, branchName: string) =>
  Effect.gen(function* () {
    const { stdout } = yield* gitCommand(
      ["worktree", "list", "--porcelain"],
      directory,
    );

    for (const record of stdout.split("\n\n")) {
      const lines = record.split("\n");
      const worktree = lines.find((line) => line.startsWith("worktree "));
      if (lines.includes(`branch refs/heads/${branchName}`) && worktree) {
        return {
          path: worktree.slice("worktree ".length),
          prunable: lines.some((line) => line.startsWith("prunable ")),
        };
      }
    }
    return undefined;
  });
