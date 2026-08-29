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
		hq.runEndOfGameTelemetry(state);			// emit the final telemetry event before the bot stops sampling
		state.botIsActive = false;
		clearAllTileHighlights();
	}

	if (!gameIsFinished && !state.botIsActive) {
		deb(`is alive, resuming function`);
		state.botIsActive = true;
	}
}


function scheduleCoreFunctions() {
	if (!state.botIsActive) {
		return;
	}

	const currWorkerID = Math.floor(gameTime / state.TIME_BLOCK_MS) % state.BLOCKS_PER_MIN;

	if (state.WORKER_IDS['global_missionManager'][currWorkerID] !== -1) {
		const global_missionManager = () => hq.runMissionManager(state);
		fprof(global_missionManager);
	}

	if (state.WORKER_IDS['logistics_runResupplyLogistics'][currWorkerID] !== -1) {
		const logistics_runResupplyLogistics = () => hq.runResupplyLogistics(state);				// assigns reserve units to brigades
		fprof(logistics_runResupplyLogistics);
	}

	if (state.WORKER_IDS['logistics_runStructureLogistics'][currWorkerID] !== -1) {
		const logistics_runStructureLogistics = () => {
			hq.runProductionLogistics(state);			// schedules production to replenish reserves
			hq.runResearchLogistics(state);
		}
		fprof(logistics_runStructureLogistics);
	}

	if (state.WORKER_IDS['logistics_runConstruction'][currWorkerID] !== -1) {
		const logistics_runConstruction = () => hq.runConstructionLogistics(state);
		fprof(logistics_runConstruction);
	}
	
	if (state.WORKER_IDS['combat_runC2'][currWorkerID] !== -1) {
		const combat_runC2 = () => hq.runCombatOperations(state);
		fprof(combat_runC2);
		const combat_runAviation = () => hq.runAviationOperations(state);
		fprof(combat_runAviation);
	}

	const subtasks = ['intel_getNearbyGroundTargets', 'intel_getAviationTargets'];
	for (let i=0; i<subtasks.length; i++) {
		const name = subtasks[i];
		if (state.WORKER_IDS[name][currWorkerID] !== -1) {
			const rt = () => hq.runTargeting(state, name);
			fprof(rt, `_${name}`);
		}
	}

	if (state.WORKER_IDS['intel_getMapIntelligence'][currWorkerID] !== -1) {
		const intel_getMapIntelligence = () => hq.runIntelligence(state);
		fprof(intel_getMapIntelligence);
	}

	if (state.WORKER_IDS['runStrategy'][currWorkerID] !== -1) {
		const runStrategy = () => hq.updateStrategicParameters(state);
		fprof(runStrategy);
	}
}


/**
 * This function starts the timers for all FishBot functions. 
 * @returns {void}
 */
function setupFishBot() {       
	setTimer("scheduleCoreFunctions", state.TIME_BLOCK_MS);
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
		orderDroidLoc(droid, DORDER_MOVE, droid.x - 1, droid.y - 1);		
		if (idx < MAX_BASE_BUILDERS) {
			state.g.addDroidToGroup({groupID: ENGINEERING.BASE_BUILDER, droidID: droid.id});
		} else {
			state.g.addDroidToGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		}
	});

	queue("setupFishBot", me * 100);		// player-specific delay offsets bot initialisation by its position * 100ms, which reduces the chance of a lag spike at the very start of the game.	
}
