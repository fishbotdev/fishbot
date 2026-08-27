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

r"""
The purpose of this file is to recover FishBot's telemetry (`TEL`) events from a scraped game console.

The producing side is `multiplay/skirmish/fb_includes_v0_5_1/hq_telemetry.js` - that file is the
authority on the wire format, and this file is its only consumer. Keep the two in step.

Wire format (one event per console line):

    TEL|<schemaVersion>|<eventName>|<compact json payload>

e.g.

    TEL|1|OIL|{"t":300000,"p":1,"tot":12,"dpp":6,"alive":[1,2],"der":[5,3],"dom":false}

Telemetry travels on the *same* console output which `_run_and_save_autogames.py` already scrapes for
the "Game State" summary table - FishBot's `debug()` output is only reliably recoverable by scraping
the console. There is therefore no extra capture step: the same scrape is simply read twice, once for
the summary table (from the last "Game State" marker onwards) and once for telemetry (the whole
history, since telemetry is emitted throughout the game).
"""

import json

from typing import List


# The wire format. Must match `TEL_SCHEMA_VERSION` and the `#emit()` template in `hq_telemetry.js`.
TEL_PREFIX = "TEL|"
TEL_SCHEMA_VERSION = 1

# The console scraper returns one entry per console *row*, so a telemetry line longer than the console
# width arrives split across consecutive entries. Payloads are kept short to avoid this, but we still
# tolerate it by re-joining a few following rows before giving up on a line.
MAX_UNWRAP_JOINS = 2


def _parse_telemetry_line(line: str) -> dict | None:
    """
    Parses a single `TEL|...` line into an event dict.

    Returns None if the line is not a telemetry line of a schema version we understand, or if the
    payload is not valid JSON (e.g. because the console wrapped it - see `extract_telemetry_events`).
    """

    if not line.startswith(TEL_PREFIX):
        return None

    # "TEL", schema version, event name, payload. `maxsplit` protects any "|" inside the payload.
    parts = line.split("|", 3)

    if len(parts) != 4:
        return None

    _, schema_version, event_name, payload_text = parts

    try:
        if int(schema_version) != TEL_SCHEMA_VERSION:
            return None
    except ValueError:
        return None

    try:
        payload = json.loads(payload_text)
    except json.JSONDecodeError:
        return None

    if not isinstance(payload, dict):
        return None

    return {
        "event": event_name,
        **payload,
    }


def extract_telemetry_events(console_history: List[str]) -> List[dict]:
    """
    Recovers every telemetry event from a scraped console history.

    Scans the *whole* history (unlike the summary-table parser, which only looks at the tail), since
    telemetry is emitted continuously during the game.

    Non-telemetry console output is ignored. A telemetry line which the console wrapped onto the next
    row is recovered by re-joining up to `MAX_UNWRAP_JOINS` following rows; a line which still cannot
    be parsed after that is dropped rather than raising, so that one mangled line cannot cost us a
    whole game's telemetry.

    Returns
    -------
    list[dict]
        One dict per event, e.g.
        {"event": "OIL", "t": 300000, "p": 1, "tot": 12, "dpp": 6, "alive": [1, 2], "der": [5, 3], "dom": False}
    """

    events = []

    for index, line in enumerate(console_history):

        if not line.startswith(TEL_PREFIX):
            continue

        event = _parse_telemetry_line(line)

        # The line may have been wrapped by the console. Re-join the following rows and retry.
        joined = line
        joins = 0

        while event is None and joins < MAX_UNWRAP_JOINS and (index + joins + 1) < len(console_history):
            joined += console_history[index + joins + 1]
            joins += 1
            event = _parse_telemetry_line(joined)

        if event is not None:
            events.append(event)

    return events
