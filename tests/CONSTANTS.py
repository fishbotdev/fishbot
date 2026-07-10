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

# This file is intended to be a header file used in all test scripts.

EASY_DIFFICULTY = "Easy"
MEDIUM_DIFFICULTY = "Medium"
HARD_DIFFICULTY = "Hard"
INSANE_DIFFICULTY = "Insane"

FISHBOT_AI = "fishbot/multiplay/skirmish/FishBot.js"
COBRA_AI = "Cobra.js"
PEACEMAKER_AI = "PeacemakerAI.js"
SPECTATOR_AI = "Spectator.js"       # this is a custom spectator AI script with details below:
"""

`Spectator.js` contains:
---
function eventStartLevel() {
	transformPlayerToSpectator(me);	
}
---
while `Spectator.json` contains:
---
{
	"AI": {
		"js": "Spectator.js",
		"name": "Spectator",
		"tip": "Sets itself to a spectator as soon as the game starts."
	}
}
---
"""