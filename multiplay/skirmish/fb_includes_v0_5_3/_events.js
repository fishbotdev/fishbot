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

/*
	This file defines generic event handlers defined by the WZ2100 engine.
	FishBot might use these in the future for performance optimisation.
*/

/**
 * Invoked when a factory completes production.
 * @param {DroidObject} droid 
 * @param {StructureObject} structure 
 */
function eventDroidBuilt(droid, structure) {	
	const newGroupID = hq.toc.setNewDroidGroup(state, droid);
	hq.toc.removeFromActiveProductionJobs(state, structure, newGroupID);	// this function is used for production tracking
}

function eventStructureReady(structure) {
	// does nothing for now
}

function eventStructureBuilt(structure) {
	// this is regularly called if defined		
	// does nothing for now
}

function eventAttacked(victim, attacker) {
	// this is regularly called if defined 
	// does nothing for now (prevents auto-retaliate on friendly fire)
}

function eventChat(from, to, message) {
	// does nothing for now
}

function eventObjectTransfer(object, from) {
	// does nothing for now
}

function eventBeacon(x, y, from, to) {
	// does nothing for now
}

function eventBeaconRemoved(from, to) {
	// does nothing for now
}

function eventDestroyed(object) {
	// this is regularly called if defined
	telemetry.reportObjectDestroyed(object);		// records derrick losses; ignores everything else
}
