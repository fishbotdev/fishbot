/*
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
*/

/**
 * 	**WORLD STATE**
 * 	- `state` stores information about the map & the current game state.
 */
const state = new worldState();

/**
 *	**G2 - INTELLIGENCE**
	- Analyses terrain (e.g. `state.poi`, `state.mapData`) & enemy locations (e.g. `state.fields`) and dispositions (e.g. `state.playerInfo`). 
 	- Provides the raw information for targeting (`state.grid`).
 	- (In WZ2100, 'weather' doesn't exist).
 */
const intelligence = new armyIntelligence();

/**
 * 	**G3 - OPERATIONS**
	- Responsible for planning, coordinating, and executing all operations (e.g. functions in `hq_gX` & mission management in `hq_toc`).
 */
const aviation = new armyAviation();

const groundForces = new armyGroundOperations();

/**
 * 	**G4 - LOGISTICS**
 * 	- Responsible for supply (e.g. production), maintenance (e.g. repair) & support services (e.g. research).
 * 	- (In WZ2100, 'transportation' of supplies (e.g. fuel, ammunition) doesn't exist).
 */
const supply = new armySupply();

const engineering = new armyEngineering();

const rnd = new armyResearchAndDevelopment();

/**
 * 	**TELEMETRY**
 * 	- Reports how well FishBot is playing, for the automated telemetry pipeline.
 * 	- A singleton (like the staff sections above) so that any decision site can report from where the
 * 	  decision is actually made. Emits nothing unless `TELEMETRY_ON`.
 */
const telemetry = new Telemetry();

/**
 * 	**COMMANDER**
 * 	- Makes strategic decisions (with support of G2 - G4). Implements with the support of G2 - G4.
 */
const hq = new CommandCenter();
