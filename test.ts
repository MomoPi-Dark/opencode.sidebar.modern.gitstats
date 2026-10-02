import assert from "node:assert";
import { truncate } from "./src/utils";

assert.strictEqual(truncate("main", 10), "main");
assert.strictEqual(truncate("feature/long-branch-name", 10), "feature/l…");
assert.strictEqual(truncate("feature/long-branch-name", 10).length, 10);

const checkoutError = "Git command failed: error: Your local changes would be overwritten by checkout";
const visibleError = checkoutError
  .replace(/^Git command failed:\s*/i, "")
  .replace(/^error:\s*/i, "");
assert.strictEqual(visibleError, "Your local changes would be overwritten by checkout");

const branches = ["develop", "main", "feat/auth", "fix/bug"];
const currentBranch = "feat/auth";
const ordered = [...branches].sort((left, right) => {
  if (left === currentBranch) return -1;
  if (right === currentBranch) return 1;
  return left.localeCompare(right);
});

assert.strictEqual(ordered[0], "feat/auth");
assert.deepStrictEqual(ordered.slice(1), ["develop", "fix/bug", "main"]);

console.log("Git status helper tests passed!");
