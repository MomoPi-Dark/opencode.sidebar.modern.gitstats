import { $ } from "bun";

export async function git(args: string[], cwd: string): Promise<string> {
  try {
    return (await $`git ${args}`.cwd(cwd).quiet()).stdout.toString();
  } catch (error: any) {
    const stderr = error?.stderr?.toString().trim();
    throw new Error(
      stderr || (error instanceof Error ? error.message : String(error)),
    );
  }
}

export function parseStatus(output: string) {
  const [header = "## HEAD", ...files] = output.split("\n").filter(Boolean);
  let branch = header
    .slice(3)
    .replace("No commits yet on ", "")
    .split("...")[0]
    .split(" [")[0];
  if (!branch || branch === "HEAD (no branch)") branch = "HEAD";
  return { branch, changed: files.length };
}

export const getStatus = async (cwd: string) =>
  parseStatus(await git(["status", "--porcelain=v1", "--branch"], cwd));

export const getBranches = async (cwd: string) =>
  (await git(["for-each-ref", "--format=%(refname:short)", "refs/heads"], cwd))
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);

export async function worktreeUsingBranch(cwd: string, branch: string) {
  const out = await git(["worktree", "list", "--porcelain"], cwd);
  for (const record of out.split("\n\n")) {
    const lines = record.split("\n");
    if (!lines.includes(`branch refs/heads/${branch}`)) continue;
    const path = lines
      .find((l) => l.startsWith("worktree "))
      ?.slice("worktree ".length);
    if (path)
      return { path, prunable: lines.some((l) => l.startsWith("prunable ")) };
  }
}
