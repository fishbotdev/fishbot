"""
FishBot release prep.

Run `bump_version.py` first, at the start of a new dev cycle. This script
covers everything after that, up to leaving the development branch fully
committed and ready to push. Pushing, opening the PR, merging, tagging, and
drafting the GitHub Release are all done manually on GitHub's website.

Requires: Python 3.11+ and git on PATH. No GitHub CLI dependency.

Usage examples:
    python release.py checklist
    python release.py scan-debug
    python release.py debug off
    python release.py loc
    python release.py zip
    python release.py commit -m "docs: updated changelog for v0.5.3"
"""

import argparse
import re
import subprocess
import sys
import zipfile
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKIRMISH_DIR = REPO_ROOT / "multiplay" / "skirmish"
RELEASES_DIR = REPO_ROOT / "releases"
CLOC_EXE = REPO_ROOT / "python_helper_scripts" / "cloc-2.08.exe"


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
        sys.exit(f"Expected exactly one FishBot_v*.js in {SKIRMISH_DIR}, found: {matches}")
    m = re.fullmatch(r"FishBot_v([\d_]+)\.js", matches[0].name)
    if not m:
        sys.exit(f"Could not parse version from {matches[0].name}")
    underscore = m.group(1)
    return underscore, underscore.replace("_", ".")


def cmd_checklist(_args):
    print(__doc__)
    steps = [
        ("1. Bump FISHBOT_VERSION + FishBot.json name + DEBUG_MODE_ON=true", "bump_version.py <new_version> (start of dev cycle)"),
        ("2. Disable debug beacons / hackMarkTiles()", "release.py scan-debug (manual review)"),
        ("3. Run tests/run_tests.py, update README with results", "manual (see tests/DEVELOPMENT.md)"),
        ("4. Extract autogame logs via process_performance_data.py", "manual"),
        ("5. Set DEBUG_MODE_ON = false", "release.py debug off"),
        ("6. Manually test all manual-test maps vs Cobra @ Medium", "manual"),
        ("7. Update LOC stats via cloc", "release.py loc"),
        ("8. Update README.md with summary of changes", "manual"),
        ("9. Update CHANGELOG.md", "manual"),
        ("10. Commit all changes on development branch", "release.py commit -m \"...\""),
        ("11. Build the release zip", "release.py zip"),
        ("--- everything below is manual, on GitHub ---", ""),
        ("12. Push development, open PR 'FishBot vX.Y.Z Release'", "manual (git push + GitHub web)"),
        ("13. Merge the PR into main", "manual (GitHub web)"),
        ("14. Create the GitHub Release: tag fishbot-vX.Y.Z on main,", ""),
        ("    paste CHANGELOG notes, attach the zip from step 11", "manual (GitHub web)"),
    ]
    for step, how in steps:
        print(f"  {step}" + (f"\n      -> {how}" if how else ""))


def cmd_scan_debug(_args):
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


def cmd_debug(args):
    _, dotted = get_current_version()
    underscore = dotted.replace(".", "_")
    js_path = SKIRMISH_DIR / f"FishBot_v{underscore}.js"
    text = js_path.read_text(encoding="utf-8")
    new_value = "true" if args.state == "on" else "false"
    new_text, n = re.subn(
        r"const DEBUG_MODE_ON = (true|false);",
        f"const DEBUG_MODE_ON = {new_value};",
        text,
    )
    if n == 0:
        sys.exit("Could not find DEBUG_MODE_ON in " + str(js_path))
    js_path.write_text(new_text, encoding="utf-8")
    print(f"Set DEBUG_MODE_ON = {new_value} in {js_path.relative_to(REPO_ROOT)}")
    run(["git", "diff", "--", str(js_path)])
    if confirm(f"Stage and commit as 'chore: set DEBUG_MODE_ON = {new_value} for release'?"):
        run(["git", "add", "--", str(js_path)])
        run(["git", "commit", "-m", f"chore: set DEBUG_MODE_ON = {new_value} for release"])
    else:
        print("Left uncommitted.")


def cmd_loc(_args):
    if not CLOC_EXE.exists():
        sys.exit(f"cloc executable not found at {CLOC_EXE}")
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
        sys.exit("Could not parse LOC from cloc output above.")
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
        sys.exit("Could not find the LOC history bullet list in " + str(js_path))

    if confirm(f"Insert this line into {js_path.relative_to(REPO_ROOT)}?"):
        lines.insert(last_bullet_idx + 1, new_line + "\n")
        js_path.write_text("".join(lines), encoding="utf-8")
        run(["git", "diff", "--", str(js_path)])
        if confirm("Stage and commit as 'docs: updated LOC stats'?"):
            run(["git", "add", "--", str(js_path)])
            run(["git", "commit", "-m", "docs: updated LOC stats"])
    else:
        print("Skipped.")


def cmd_zip(_args):
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


def cmd_commit(args):
    run(["git", "status", "--short"])
    if not confirm(f"Stage all changes and commit with message: \"{args.message}\"?"):
        print("Skipped.")
        return
    run(["git", "add", "-A"])
    run(["git", "commit", "-m", args.message])


def main():
    parser = argparse.ArgumentParser(description="FishBot release prep")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("checklist", help="Print the full release checklist").set_defaults(func=cmd_checklist)
    sub.add_parser("scan-debug", help="List hackMarkTiles()/addBeacon() calls for manual review").set_defaults(
        func=cmd_scan_debug
    )

    p = sub.add_parser("debug", help="Toggle DEBUG_MODE_ON")
    p.add_argument("state", choices=["on", "off"])
    p.set_defaults(func=cmd_debug)

    sub.add_parser("loc", help="Run cloc and append a new LOC history line").set_defaults(func=cmd_loc)
    sub.add_parser("zip", help="Build the release zip into .\\releases").set_defaults(func=cmd_zip)

    p = sub.add_parser("commit", help="Stage all changes and commit")
    p.add_argument("-m", "--message", required=True)
    p.set_defaults(func=cmd_commit)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
