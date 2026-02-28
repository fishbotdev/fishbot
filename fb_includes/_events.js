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
 * This file includes event definitions only.
 *
 */

function eventDroidBuilt(droid, structure) {	
	supply.assignNewDroidIntoGroup(droid);	
}

function eventStructureReady(structure) {
	// does nothing for now
}

function eventStructureBuilt(structure) {
	// does nothing for now
}

function eventAttacked(victim, attacker) {
	// does nothing for now
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
	// does nothing for now
}

function runIntel() {
	hq.runIntel()
}

function runC2() {
	hq.runCombat();
}

function runSustainment() {
	hq.runSustainment();
}

function setupFishBot() {
	// This function is already queued with a player-specific delay, so adding a random timer period is 
	// no longer necessary for the timers of parallel Fishbot instances to be desynchronised           
	const FISHBOT_DECISION_INTERVAL = 1000;
    setTimer("runC2", FISHBOT_DECISION_INTERVAL);
	setTimer("runSustainment", FISHBOT_DECISION_INTERVAL);      
	setTimer("runIntel", FISHBOT_DECISION_INTERVAL);
}

function eventStartLevel() {

	const initialTrucks = enumDroid(me, DROID_CONSTRUCT);
	initialTrucks.forEach(droid => {
		// Copied from NullBot:
		// the following two lines are necessary to avoid some strange game bug when droids that
		// are initially buried into the ground fail to move out of the way when a building
		// is being placed right above them
		const randomPerturbation = Math.floor(Math.random() * 3) - 1;		// [-1, 0, 1]
		orderDroidLoc(droid, DORDER_MOVE, droid.x + randomPerturbation, droid.y + randomPerturbation);

		state.g.addDroidToGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
	});

	if (DEBUG_MODE_ON) {
		// colour reference: 
		const playerColours = {	// from js-functions.md
			"pink" : 6,
			"cyan": 7,
			"yellow": 8,
			"white": 10,
			"bright-blue": 11,
			"neon-green": 12,
			"infra-red": 13,
			"ultra-violet": 14,
		};		
		changePlayerColour(0, playerColours["white"]);
		changePlayerColour(1, playerColours["yellow"]);		
		changePlayerColour(2, playerColours["cyan"]);
		changePlayerColour(3, playerColours["bright-blue"]);
		transformPlayerToSpectator(0);		// remove default human player (force-added in challenge mode)
	}

	queue("setupFishBot", me * 100);
}