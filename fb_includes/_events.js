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


function eventDroidBuilt(droid, structure) {	
	// This is the only event handler that FishBot uses (avoids having to perform enumDroid continuously)
	supply.assignNewDroidIntoGroup(droid);	
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
	// does nothing for now
}

function runGameEndedWatchdog() {
	const gameIsFinished = gameHasEnded();

	if (gameIsFinished && state.botIsActive) {
		debug(`FishBot ${me}: gameHasEnded, stopping all function`);
		state.botIsActive = false;
	}

	if (!gameIsFinished && !state.botIsActive) {
		debug(`FishBot ${me}: is alive, resuming function`);
		state.botIsActive = true;
	}
}

function runC2() {
	hq.runCombatOperations(state);
}

function runLogistics() {
	hq.runLogistics(state);
}

function runMissionManager() {
	hq.toc.manageMissions(state);
}

function scheduleCoreFunctions() {
	if (state.botIsActive) {
		const OFFSET = 0;	// ms
		const CORE_FUNCTION_NAMES = ["runC2", "runLogistics"];
		CORE_FUNCTION_NAMES.forEach((f, idx) => queue(f, idx * OFFSET))
	}
}

function scheduleCoreFunctions2() {
	if (state.botIsActive) {
		state.currWorkerID = Math.floor(gameTime / state.TIME_BLOCK_MS) % state.INTERVALS_PER_MIN;

		hq.runIntelligence(state);

		queue("runMissionManager", 100 * (2 * Math.floor(Math.random() * 2) + 1));		// this will not clash with any of this FishBot's functions
	}
}

function setupFishBot() {
	// This function queued with a player-specific delay          
	const FISHBOT_DECISION_INTERVAL = 1000;
	setTimer("scheduleCoreFunctions", FISHBOT_DECISION_INTERVAL);
	setTimer("scheduleCoreFunctions2", state.TIME_BLOCK_MS);
	setTimer("runGameEndedWatchdog", 60000);
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

	// Run construction tasks right away
	queue("runLogistics");				
	queue("runMissionManager");
}