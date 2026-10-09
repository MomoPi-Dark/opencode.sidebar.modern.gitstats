import { Data, Effect, pipe } from "effect";
import { $ } from "bun";

export class GitError extends Data.TaggedError("GitError")<{
  message: string;
  cause?: unknown;
}> { }

export const gitCommand = (args: string[], cwd: string) =>
  Effect.tryPromise({
    try: async () => {
      const { stdout, stderr } = await $`git ${args}`.cwd(cwd).quiet();
      return {
        stdout: stdout.toString(),
        stderr: stderr.toString(),
      };
    },
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

export function parseStatusPorcelain(output: string): {
  branch: string;
  changed: number;
} {
  const lines = output.split("\n");
  const header = lines.find((line) => line.startsWith("## ")) ?? "## HEAD";
  const rawBranch = header.slice(3);
  const branch =
    rawBranch === "HEAD (no branch)"
      ? "HEAD"
      : rawBranch.startsWith("No commits yet on ")
        ? rawBranch.slice("No commits yet on ".length)
        : rawBranch.split("...")[0].split(" [")[0] || "HEAD";

  return {
    branch,
    changed: lines.filter((line) => line.length > 0 && !line.startsWith("## "))
      .length,
  };
}

export const getStatus = (cwd: string) =>
  pipe(
    gitCommand(["status", "--porcelain=v1", "--branch"], cwd),
    Effect.map((result) => parseStatusPorcelain(result.stdout)),
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
