import { Plugin } from "@opencode/plugin/tui";
import { Effect } from "effect";
import { createSignal, Show } from "solid-js";
import { getBranches, getStatus, gitCommand, worktreeUsingBranch } from "./git";
import { GitStatusProps } from "./type";
import { branchMaxLength, log, truncate } from "./utils";

export const DEBOUNCE_MS = 300;
export const DOUBLE_CLICK_GUARD_MS = 350;
export const MIN_REFRESH_INTERVAL_MS = 500;

function createGitStatusState(
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

  let animTimer: ReturnType<typeof setInterval> | undefined;

  const startAnimation = () => {
    if (animTimer) return;
    animTimer = setInterval(
      () => setAnimFrame((prev) => (prev + 1) % SPINNER_FRAMES.length),
      120,
    );
    animTimer.unref?.();
  };

  const stopAnimation = () => {
    if (animTimer) clearInterval(animTimer);
    animTimer = undefined;
    setAnimFrame(0);
  };

  let disposed = false;
  let refreshing = false;
  let pendingRefresh = false;
  let pendingBranches = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRefreshAt = 0;

  const getDirectory = () => ctx.location?.directory ?? process.cwd();

  const refresh = async (includeBranches = true) => {
    if (disposed) return;
    if (refreshing) {
      pendingRefresh = true;
      pendingBranches ||= includeBranches;
      return;
    }
    const wait = MIN_REFRESH_INTERVAL_MS - (Date.now() - lastRefreshAt);
    if (lastRefreshAt > 0 && wait > 0) {
      pendingRefresh = true;
      pendingBranches ||= includeBranches;
      if (!debounceTimer) {
        debounceTimer = setTimeout(() => {
          debounceTimer = undefined;
          const refreshBranches = pendingBranches;
          pendingBranches = false;
          void refresh(refreshBranches);
        }, wait);
        debounceTimer.unref?.();
      }
      return;
    }
    const directory = getDirectory();
    refreshing = true;
    lastRefreshAt = Date.now();
    setIsRefreshing(true);
    startAnimation();
    try {
      const program = Effect.gen(function* () {
        const statusRes = yield* getStatus(directory);
        const refsRes = includeBranches
          ? yield* getBranches(directory)
          : undefined;
        return { statusRes, refsRes };
      });

      const { statusRes, refsRes } = await Effect.runPromise(program);
      if (!disposed) {
        setBranch(statusRes.branch);
        setChanged(statusRes.changed);
        setAvailable(true);
        if (refsRes) setBranches(refsRes);
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
        const refreshBranches = pendingBranches;
        pendingRefresh = false;
        pendingBranches = false;
        void refresh(refreshBranches);
      }
    }
  };

  const scheduleRefresh = (includeBranches = false) => {
    pendingBranches ||= includeBranches;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      const refreshBranches = pendingBranches;
      pendingBranches = false;
      void refresh(refreshBranches);
    }, DEBOUNCE_MS);
    debounceTimer.unref?.();
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

        void refresh(true);
      }
    } catch (error: any) {
      const rawMessage =
        error?.message ||
        (error instanceof Error ? error.message : String(error));
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
    ctx.data.on("vcs.branch.updated", () => scheduleRefresh(true)),
    ctx.data.on("filesystem.changed", () => scheduleRefresh(false)),
  ];

  const dispose = () => {
    disposed = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = undefined;
    pendingRefresh = false;
    pendingBranches = false;
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

export default Plugin.define({
  id: "opencode.sidebar.modern.gitstats",
  setup(context) {
    const props = createGitStatusState(context);

    log.info(`plugin setup() called for directory: ${props.directory}`);

    let lastBranchClick = 0;
    const pressedButtons = new Set<number>();
    const [panelWidth, setPanelWidth] = createSignal(0);

    const MAX_BRANCHES = 6;

    const disposeSlot = context.ui.slot({
      append: "sidebar.content",
      render: () => {
        const colors = () => ({
          textBase: context.theme.text.base,
          textMuted: context.theme.text.muted,
          border: context.theme.border.base,
          success: context.theme.text.feedback.success.base,
          warning: context.theme.text.feedback.warning.base,
          error: context.theme.text.feedback.error.base,
        });

        const branchesList = () => props.orderedBranches();
        const visibleBranches = () => branchesList().slice(0, MAX_BRANCHES);
        const remainingCount = () =>
          Math.max(0, branchesList().length - MAX_BRANCHES);

        return (
          <Show when={props.available()}>
            <box
              flexDirection="column"
              width="100%"
              border={true}
              borderStyle="single"
              borderColor={colors().border}
              title=" Git Status "
              titleAlignment="left"
              titleColor={colors().textMuted}
              ref={(element) => setPanelWidth(element.width)}
            >
              <text>
                <span style={{ fg: colors().textMuted }}>
                  {"Branch".padEnd(9)}
                </span>
                <span style={{ fg: colors().success }}>{"⎇ "}</span>
                <span style={{ fg: colors().success }}>
                  {truncate(props.branch(), branchMaxLength(panelWidth(), 11))}
                </span>
              </text>

              <box
                flexDirection="row"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    e.stopPropagation();
                    void props.refresh();
                  }
                }}
              >
                <text>
                  <span style={{ fg: colors().textMuted }}>
                    {"Status".padEnd(9)}
                  </span>
                  <span
                    style={{
                      fg:
                        props.changed() > 0
                          ? colors().warning
                          : colors().success,
                    }}
                  >
                    {props.changed() > 0
                      ? `${props.changed()} modified`
                      : "clean"}
                  </span>
                  <span style={{ fg: colors().border }}>{"  ["}</span>
                  <span
                    style={{
                      fg: props.isRefreshing()
                        ? colors().warning
                        : colors().textMuted,
                    }}
                  >
                    {props.isRefreshing() ? props.animIcon() : "↻"}
                  </span>
                  <span style={{ fg: colors().border }}>{"]"}</span>
                </text>
              </box>

              <Show when={branchesList().length > 0}>
                <text>
                  <span style={{ fg: colors().textMuted }}>
                    {"Branches".padEnd(9)}
                  </span>
                  <span style={{ fg: colors().border }}>{"["}</span>
                  <span style={{ fg: colors().success }}>
                    {branchesList().length}
                  </span>
                  <span style={{ fg: colors().border }}>{"]"}</span>
                </text>

                {visibleBranches().map((name) => {
                  const isCurrent = () => name === props.branch();
                  const isSwitching = () => props.switching() === name;

                  return (
                    <box
                      flexDirection="row"
                      onMouseDown={(event) => {
                        pressedButtons.add(event.button);
                        if (event.button !== 0 || pressedButtons.size > 1)
                          return;
                        const now = Date.now();
                        if (now - lastBranchClick < DOUBLE_CLICK_GUARD_MS)
                          return;
                        lastBranchClick = now;
                        event.stopPropagation();
                        void props.checkout(name);
                      }}
                      onMouseUp={(event) => pressedButtons.delete(event.button)}
                    >
                      <text>
                        <span style={{ fg: colors().textMuted }}>{"  "}</span>
                        <span
                          style={{
                            fg: isCurrent()
                              ? colors().success
                              : isSwitching()
                                ? colors().warning
                                : colors().border,
                          }}
                        >
                          {isSwitching()
                            ? props.animIcon()
                            : isCurrent()
                              ? "●"
                              : "○"}
                        </span>{" "}
                        <span
                          style={{
                            fg: isCurrent()
                              ? colors().success
                              : colors().textBase,
                          }}
                        >
                          {truncate(
                            name,
                            branchMaxLength(
                              panelWidth(),
                              4,
                              isCurrent() ? 7 : isSwitching() ? 4 : 0,
                            ),
                          )}
                        </span>
                        {isCurrent() && (
                          <span style={{ fg: colors().textMuted }}>
                            {" (HEAD)"}
                          </span>
                        )}
                        {isSwitching() && (
                          <span style={{ fg: colors().warning }}>{" (…)"}</span>
                        )}
                      </text>
                    </box>
                  );
                })}

                <Show when={remainingCount() > 0}>
                  <text>
                    <span style={{ fg: colors().textMuted }}>
                      {`  +${remainingCount()} more`}
                    </span>
                  </text>
                </Show>
              </Show>
            </box>
          </Show>
        );
      },
    });

    return () => {
      log.info("disposing plugin");
      props.dispose();
      disposeSlot();
    };
  },
});
