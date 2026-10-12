import { Plugin } from "@opencode/plugin/tui";
import { createMemo, createSignal, For, Show } from "solid-js";
import { getBranches, getStatus, git, worktreeUsingBranch } from "./git";
import { branchMaxLength, log, truncate } from "./utils";

const DEBOUNCE_MS = 300;
const MAX_BRANCHES = 6;

export default Plugin.define({
  id: "opencode.gitstats.tui",
  setup(context) {
    const [available, setAvailable] = createSignal(false);
    const [branch, setBranch] = createSignal("-");
    const [branches, setBranches] = createSignal<string[]>([]);
    const [changed, setChanged] = createSignal(0);
    const [loading, setLoading] = createSignal(false);
    const [switching, setSwitching] = createSignal<string>();
    const [width, setWidth] = createSignal(0);

    const directory = () => context.location?.directory ?? process.cwd();

    const ordered = createMemo(() =>
      [...branches()].sort((a, b) =>
        a === branch() ? -1 : b === branch() ? 1 : a.localeCompare(b),
      ),
    );

    let disposed = false;
    let running = false;
    let queued: { branches: boolean } | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timerBranches = false;

    // Satu refresh berjalan sekali; permintaan yang masuk saat berjalan
    // digabung jadi satu run ulang.
    const refresh = async (withBranches = true) => {
      if (disposed) return;
      if (running) {
        queued = { branches: (queued?.branches ?? false) || withBranches };
        return;
      }
      running = true;
      setLoading(true);
      try {
        const cwd = directory();
        const [status, refs] = await Promise.all([
          getStatus(cwd),
          withBranches ? getBranches(cwd) : undefined,
        ]);
        if (disposed) return;
        setBranch(status.branch);
        setChanged(status.changed);
        setAvailable(true);
        if (refs) setBranches(refs);
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
        running = false;
        setLoading(false);
        const next = queued;
        queued = undefined;
        if (next) void refresh(next.branches);
      }
    };

    const schedule = (withBranches: boolean) => {
      timerBranches ||= withBranches;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const b = timerBranches;
        timerBranches = false;
        void refresh(b);
      }, DEBOUNCE_MS);
    };

    const checkout = async (name: string) => {
      if (name === branch() || switching()) return;
      setSwitching(name);
      try {
        const cwd = directory();
        const worktree = await worktreeUsingBranch(cwd, name);
        if (worktree?.prunable) {
          await git(["worktree", "prune"], cwd);
        } else if (worktree) {
          context.ui.toast.show({
            title: "Checkout Failed",
            message: `${name} is already checked out in ${worktree.path}`,
            variant: "error",
          });
          return;
        }
        await git(["checkout", name], cwd);
        context.ui.toast.show({
          message: `Switched to ${name}`,
          variant: "success",
        });
        void refresh(true);
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);

        // Short message for local changes that block the checkout
        const blocked = raw.match(
          /would be overwritten by checkout:\s*([\s\S]*?)\s*Please commit/i,
        );

        const message = blocked
          ? `Local changes in: ${blocked[1].split(/\s+/).filter(Boolean).join(", ")}. Commit or stash them first.`
          : raw
              .replace(/^error:\s*/i, "")
              .replace(/\s*Aborting\s*$/i, "")
              .replace(/\s+/g, " ")
              .trim();

        log.error(`could not switch branch to ${name}: ${raw}`);
        context.ui.toast.show({
          title: "Checkout Failed",
          message,
          variant: "error",
        });
      } finally {
        setSwitching(undefined);
      }
    };

    const off = [
      context.data.on("vcs.branch.updated", () => schedule(true)),
      context.data.on("filesystem.changed", () => schedule(false)),
    ];
    void refresh();

    const disposeSlot = context.ui.slot({
      prepend: "sidebar.content",
      render: (input) => {
        void refresh();

        const c = createMemo(() => {
          const t = context.theme;
          return {
            text: t.text.base,
            muted: t.text.muted,
            border: t.border.base,
            success: t.text.feedback.success.base,
            warning: t.text.feedback.warning.base,
          };
        });

        const visible = () => ordered().slice(0, MAX_BRANCHES);
        const hidden = () => Math.max(0, ordered().length - MAX_BRANCHES);

        return (
          <Show when={available()}>
            <box
              ref={(el: { width: number; onSizeChange?: () => void }) => {
                setWidth(el.width);
                el.onSizeChange = () => setWidth(el.width);
              }}
              flexDirection="column"
              width="100%"
              border={true}
              borderStyle="single"
              borderColor={c().border}
              title=" Git Status "
              titleAlignment="left"
              titleColor={c().muted}
              paddingLeft={1}
              paddingRight={1}
            >
              <text>
                <span style={{ fg: c().muted }}>{"Branch".padEnd(9)}</span>
                <span style={{ fg: c().success }}>
                  {"⎇ " + truncate(branch(), branchMaxLength(width(), 13))}
                </span>
              </text>

              <box
                flexDirection="row"
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  void refresh();
                }}
              >
                <text>
                  <span style={{ fg: c().muted }}>{"Status".padEnd(9)}</span>
                  <span
                    style={{ fg: changed() > 0 ? c().warning : c().success }}
                  >
                    {changed() > 0 ? `${changed()} modified` : "clean"}
                  </span>
                  <span style={{ fg: loading() ? c().warning : c().muted }}>
                    {loading() ? "  …" : "  ↻"}
                  </span>
                </text>
              </box>

              <Show when={ordered().length > 0}>
                <text>
                  <span style={{ fg: c().muted }}>{"Branches".padEnd(9)}</span>
                  <span style={{ fg: c().success }}>{ordered().length}</span>
                </text>

                <For each={visible()}>
                  {(name) => {
                    const current = () => name === branch();
                    const busy = () => switching() === name;
                    return (
                      <box
                        flexDirection="row"
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          void checkout(name);
                        }}
                      >
                        <text>
                          <span
                            style={{
                              fg: current()
                                ? c().success
                                : busy()
                                  ? c().warning
                                  : c().border,
                            }}
                          >
                            {"  " +
                              (busy() ? "…" : current() ? "●" : "○") +
                              " "}
                          </span>
                          <span
                            style={{ fg: current() ? c().success : c().text }}
                          >
                            {truncate(
                              name,
                              branchMaxLength(width(), 6, current() ? 7 : 0),
                            )}
                          </span>
                          <Show when={current()}>
                            <span style={{ fg: c().muted }}>{" (HEAD)"}</span>
                          </Show>
                        </text>
                      </box>
                    );
                  }}
                </For>

                <Show when={hidden() > 0}>
                  <text>
                    <span
                      style={{ fg: c().muted }}
                    >{`  +${hidden()} more`}</span>
                  </text>
                </Show>
              </Show>
            </box>
          </Show>
        );
      },
    });

    return () => {
      disposed = true;
      clearTimeout(timer);
      off.forEach((unsubscribe) => unsubscribe());
      disposeSlot();
    };
  },
});
