import { Plugin } from "@opencode/plugin/tui";
import { Show } from "solid-js";
import { createGitStatusState, DOUBLE_CLICK_GUARD_MS } from "./state";
import { log, truncate } from "./utils";

export default Plugin.define({
  id: "opencode.sidebar.modern.gitstats",
  setup(context) {
    const props = createGitStatusState(context);

    log.info(`plugin setup() called for directory: ${props.directory}`);

    let lastBranchClick = 0;
    const pressedButtons = new Set<number>();

    const MAX_BRANCHES = 6;

    context.ui.slot({
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
              border={true}
              borderStyle="single"
              borderColor={colors().border}
              title=" Git Status "
              titleAlignment="left"
              titleColor={colors().textMuted}
            >
              <text>
                <span style={{ fg: colors().textMuted }}>
                  {"Branch".padEnd(9)}
                </span>
                <span style={{ fg: colors().success }}>{"⎇ "}</span>
                <span style={{ fg: colors().success }}>
                  {truncate(props.branch(), 17)}
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
                        </span>
                        {" "}
                        <span
                          style={{
                            fg: isCurrent()
                              ? colors().success
                              : colors().textBase,
                          }}
                        >
                          {truncate(name, isCurrent() ? 17 : 23)}
                        </span>
                        {isCurrent() && (
                          <span style={{ fg: colors().textMuted }}>
                            {" (HEAD)"}
                          </span>
                        )}
                        {isSwitching() && (
                          <span style={{ fg: colors().warning }}>
                            {" (…)"}
                          </span>
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
    };
  },
});
