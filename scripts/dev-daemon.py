#!/usr/bin/env python3
"""Double-fork daemonizer to start the Next.js dev server fully detached.

The sandbox reaps the process tree of each finished Bash tool command.
A classic double-fork + setsid leaves the final process orphaned and
reparented to init (PPID 1), which survives across commands — the same
mechanism agent-browser uses for its persistent chrome daemon.
"""
import os
import sys

PROJECT = "/home/z/my-project"


def main() -> int:
    if os.path.exists("/home/z/my-project/.zscripts/dev-up.lock"):
        try:
            with open("/home/z/my-project/.zscripts/dev-up.lock") as f:
                pid = int(f.read().strip())
            os.kill(pid, 0)
            print(f"dev server already running (pid {pid})")
            return 0
        except Exception:
            pass

    pid = os.fork()
    if pid > 0:
        # parent exits immediately
        print(f"daemonizer: started (child pid {pid})")
        return 0

    # first child: new session, drop controlling terminal
    os.setsid()

    pid2 = os.fork()
    if pid2 > 0:
        os._exit(0)

    # grandchild: the actual server
    os.chdir(PROJECT)
    with open("/dev/null", "rb") as r, open("/dev/null", "ab") as w:
        os.dup2(r.fileno(), 0)
        os.dup2(w.fileno(), 1)
        os.dup2(w.fileno(), 2)
    try:
        os.execvp("bun", ["bun", "run", "dev"])
    except Exception as e:
        # unreachable on success (exec replaces process)
        print(f"exec failed: {e}", file=sys.stderr)
        os._exit(1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
