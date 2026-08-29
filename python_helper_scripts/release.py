"""
FishBot release prep.

Run `bump_version.py` first, at the start of a new dev cycle. This script
covers the mechanical steps after that -- see docs/DEVELOPMENT.md for the
full release checklist (tests, manual map testing, README/CHANGELOG, and
the manual push/PR/merge/GitHub Release steps).

No command-line arguments needed -- just run this file (e.g. hit Run/F5 in
your IDE). It shows a menu and prompts for anything it needs.
"""

import re
import subprocess
import zipfile
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKIRMISH_DIR = REPO_ROOT / "multiplay" / "skirmish"
RELEASES_DIR = REPO_ROOT / "releases"
CLOC_EXE = REPO_ROOT / "python_helper_scripts" / "cloc-2.08.exe"


class StepError(Exception):
    """Raised for an expected, recoverable problem -- caught by the menu loop."""


def confirm(prompt: str) -> bool:
    answer = input(f"{prompt} [y/N] ").strip().lower()
    return answer == "y"


def run(cmd: list[str], cwd: Path = REPO_ROOT) -> None:
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True)


def get_current_version() -> tuple[str, str]:
    """Returns (underscore_version, dotted_version), e.g. ("0_5_2", "0.5.2")."""
    matches = list(SKIRMISH_DIR.glob("FishBot_v*.js"))
    if len(matches) != 1:
        raise StepError(f"Expected exactly one FishBot_v*.js in {SKIRMISH_DIR}, found: {matches}")
    m = re.fullmatch(r"FishBot_v([\d_]+)\.js", matches[0].name)
    if not m:
        raise StepError(f"Could not parse version from {matches[0].name}")
    underscore = m.group(1)
    return underscore, underscore.replace("_", ".")


def cmd_debug():
    state = input("Set DEBUG_MODE_ON to 'on' or 'off': ").strip().lower()
    if state not in ("on", "off"):
        print("Please enter 'on' or 'off'.")
        return
    _, dotted = get_current_version()
    underscore = dotted.replace(".", "_")
    js_path = SKIRMISH_DIR / f"FishBot_v{underscore}.js"
    text = js_path.read_text(encoding="utf-8")
    new_value = "true" if state == "on" else "false"
    new_text, n = re.subn(
        r"const DEBUG_MODE_ON = (true|false);",
        f"const DEBUG_MODE_ON = {new_value};",
        text,
    )
    if n == 0:
        raise StepError("Could not find DEBUG_MODE_ON in " + str(js_path))
    js_path.write_text(new_text, encoding="utf-8")
    print(f"Set DEBUG_MODE_ON = {new_value} in {js_path.relative_to(REPO_ROOT)}")
    run(["git", "diff", "--", str(js_path)])
    if confirm(f"Stage and commit as 'chore: set DEBUG_MODE_ON = {new_value} for release'?"):
        run(["git", "add", "--", str(js_path)])
        run(["git", "commit", "-m", f"chore: set DEBUG_MODE_ON = {new_value} for release"])
    else:
        print("Left uncommitted.")


def cmd_loc():
    if not CLOC_EXE.exists():
        raise StepError(f"cloc executable not found at {CLOC_EXE}")
    _, dotted = get_current_version()
    result = subprocess.run(
        [str(CLOC_EXE), "--include-lang=JavaScript", "multiplay/skirmish/"],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    print(result.stdout)
    m = re.search(r"^JavaScript\s+\d+\s+\d+\s+\d+\s+(\d+)", result.stdout, re.MULTILINE)
    if not m:
        raise StepError("Could not parse LOC from cloc output above.")
    loc = m.group(1)
    date_str = datetime.now().strftime("%d %b %Y")
    new_line = f"\t- {loc} JS @ {date_str}: v{dotted} release"
    print(f"\nProposed new line:\n{new_line}")

    underscore = dotted.replace(".", "_")
    js_path = SKIRMISH_DIR / f"FishBot_v{underscore}.js"
    text = js_path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    last_bullet_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^\t- .*release", line):
            last_bullet_idx = i
    if last_bullet_idx is None:
        raise StepError("Could not find the LOC history bullet list in " + str(js_path))

    if confirm(f"Insert this line into {js_path.relative_to(REPO_ROOT)}?"):
        lines.insert(last_bullet_idx + 1, new_line + "\n")
        js_path.write_text("".join(lines), encoding="utf-8")
        run(["git", "diff", "--", str(js_path)])
        if confirm("Stage and commit as 'docs: updated LOC stats'?"):
            run(["git", "add", "--", str(js_path)])
            run(["git", "commit", "-m", "docs: updated LOC stats"])
    else:
        print("Skipped.")


def cmd_zip():
    underscore, dotted = get_current_version()
    js_path = SKIRMISH_DIR / f"FishBot_v{underscore}.js"
    json_path = SKIRMISH_DIR / f"FishBot_v{underscore}.json"
    inc_dir = SKIRMISH_DIR / f"fb_includes_v{underscore}"

    RELEASES_DIR.mkdir(exist_ok=True)
    out_path = RELEASES_DIR / f"fishbot-v{dotted}.zip"
    if out_path.exists() and not confirm(f"{out_path.name} already exists. Overwrite?"):
        print("Skipped.")
        return

    files = [js_path, json_path] + sorted(inc_dir.glob("*.js"))
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            arcname = "multiplay/skirmish/" + str(f.relative_to(SKIRMISH_DIR)).replace("\\", "/")
            zf.write(f, arcname)
            print(f"  + {arcname}")

    print(f"\nWrote {out_path.relative_to(REPO_ROOT)} ({out_path.stat().st_size:,} bytes, {len(files)} files)")
    print("Attach this zip when drafting the GitHub Release.")


MENU = [
    ("1", "Toggle DEBUG_MODE_ON", cmd_debug),
    ("2", "Update LOC stats (runs cloc)", cmd_loc),
    ("3", "Build release zip", cmd_zip),
    ("0", "Quit", None),
]


def main():
    while True:
        print("\nFishBot Release\n")

        print("REMINDERS\n")
        print("> run tests/run_tests.py & check perf logs\n"
              "> manually test remaining maps in README.md\n"
              "> update README.md & CHANGELOG.md with changes and test results\n")

        print("Tools\n")

        for key, label, _ in MENU:
            print(f"  [{key}] {label}")
        print()

        choice = input("Enter Option number: ").strip().lower()

        if choice in ("0", "q", "quit", "exit"):
            break
        entry = next((e for e in MENU if e[0] == choice), None)
        if entry is None:
            print("Invalid choice.")
            continue
        try:
            entry[2]()
        except StepError as e:
            print(f"Error: {e}")


if __name__ == "__main__":
    main()
