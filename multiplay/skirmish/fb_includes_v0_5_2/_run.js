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
		deb(`gameHasEnded, stopping all function`);
		state.botIsActive = false;
		if (DEBUG_MODE_ON) hackMarkTiles();		// clear all residual debug tiles
	}

	if (!gameIsFinished && !state.botIsActive) {
		deb(`is alive, resuming function`);
		state.botIsActive = true;
	}
}

function runStrategy() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['runStrategy'][state.currWorkerID] !== -1) {
			hq.updateStrategicParameters(state);
		}
	}
}

function runIntelligence() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['intel_getMapIntelligence'][state.currWorkerID] !== -1) {
			hq.runIntelligence(state);
		}
	}
}

function runTargeting() {
	const subtasks = ['intel_getNearbyGroundTargets', 'intel_getAviationTargets'];
	if (state.botIsActive) {
		for (let i=0; i<subtasks.length; i++) {
			if (state.WORKER_IDS[subtasks[i]][state.currWorkerID] !== -1) {
				hq.runTargeting(state, subtasks[i]);
			}
		}
	}
}

function runAviation() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['combat_runAviationOperations'][state.currWorkerID] !== -1) {
			hq.runAviationOperations(state);
		}
	}
}

function runC2() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['combat_runC2'][state.currWorkerID] !== -1) {
			hq.runCombatOperations(state);
		}
	}
}

function runConstructionLogistics() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['logistics_runConstruction'][state.currWorkerID] !== -1) {
			hq.runConstructionLogistics(state);
		}
	}
}

function runResupplyLogistics() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['logistics_runResupplyLogistics'][state.currWorkerID] !== -1) {
			hq.runResupplyLogistics(state);				// assigns reserve units to brigades
		}
	}
}

function runStructureLogistics() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['logistics_runStructureLogistics'][state.currWorkerID] !== -1) {
			hq.runProductionLogistics(state);			// schedules production to replenish reserves

			hq.runResearchLogistics(state);
		}
	}
}

function runMissionManager() {
	if (state.botIsActive) {
		if (state.WORKER_IDS['global_missionManager'][state.currWorkerID] !== -1) {
			hq.runMissionManager(state);
		}
	}
}

function scheduleCoreFunctions() {
	if (state.botIsActive) {
		state.currWorkerID = Math.floor(gameTime / state.TIME_BLOCK_MS) % state.BLOCKS_PER_MIN;
	}
}

function setupFishBot() {
	// This function queued with a player-specific delay          
	setTimer("scheduleCoreFunctions", state.TIME_BLOCK_MS);
	setTimer("runIntelligence", state.TIME_BLOCK_MS);
	setTimer("runTargeting", state.TIME_BLOCK_MS);
	setTimer("runC2", state.TIME_BLOCK_MS);
	setTimer("runAviation", state.TIME_BLOCK_MS);
	setTimer("runConstructionLogistics", state.TIME_BLOCK_MS);
	setTimer("runStructureLogistics", state.TIME_BLOCK_MS);
	setTimer("runResupplyLogistics", state.TIME_BLOCK_MS);
	setTimer("runStrategy", state.TIME_BLOCK_MS);
	setTimer("runMissionManager", state.TIME_BLOCK_MS);

	setTimer("runGameEndedWatchdog", 60000);
}

/**
 * This function is used during development & automated testing.
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
	
	const PLAYER_COLOURS = [
		// I have picked short colour names because this plays well with the game summary table parser used during automated testing.
		COLOURS["black"],		// Player 0 is the forced-human player so this can be any colour.
		COLOURS["yellow"], 
		COLOURS["cyan"], 
		COLOURS["blue"], 
		COLOURS["gray"], 
		COLOURS["orange"],
		COLOURS["pink"],
		COLOURS["green"],
		COLOURS["red"],
		COLOURS["purple"],
		COLOURS["white"],
		COLOURS["brown"]
	];

	PLAYER_COLOURS.forEach((colour, player_id) => changePlayerColour(player_id, colour));

	debug(`\nFISHBOT DEBUG MODE\n\nMap: ${mapName} (${maxPlayers} players)`);

	// Print bot info
	const DIFFICULTY_LEVEL = ["Campaign", "Easy", "Medium", "Hard", "Insane"];
	const get_difficulty_text = (difficulty) => DIFFICULTY_LEVEL[difficulty];

	debug(`\nPlayer Info`);

	playerData.forEach(p => {
		if (p.isHuman) {
			// remove default human player (force-added in challenge mode)
			debug(`  - Player ${p.position}: forcing to spec`);
			transformPlayerToSpectator(p.position);		// Note: might not be successful if p.position !== 0. Maybe a sync issue?
			return;
		}

		const difficulty = get_difficulty_text(p.difficulty);
		const playerInfo = `  - Player ${p.position}: ${p.name} (${difficulty})`;
		chat(ALL_PLAYERS, playerInfo);
		debug(playerInfo);
	});

	centreView(baseLocation.x, baseLocation.y);		// Moves the camera to FishBot's start position

	hideInterface();

	deb(`Initialisation completed.\n`);
}

/**
 * This is the start hook for FishBot. Include all initialisation code here to be run once at the start of the game.
 * @returns {void}
 */
function eventStartLevel() {

	if (DEBUG_MODE_ON) {
		setupDebugMode();		// Debug mode is enabled for development & automated testing 
	}

	// `initialise` functions are called here because functions like: `getStructureLimit()` only return the correct value 
	// 		at the point where `eventStartLevel()` is called.
	const stateBuilder = new worldStateBuilder();			
	stateBuilder.initialise(state);

	hq.initialise(state);

	// Assign trucks to relevant groups & start construction tasks immediately
	const initialTrucks = enumDroid(me, DROID_CONSTRUCT);
	const MAX_BASE_BUILDERS = 3;
	initialTrucks.forEach((droid, idx) => {
		// From NullBot: apparently trucks can sometimes get stuck when a building is placed on top of them, so the next line is here to prevent that.
		orderDroidLoc(droid, DORDER_MOVE, droid.x + 1, droid.y + 1);		
		if (idx < MAX_BASE_BUILDERS) {
			state.g.addDroidToGroup({groupID: ENGINEERING.BASE_BUILDER, droidID: droid.id});
		} else {
			state.g.addDroidToGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		}
	});
	queue("runConstructionLogistics");				
	queue("runMissionManager");

	queue("setupFishBot", me * 100);	
}