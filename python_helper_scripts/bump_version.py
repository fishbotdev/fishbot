"""
	This file is part of FishBot, a Warzone 2100 AI.

	FishBot is free software; you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation; either version 2 of the License, or
	(at your option) any later version.

	FishBot is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License along with this program.
	If not, see <https://www.gnu.org/licenses/>.
"""

"""
FishBot version bump.

Run this once, at the start of a new development cycle (right after the
previous release's tag was cut on main). It renames the version-suffixed
files/folders, updates the version constants, and turns DEBUG_MODE_ON on
for the new cycle. Mirrors the pattern used in commit ff443201.

No command-line arguments needed -- just run this file (e.g. hit Run/F5 in
your IDE) and it will prompt for the new version number.

Authored by Claude (Opus 5).
"""

import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SKIRMISH_DIR = REPO_ROOT / "multiplay" / "skirmish"
CONSTANTS_PY = REPO_ROOT / "tests" / "CONSTANTS.py"


def confirm(prompt: str) -> bool:
    return input(f"{prompt} [y/N] ").strip().lower() == "y"


def run(cmd: list[str], cwd: Path = REPO_ROOT) -> None:
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=cwd, check=True)


def get_current_version() -> str:
    """Returns the current underscore version, e.g. "0_5_2"."""
    matches = list(SKIRMISH_DIR.glob("FishBot_v*.js"))
    if len(matches) != 1:
        sys.exit(f"Expected exactly one FishBot_v*.js in {SKIRMISH_DIR}, found: {matches}")
    m = re.fullmatch(r"FishBot_v([\d_]+)\.js", matches[0].name)
    if not m:
        sys.exit(f"Could not parse version from {matches[0].name}")
    return m.group(1)


def main():
    old_underscore = get_current_version()
    old_dotted = old_underscore.replace("_", ".")
    print(f"Current version: {old_dotted}")

    new_dotted = input("New version (e.g. 0.5.3): ").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", new_dotted):
        sys.exit(f"Version must look like X.Y.Z, got: {new_dotted}")
    if old_dotted == new_dotted:
        sys.exit(f"Already at version {old_dotted}")
    new_underscore = new_dotted.replace(".", "_")

    old_js = SKIRMISH_DIR / f"FishBot_v{old_underscore}.js"
    old_json = SKIRMISH_DIR / f"FishBot_v{old_underscore}.json"
    old_inc = SKIRMISH_DIR / f"fb_includes_v{old_underscore}"
    new_js = SKIRMISH_DIR / f"FishBot_v{new_underscore}.js"
    new_json = SKIRMISH_DIR / f"FishBot_v{new_underscore}.json"
    new_inc = SKIRMISH_DIR / f"fb_includes_v{new_underscore}"

    if not confirm(f"Bump {old_dotted} -> {new_dotted}?"):
        print("Aborted.")
        return

    run(["git", "mv", str(old_js), str(new_js)])
    run(["git", "mv", str(old_json), str(new_json)])
    run(["git", "mv", str(old_inc), str(new_inc)])

    js_text = new_js.read_text(encoding="utf-8")
    js_text = re.sub(r'const FISHBOT_VERSION = "[\d.]+";', f'const FISHBOT_VERSION = "{new_dotted}";', js_text)
    js_text = js_text.replace(f"fb_includes_v{old_underscore}/", f"fb_includes_v{new_underscore}/")
    js_text = re.sub(r"const DEBUG_MODE_ON = (true|false);", "const DEBUG_MODE_ON = true;", js_text)
    new_js.write_text(js_text, encoding="utf-8")

    json_text = new_json.read_text(encoding="utf-8")
    json_text = re.sub(r'"js":\s*"FishBot_v[\d_]+\.js"', f'"js": "FishBot_v{new_underscore}.js"', json_text)
    json_text = re.sub(r'"name":\s*"FishBot v[\d.]+"', f'"name": "FishBot v{new_dotted}"', json_text)
    new_json.write_text(json_text, encoding="utf-8")

    constants_text = CONSTANTS_PY.read_text(encoding="utf-8")
    constants_text = re.sub(
        r'FISHBOT_VERSION_NUMBER = "[\d_]+"',
        f'FISHBOT_VERSION_NUMBER = "{new_underscore}"',
        constants_text,
    )
    CONSTANTS_PY.write_text(constants_text, encoding="utf-8")

    print(f"\nDEBUG_MODE_ON set to true in {new_js.relative_to(REPO_ROOT)} for the new dev cycle.")
    print("\nUpdated files:")
    run(["git", "status", "--short"])

    if confirm(f"\nStage and commit as 'chore: bumped version to {new_dotted}'?"):
        run(["git", "add", "-A", "--", str(SKIRMISH_DIR), str(CONSTANTS_PY)])
        run(["git", "commit", "-m", f"chore: bumped version to {new_dotted}"])
    else:
        print("Left uncommitted.")


if __name__ == "__main__":
    main()
