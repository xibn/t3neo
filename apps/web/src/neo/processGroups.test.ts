import type { ServerProcessDiagnosticsEntry } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { describe, expect, it } from "vite-plus/test";

import { formatBytes, groupProcesses, processDisplayName } from "./processGroups";

function entry(
  pid: number,
  command: string,
  origin?: ServerProcessDiagnosticsEntry["origin"],
  depth = 0,
): ServerProcessDiagnosticsEntry {
  return {
    pid,
    startTimeMs: pid * 10,
    ppid: 1,
    pgid: Option.none(),
    status: "Running",
    cpuPercent: 0,
    rssBytes: 1024,
    elapsed: "0:10",
    command,
    depth,
    childPids: [],
    ...(origin ? { origin } : {}),
  };
}

describe("groupProcesses", () => {
  it("groups by origin, names groups after provider and thread, and orders threads first", () => {
    const titles: Record<string, string> = { "t-1": "Fix login", "t-2": "Write docs" };
    const groups = groupProcesses(
      [
        entry(10, "git status"),
        entry(20, "codex app-server", { kind: "provider", provider: "codex", threadId: "t-2" }),
        entry(21, "zsh -lc pnpm test", { kind: "provider", provider: "codex", threadId: "t-2" }, 1),
        entry(30, "/bin/zsh", { kind: "terminal", threadId: "t-1" }),
        entry(40, "claude --session-id abc", {
          kind: "provider",
          provider: "claude",
          threadId: "t-1",
        }),
      ],
      (threadId) => titles[threadId] ?? null,
    );
    expect(groups.map((group) => group.label)).toEqual([
      "Claude · Fix login",
      "Codex · Write docs",
      "Terminal · Fix login",
      "T3 server helpers",
    ]);
    expect(groups[1]?.processes.map((process) => process.pid)).toEqual([20, 21]);
    expect(groups[3]?.kind).toBe("server");
  });

  it("falls back to a neutral thread label when the thread is unknown", () => {
    const groups = groupProcesses(
      [entry(50, "cursor-agent acp", { kind: "provider", provider: "cursor", threadId: "gone" })],
      () => null,
    );
    expect(groups[0]?.label).toBe("Cursor · Untitled thread");
  });
});

describe("process formatting", () => {
  it("shows the executable name and human byte sizes", () => {
    expect(processDisplayName("/usr/local/bin/codex app-server --flag")).toBe("codex");
    expect(processDisplayName('"C:\\tools\\claude.exe" --print')).toBe("claude.exe");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
    expect(formatBytes(15.5 * 1024 * 1024)).toBe("15.5 MB");
  });
});
