import type { Plugin } from "@opencode/plugin/tui";
import { Effect, Fiber } from "effect";
import { Accessor, createSignal } from "solid-js";
import {
  getBranch,
  getBranches,
  getStatus,
  gitCommand,
  worktreeUsingBranch,
} from "./git";
import { log } from "./utils";

export const DEBOUNCE_MS = 300;
export const DOUBLE_CLICK_GUARD_MS = 350;

export interface GitStatusProps {
  available: () => boolean;
  branch: () => string;
  branches: () => string[];
  changed: () => number;
  ctx: Plugin.Context;
  directory: string;
  checkout: (name: string) => Promise<void>;
  orderedBranches: () => string[];
  switching: Accessor<string | undefined>;
  refresh: () => Promise<void>;
  isRefreshing: Accessor<boolean>;
  animIcon: Accessor<string>;
}

export function createGitStatusState(
  ctx: Plugin.Context,
): GitStatusProps & { off: (() => void)[]; dispose: () => void } {
  const [changed, setChanged] = createSignal(0);
  const [available, setAvailable] = createSignal(false);
  const [branch, setBranch] = createSignal("-");
  const [branches, setBranches] = createSignal<string[]>([]);
  const [switching, setSwitching] = createSignal<string>();
  const [isRefreshing, setIsRefreshing] = createSignal(false);
  const [animFrame, setAnimFrame] = createSignal(0);
  const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let animFiber: Fiber.RuntimeFiber<void, never> | undefined;

  const startAnimation = () => {
    if (animFiber) return;
    const loop = Effect.gen(function* () {
      while (true) {
        yield* Effect.sleep("70 millis");
        setAnimFrame((prev) => (prev + 1) % SPINNER_FRAMES.length);
      }
    });
    animFiber = Effect.runFork(loop);
  };

  const stopAnimation = () => {
    if (animFiber) {
      void Effect.runPromise(Fiber.interrupt(animFiber));
      animFiber = undefined;
    }
    setAnimFrame(0);
  };

  let disposed = false;
  let refreshing = false;
  let pendingRefresh = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  const getDirectory = () => ctx.location?.directory ?? process.cwd();

  const refresh = async () => {
    if (disposed) return;
    if (refreshing) {
      pendingRefresh = true;
      return;
    }
    const directory = getDirectory();
    refreshing = true;
    setIsRefreshing(true);
    startAnimation();
    log.info(`refreshing git status in: ${directory}`);
    try {
      const program = Effect.gen(function* () {
        const [branchRes, statusRes, refsRes] = yield* Effect.all([
          getBranch(directory),
          getStatus(directory),
          getBranches(directory),
        ]);
        return { branchRes, statusRes, refsRes };
      });

      const { branchRes, statusRes, refsRes } =
        await Effect.runPromise(program);
      if (!disposed) {
        setBranch(branchRes);
        setChanged(statusRes);
        setAvailable(true);
        setBranches(refsRes);
        log.info(
          `refreshed — branch: ${branchRes}, changed: ${statusRes}, branches: ${refsRes.length}`,
        );
      }
    } catch (error) {
      log.warn(
        `refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (!disposed) {
        setAvailable(false);
        setChanged(0);
        setBranches([]);
      }
    } finally {
      refreshing = false;
      setIsRefreshing(false);
      stopAnimation();
      if (pendingRefresh && !disposed) {
        pendingRefresh = false;
        void refresh();
      }
    }
  };

  const scheduleRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      void refresh();
    }, DEBOUNCE_MS);
  };

  const checkout = async (name: string) => {
    if (name === branch() || switching()) return;
    setSwitching(name);
    log.info(`switching branch to: ${name}`);
    try {
      const program = Effect.gen(function* () {
        const worktree = yield* worktreeUsingBranch(getDirectory(), name);
        if (worktree?.prunable) {
          yield* gitCommand(["worktree", "prune"], getDirectory());
        } else if (worktree) {
          return { alreadyCheckedOut: worktree.path };
        }
        yield* gitCommand(["checkout", name], getDirectory());
        return { switched: true };
      });

      const result = await Effect.runPromise(program);
      if ("alreadyCheckedOut" in result) {
        log.warn(
          `branch ${name} is already checked out in worktree: ${result.alreadyCheckedOut}`,
        );
        ctx.ui.toast.show({
          title: "Checkout Failed",
          message: `${name} is already checked out in ${result.alreadyCheckedOut}`,
          variant: "error",
        });
      } else {
        log.info(`successfully switched branch to: ${name}`);
        ctx.ui.toast.show({
          message: `Switched to ${name}`,
          variant: "success",
        });

        void refresh();
      }
    } catch (error: any) {
      const rawMessage =
        error?.message || (error instanceof Error ? error.message : String(error));
      log.error(`could not switch branch to ${name}: ${rawMessage}`);
      ctx.ui.toast.show({
        title: "Checkout Failed",
        message: rawMessage
          .replace(/^Git command failed:\s*/i, "")
          .replace(/^error:\s*/i, "")
          .slice(0, 160),
        variant: "error",
      });
    } finally {
      setSwitching();
    }
  };

  const orderedBranches = () =>
    [...branches()].sort((left, right) => {
      if (left === branch()) return -1;
      if (right === branch()) return 1;
      return left.localeCompare(right);
    });

  const off = [
    ctx.data.on("vcs.branch.updated", scheduleRefresh),
    ctx.data.on("filesystem.changed", scheduleRefresh),

    () => {
      disposed = true;
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  ];

  const dispose = () => {
    stopAnimation();
    off.forEach((unsubscribe) => unsubscribe());
  };

  void refresh();

  return {
    available,
    branch,
    branches,
    changed,
    off,
    dispose,
    ctx,
    directory: getDirectory(),
    checkout,
    orderedBranches,
    switching,
    refresh,
    isRefreshing,
    animIcon: () => SPINNER_FRAMES[animFrame()],
  };
}
