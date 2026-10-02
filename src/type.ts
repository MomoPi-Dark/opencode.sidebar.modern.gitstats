import { Plugin } from "@opencode/plugin/tui";
import { Accessor } from "solid-js";

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
