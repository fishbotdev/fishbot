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
	This file controls the scheduling of all high-level bot functions.
    It should be included last as it contains the hook to start the game.
*/

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

function runIntelligence() {

	if (state.botIsActive) {

		let intelSubtasks = [
			'intel_updateSectorInfo', 
			'intel_updateCOP', 
			'intel_checkTargetsNearby', 
			'intel_checkCampaignStatus', 
			'intel_checkOilDominance'
		];

		for (let i=0; i<intelSubtasks.length; i++) {
			if (state.WORKER_IDS[intelSubtasks[i]][state.currWorkerID]) {
				hq.runIntelligence(state, intelSubtasks[i]);
			}
		}
	}
}

function runC2() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['combat_runC2'][state.currWorkerID]) {
			hq.runCombatOperations(state);
		}
	}
}

function runLogistics() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['runLogistics'][state.currWorkerID]) {
			hq.runLogistics(state);
		}
	}
}

function runMissionManager() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['global_missionManager'][state.currWorkerID]) {
			hq.runMissionManager(state);
		}
	}
}

function scheduleCoreFunctions() {
	if (state.botIsActive) {
		state.currWorkerID = Math.floor(gameTime / state.TIME_BLOCK_MS) % state.INTERVALS_PER_MIN;
	}
}

function setupFishBot() {
	// This function queued with a player-specific delay          
	setTimer("scheduleCoreFunctions", state.TIME_BLOCK_MS);

	setTimer("runIntelligence", state.TIME_BLOCK_MS);
	setTimer("runC2", state.TIME_BLOCK_MS);
	setTimer("runLogistics", state.TIME_BLOCK_MS);
	setTimer("runMissionManager", state.TIME_BLOCK_MS);

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