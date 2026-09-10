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

# Reads and writes FishBot's weight file, so an optimiser can drive the bot from outside the game.
#
# `multiplay/skirmish/fb_includes_v0_5_3/_weights.js` holds every number FishBot behaves from as a flat
# object of scalars. This module rewrites the values in place, leaving the file's comments and layout
# untouched, so the diff between a tuned weight set and the incumbent stays readable.
#
# The tunable subset is deliberately much smaller than the file. `SEARCH_SPACE` below is what the
# optimiser is allowed to move; everything else stays at its hand-tuned value.

import json
import re
import shutil
from pathlib import Path
from typing import Dict, List, Tuple

REPO_ROOT = Path(__file__).resolve().parents[1]
WEIGHTS_PATH = REPO_ROOT / "multiplay" / "skirmish" / "fb_includes_v0_5_3" / "_weights.js"

BEGIN_MARKER = "/* FB_WEIGHTS_BEGIN */"
END_MARKER = "/* FB_WEIGHTS_END */"


# ------------------------------------------------------------------------------------------------------
# The search space
# ------------------------------------------------------------------------------------------------------
#
# Three groups of parameters, covering how big a brigade is, what it is made of, and the order it fills in:
#
#   BRIGADE_SIZE      total units per brigade
#   BRIGADE_SHARE_*   how the combat slots divide between categories  -> the brigade's destination
#   UNIT_WEIGHT_*     production priority per category                -> the order it gets there
#
# Size and order interact, which is why they are tuned together: brigade size decides how long a brigade
# spends part-filled, and that is the only window in which build order has any effect.
#
# `hq_command.js` turns size and shares into integer unit counts by largest-remainder apportionment, so
# shares need not sum to 1 and every point in the box yields a valid brigade. The optimiser needs no
# constraint handling and no repair step.
#
# Heavy cavalry is excluded from both vectors on purpose. Both are scale-invariant - multiplying every
# share, or every unit weight, leaves behaviour exactly unchanged - so holding one category fixed as the
# reference removes a direction the optimiser would otherwise search along to no effect. Everything else is
# expressed relative to it, and pinning one member costs no coverage: any composition or ordering reachable
# with all of them free is still reachable with one held.
#
# Lower bounds sit above 0 for two different reasons. A share of 0 would drop a unit type from the army
# altogether, which is a different experiment from tuning proportions. A unit weight of 0 is worse than
# small: at zero or below a category is never produced at all, however large its deficit grows.
#
# Infantry has a share but no unit weight: it is built from cyborg factories on a separate path which the
# production-order scoring does not touch.
#
#   name: (low, high, is_integer)
SEARCH_SPACE: Dict[str, Tuple[float, float, bool]] = {
    # Size
    "BRIGADE_SIZE":                         (15, 30, True),

    # Composition, relative to BRIGADE_SHARE_HEAVY_CAVALRY = 0.375 (held fixed)
    "BRIGADE_SHARE_LIGHT_CAVALRY":          (0.02, 1.2, False),
    "BRIGADE_SHARE_INDIRECT":               (0.02, 1.2, False),
    "BRIGADE_SHARE_INFANTRY":               (0.02, 1.2, False),

    # Build order, relative to UNIT_WEIGHT_HEAVY_CAV = 0.55 (held fixed)
    "UNIT_WEIGHT_LIGHT_CAV":                (0.05, 2.0, False),
    "UNIT_WEIGHT_SHORT_RANGE_FIRE_SUPPORT": (0.05, 2.0, False),
}

# Held fixed as the reference for each scale-invariant vector. Listed so the reason is discoverable from
# here, and so a run can assert they were not moved by accident.
REFERENCE_WEIGHTS: Dict[str, float] = {
    "BRIGADE_SHARE_HEAVY_CAVALRY": 0.375,
    "UNIT_WEIGHT_HEAVY_CAV": 0.55,
}

# Order is fixed so that a parameter vector always means the same thing across runs.
PARAMETER_NAMES: List[str] = list(SEARCH_SPACE.keys())


def read_weights(path: Path = WEIGHTS_PATH) -> dict:
    """
    Parses `_weights.js` into a plain dict.

    The marked region is a JavaScript object literal of scalars with `//` comments, which is close enough
    to JSON to convert with a few substitutions - and strict enough that anything unexpected raises rather
    than being silently mis-read.
    """
    source = path.read_text(encoding="utf-8")

    try:
        body = source.split(BEGIN_MARKER)[1].split(END_MARKER)[0]
    except IndexError as exc:
        raise ValueError(f"{path} is missing its {BEGIN_MARKER} / {END_MARKER} markers") from exc

    body = body.strip()
    body = re.sub(r"^const\s+FB_WEIGHTS\s*=\s*", "", body)
    body = body.rstrip(";").strip()

    body = re.sub(r"//[^\n]*", "", body)                # line comments
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)   # block comments
    body = re.sub(r",(\s*})", r"\1", body)              # trailing commas
    body = re.sub(r"(\w+)\s*:", r'"\1":', body)         # bare keys -> quoted keys

    return json.loads(body)


def _format_value(value) -> str:
    """Renders a Python scalar as the JavaScript literal to write back into the file."""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        # Integral floats are written without a decimal point, matching how the file is hand-written.
        return str(int(value)) if value.is_integer() else repr(round(value, 6))
    if isinstance(value, str):
        return json.dumps(value)
    raise TypeError(f"cannot write {type(value).__name__} into _weights.js: {value!r}")


def write_weights(updates: dict, path: Path = WEIGHTS_PATH, backup: bool = False) -> List[str]:
    """
    Updates weights in place, rewriting only the value on each affected line.

    Comments, ordering and formatting are preserved, so `git diff` shows exactly which weights moved.

    Parameters
    ----------
    updates
        Weight name -> new value. Every name must already exist in the file; a typo raises rather than
        silently adding a weight the bot will never read.
    backup
        When True, copies the file to `<name>.bak` first.

    Returns
    -------
    list[str]
        The names that were written, in file order.
    """
    source = path.read_text(encoding="utf-8")

    if BEGIN_MARKER not in source or END_MARKER not in source:
        raise ValueError(f"{path} is missing its {BEGIN_MARKER} / {END_MARKER} markers")

    existing = read_weights(path)
    unknown = sorted(set(updates) - set(existing))
    if unknown:
        raise KeyError(f"not present in {path.name}: {', '.join(unknown)}")

    if backup:
        shutil.copyfile(path, path.with_suffix(path.suffix + ".bak"))

    head, rest = source.split(BEGIN_MARKER, 1)
    body, tail = rest.split(END_MARKER, 1)

    written = []
    lines = body.split("\n")

    for index, line in enumerate(lines):
        # Skip comment bodies, so a weight name mentioned in prose is never mistaken for its definition.
        stripped = line.lstrip()
        if stripped.startswith(("//", "*", "/*")):
            continue

        match = re.match(r"^(\s*)([A-Za-z_][A-Za-z_0-9]*)(\s*:\s*)(.*)$", line)
        if match is None:
            continue

        indent, name, separator, remainder = match.groups()
        if name not in updates:
            continue

        # Most entries carry an explanatory trailing comment. Split it off, keeping the whitespace that
        # separates it from the value, so the file's alignment survives the rewrite. No weight's value
        # contains "//" - they are all numbers, booleans, or simple quoted strings.
        comment_at = remainder.find("//")
        value_text = remainder if comment_at == -1 else remainder[:comment_at]
        comment = "" if comment_at == -1 else remainder[comment_at:]

        value = value_text.rstrip()
        gap = value_text[len(value):]
        comma = "," if value.endswith(",") else ""

        lines[index] = f"{indent}{name}{separator}{_format_value(updates[name])}{comma}{gap}{comment}"
        written.append(name)

    missing = sorted(set(updates) - set(written))
    if missing:
        raise ValueError(
            f"could not rewrite {', '.join(missing)} in {path.name}. "
            "Each weight must sit on its own line as `NAME: value,`."
        )

    path.write_text(head + BEGIN_MARKER + "\n".join(lines) + END_MARKER + tail, encoding="utf-8")
    return written


# ------------------------------------------------------------------------------------------------------
# Optimiser plumbing
# ------------------------------------------------------------------------------------------------------

def bounds() -> Tuple[List[float], List[float]]:
    """Returns (lower, upper) bounds as two lists ordered by `PARAMETER_NAMES`."""
    lower = [SEARCH_SPACE[name][0] for name in PARAMETER_NAMES]
    upper = [SEARCH_SPACE[name][1] for name in PARAMETER_NAMES]
    return lower, upper


def vector_to_weights(vector) -> dict:
    """
    Converts a parameter vector into a weight dict, clamping to bounds and rounding integer parameters.

    Clamping here rather than in the optimiser means a particle that strays outside its box still produces
    a runnable configuration, and the value written to disk is exactly the value the game ran.
    """
    if len(vector) != len(PARAMETER_NAMES):
        raise ValueError(f"expected {len(PARAMETER_NAMES)} parameters, got {len(vector)}")

    weights = {}
    for name, raw in zip(PARAMETER_NAMES, vector):
        low, high, is_integer = SEARCH_SPACE[name]
        value = min(max(float(raw), low), high)
        weights[name] = int(round(value)) if is_integer else value

    return weights


def weights_to_vector(weights: dict) -> List[float]:
    """Inverse of `vector_to_weights`, for seeding an optimiser from the incumbent."""
    return [float(weights[name]) for name in PARAMETER_NAMES]


def incumbent_vector(path: Path = WEIGHTS_PATH) -> List[float]:
    """The parameter vector currently on disk. Seed the swarm with this so a run can only improve."""
    return weights_to_vector(read_weights(path))


def check_reference_weights(path: Path = WEIGHTS_PATH) -> None:
    """
    Asserts the pinned reference weights still hold their expected values.

    The shares and the unit weights are each scale-invariant, so a reference that has drifted does not
    break anything visibly - it silently rescales what every other value in that vector means, and results
    from before and after the drift stop being comparable. Call this before a run.
    """
    current = read_weights(path)

    drifted = {
        name: (expected, current[name])
        for name, expected in REFERENCE_WEIGHTS.items()
        if current.get(name) != expected
    }

    if drifted:
        detail = ", ".join(f"{n}: expected {e}, found {f}" for n, (e, f) in drifted.items())
        raise ValueError(f"reference weights have drifted in {path.name} ({detail})")


def apply_vector(vector, weight_set_id: str, path: Path = WEIGHTS_PATH) -> dict:
    """
    Writes a parameter vector to the weight file and stamps it with an identifier.

    FishBot logs `WEIGHT_SET_ID` at startup, so the id ties each scraped result back to the exact vector
    that produced it. Use something reconstructable, e.g. "gen03_p07".

    Returns
    -------
    dict
        The weights actually written, after clamping and rounding.
    """
    weights = vector_to_weights(vector)
    write_weights({**weights, "WEIGHT_SET_ID": weight_set_id}, path=path)
    return weights


if __name__ == "__main__":
    current = read_weights()

    print(f"{WEIGHTS_PATH.relative_to(REPO_ROOT)}: {len(current)} weights\n")
    print(f"Weight set id: {current['WEIGHT_SET_ID']}")

    try:
        check_reference_weights()
        print("Reference weights: unchanged\n")
    except ValueError as exc:
        print(f"Reference weights: {exc}\n")

    print(f"{'search parameter':<40} {'incumbent':>10}   bounds")
    for name in PARAMETER_NAMES:
        low, high, is_integer = SEARCH_SPACE[name]
        kind = "int" if is_integer else "float"
        print(f"{name:<40} {current[name]:>10}   [{low}, {high}] {kind}")

    print(f"\n{'held fixed as reference':<40} {'value':>10}")
    for name, expected in REFERENCE_WEIGHTS.items():
        print(f"{name:<40} {current[name]:>10}")

    print(f"\n{len(PARAMETER_NAMES)} dimensions")
