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

// Initialise world state
let state = new worldState();

let stateBuilder = new worldStateBuilder();
stateBuilder.initialise(state);
stateBuilder = null;				// builder should only be run once

// Initialise divisional command

// G2 - INTELLIGENCE:
//  Responsible for intelligence operations, threat awareness, counterintelligence, and all-source intelligence production to inform the commander about the enemy and operational environment
const intelligence = new armyIntelligence();

// G3 - OPERATIONS:
// 	The largest staff section, responsible for planning, coordinating, and executing all operations, training, and force structure changes.

const aviation = new armyAviation();

const groundForces = new armyGroundForceCommand();

// G4 - LOGISTICS:
//	Manages all supply, maintenance, transportation, and support services to ensure the logistical readiness of the division. 
const supply = new armyQuartermaster();

const engineering = new armyEngineering();

const research = new armyResearchAndDevelopment();

// Commander: Makes all decisions
const hq = new CommandCenter();

hq.establishSituation(state);		// initialises sector threat
hq.setDefaultMissions(state);			// initialises default missions

