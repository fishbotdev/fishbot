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
    It should be included last as it contains the hook `eventStartLevel` for the bot to start running.
*/

function runGameEndedWatchdog() {
	const gameIsFinished = state.gameHasEnded();

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

	const subtasks = hq.INTELLIGENCE_SUBTASK_NAMES;

	if (state.botIsActive) {
		for (let i=0; i<subtasks.length; i++) {
			if (state.WORKER_IDS[subtasks[i]][state.currWorkerID]) {
				hq.runIntelligence(state, subtasks[i]);
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
			hq.runConstructionLogistics(state);
			hq.runProductionLogistics(state);
			hq.runResearchLogistics(state);
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

/**
 * This function is intended to be used during development & automated testing.
 * @returns {void}
 */
function setupDebugMode() {
	const COLOURS = {
		"green": 0,
		"orange": 1,
		"gray": 2, 
		"black": 3, 
		"red": 4, 
		"blue": 5,
		"pink" : 6,
		"cyan": 7,
		"yellow": 8,
		"purple": 9,
		"white": 10,
		"bright-blue": 11,
		"neon-green": 12,
		"infrared": 13,
		"ultraviolet": 14,		
		"brown": 15,
	};
	
	changePlayerColour(0, COLOURS["gray"]);
	changePlayerColour(1, COLOURS["yellow"]);		
	changePlayerColour(2, COLOURS["cyan"]);
	changePlayerColour(3, COLOURS["blue"]);
	changePlayerColour(4, COLOURS["neon-green"]);
	changePlayerColour(5, COLOURS["infrared"]);
	changePlayerColour(6, COLOURS["pink"]);
	changePlayerColour(7, COLOURS["white"]);
	changePlayerColour(8, COLOURS["red"]);
	changePlayerColour(9, COLOURS["orange"]);
	changePlayerColour(10, COLOURS["purple"]);
	changePlayerColour(11, COLOURS["brown"]);

	// remove default human player (force-added in challenge mode)
	transformPlayerToSpectator(0);		
}

function eventStartLevel() {
	queue("setupFishBot", me * 100);	
	
	// Debug mode is enabled for development & automated testing. 
	if (DEBUG_MODE_ON) {
		setupDebugMode();
	}

	// One time use: start initial construction tasks immediately
	const initialTrucks = enumDroid(me, DROID_CONSTRUCT);
	initialTrucks.forEach(droid => {
		orderDroidLoc(droid, DORDER_MOVE, droid.x + 1, droid.y + 1);		// copied from NullBot (apparently trucks can sometimes get stuck when a building is placed on top of them)
		state.g.addDroidToGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
	});
	queue("runLogistics");				
	queue("runMissionManager");
}