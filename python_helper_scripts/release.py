"""
FishBot release prep.

Run `bump_version.py` first, at the start of a new dev cycle. This script
covers everything after that, up to leaving the development branch fully
committed and ready to push. Pushing, opening the PR, merging, tagging, and
drafting the GitHub Release are all done manually on GitHub's website.

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


def cmd_checklist():
    print(__doc__)
    steps = [
        ("1. Bump FISHBOT_VERSION + FishBot.json name + DEBUG_MODE_ON=true", "bump_version.py (start of dev cycle)"),
        ("2. Disable debug beacons / hackMarkTiles()", "menu option: Scan for debug beacons (manual review)"),
        ("3. Run tests/run_tests.py, update README with results", "manual (see tests/DEVELOPMENT.md)"),
        ("4. Extract autogame logs via process_performance_data.py", "manual"),
        ("5. Set DEBUG_MODE_ON = false", "menu option: Toggle DEBUG_MODE_ON"),
        ("6. Manually test all manual-test maps vs Cobra @ Medium", "manual"),
        ("7. Update LOC stats via cloc", "menu option: Update LOC stats"),
        ("8. Update README.md with summary of changes", "manual"),
        ("9. Update CHANGELOG.md", "manual"),
        ("10. Commit all changes on development branch", "menu option: Stage & commit"),
        ("11. Build the release zip", "menu option: Build release zip"),
        ("--- everything below is manual, on GitHub ---", ""),
        ("12. Push development, open PR 'FishBot vX.Y.Z Release'", "manual (git push + GitHub web)"),
        ("13. Merge the PR into main", "manual (GitHub web)"),
        ("14. Create the GitHub Release: tag fishbot-vX.Y.Z on main,", ""),
        ("    paste CHANGELOG notes, attach the zip from step 11", "manual (GitHub web)"),
    ]
    for step, how in steps:
        print(f"  {step}" + (f"\n      -> {how}" if how else ""))


def cmd_scan_debug():
    _, dotted = get_current_version()
    underscore = dotted.replace(".", "_")
    inc_dir = SKIRMISH_DIR / f"fb_includes_v{underscore}"
    pattern = re.compile(r"hackMarkTiles\(|addBeacon\(")
    found = False
    for path in sorted(inc_dir.glob("*.js")):
        for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if pattern.search(line):
                found = True
                print(f"{path.relative_to(REPO_ROOT)}:{i}: {line.strip()}")
    if not found:
        print("No hackMarkTiles()/addBeacon() calls found.")
    print("\nReview each call above and confirm it's meant to ship, or gate it behind DEBUG_MODE_ON.")


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


def cmd_commit():
    run(["git", "status", "--short"])
    message = input("Commit message: ").strip()
    if not message:
        print("Empty message, aborted.")
        return
    if not confirm(f'Stage all changes and commit with message: "{message}"?'):
        print("Skipped.")
        return
    run(["git", "add", "-A"])
    run(["git", "commit", "-m", message])


MENU = [
    ("1", "Print release checklist", cmd_checklist),
    ("2", "Scan for debug beacons / hackMarkTiles calls", cmd_scan_debug),
    ("3", "Toggle DEBUG_MODE_ON", cmd_debug),
    ("4", "Update LOC stats (runs cloc)", cmd_loc),
    ("5", "Build release zip", cmd_zip),
    ("6", "Stage & commit changes", cmd_commit),
    ("0", "Quit", None),
]


def main():
    while True:
        print("\nFishBot release prep")
        for key, label, _ in MENU:
            print(f"  {key}) {label}")
        choice = input("Choose an option: ").strip().lower()
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
