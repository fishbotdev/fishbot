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

class armyEngineering {
	constructor() {

	}

	#getNumFinishedModules({structureID}) {
		// Assumes that 
		let completedModuleCount = 0;
		switch (structureID) {
			case STRUCTURES["Power Module"].id:
				let numFinishedGenerators = enumStruct(me, POWER_GEN).filter(s => s.status === BUILT);
				numFinishedGenerators.forEach(g => {completedModuleCount += g.modules;});
				break;
			case STRUCTURES["Factory Module"].id:
				let numFinishedFactories = enumStruct(me, FACTORY).filter(s => s.status === BUILT);
				let numFinishedVtolFactories = enumStruct(me, VTOL_FACTORY).filter(s => s.status === BUILT);
				numFinishedFactories.push(...numFinishedVtolFactories);		// add vtol factories to the end
				numFinishedFactories.forEach(f => {completedModuleCount += f.modules;});
				break;
			case STRUCTURES["Research Module"].id:
				let numFinishedLabs = enumStruct(me, RESEARCH_LAB).filter(s => s.status === BUILT);
				numFinishedLabs.forEach(l => {completedModuleCount += l.modules;})
				break;
			default:
				debug(`#getNumFinishedModules(): Could not recognise structureID ${structureID}, returning 0 modules`);
				// do nothing
		}

		return completedModuleCount;
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @param {*} activeOilCapTaskIDs 
	 * @returns {Array}
	 */
	generateOilCaptureOptions(state, activeOilCapTaskIDs) {
		/*
		Algorithm:
		Use the grid system to:
		- Find cells with unclaimed derricks											-- uses state.fields.unclaimedDerricksInCell[gx][gy]
		- Remove cells with high threat from enemy struct concentrations 				-- uses state.grid.grid[gx][gy].targetStructures 
		- Remove cells with defensive structures										-- uses state.fields.enemyStaticDefenceThreat
		- Remove cells with enemy offensive units										-- uses state.fields.enemyUnitThreat
		- Remove cells with all derricks already being claimed in active missions		-- uses this.toc.getActiveConstructionMissions()
		
		-> if all conditions satisfied, push derrick ID to be used to filter state.poi.derricks
		
		Iterate through the ordered list
		1. Skip if id not found in grid entries
		2. >= 4 derricks which are close to one another (multiple in one grid); move to front of list
			2a. create new CONSTRUCT_ALL_DERRICKS_IN_SECTOR
		3. Else, continue (the ordered list already orders the derricks in order of increasing distance from base)
			3a. create new CONSTRUCT_OIL_DERRICK for single, CONSTRUCT_ALL_DERRICKS_IN_SECTOR for multiple
		*/
		const grid = state.grid.grid;
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;

		const unclaimedDerricksInCell = state.fields.unclaimedDerricksInCell;
		const enemyStaticDefenceThreat = state.fields.enemyStaticDefenceThreat;
		const enemyUnitThreat = state.fields.enemyUnitThreat;

		const DEBUG_ON = false;
		let debugGrid = create2DGrid(numXCells, numYCells, (...args) => {return "_";});
		let valid = [];

		// Iterate through the grid, find & remember valid cells
		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {

				// Filter out invalid / bad entries
				if (unclaimedDerricksInCell[gx][gy] === 0) continue;
				if (enemyStaticDefenceThreat[gx][gy] > 0) continue;			
				if (enemyUnitThreat[gx][gy] > 0) continue;

				const derricksInCell = grid[gx][gy].derricks;
				for (let i=0; i<derricksInCell.length; i++) {
					const d = derricksInCell[i];

					// Check for existing mission
					if (activeOilCapTaskIDs.indexOf(d.id) !== -1) continue; 									// found 'CONSTRUCT_OIL_DERRICK' task
					if (activeOilCapTaskIDs.filter(id => id === grid[gx][gy].id).length >= 2) break;			// found at least 2 'CONSTRUCT_SECTOR_DERRICKS' tasks

					// if (tileIsBurning(d.x, d.y)) continue;		// seems to be worse

					if (derricksInCell.length >= 4) {
						const br = engineering.translateIntoBuildRequest({
							missionType: MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR, 
							structureData: STRUCTURES["Oil Derrick"],
							payload: grid[gx][gy]		// needs to have the '.derricks' property to work with the existing system
						});
						valid.push([d.id, br]);
						if (DEBUG_ON) debugGrid[gx][gy] = "X";
						break;
					} else {
						const br = engineering.translateIntoBuildRequest({
							missionType: MISSION_TYPE.CONSTRUCT_OIL_DERRICK, 
							structureData: STRUCTURES["Oil Derrick"],
							payload: d
						});
						valid.push([d.id, br]);
						if (DEBUG_ON) debugGrid[gx][gy] = "X";
					}
				}
			}
		}

		if (DEBUG_ON) {
			debug(`prioritiseOilCapTasks() @ ${gameTime} ms`);

			for (let gy=0; gy<numYCells; gy++) {
				let row = "";

				for (let gx=0; gx<numXCells; gx++) {					
					row += `${debugGrid[gx][gy]} `;
				}
				debug(row);
			}
		}

		let result = [];
		if (valid.length === 0) {
			return result;
		}
		
		// Order the tasks in order of decreasing distance from base
		let count = 0;
		state.poi.derricks.forEach(d => {
			for (let i=0; i<valid.length; i++) {
				if (d.id === valid[i][0]) {
					result.push(valid[i][1]);
					count++;
					return;
				}
			}
		});

		if (count !== valid.length) {
			debug(`WARNING: prioritiseOilCapTasks(): count !== valid.length!`);
		} else {
			if (DEBUG_ON) result.forEach(br => debug (`\t${br.payload.id}`));
		}

		return result;
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @param {*} activeDefenceBuildTaskIDs 
	 * @returns 
	 */
	generateOilDefenceConstructionOptions(state, activeDefenceBuildTaskIDs) {
		/*
		Algorithm:
		- For each derrick in `state.poi.derricks`
			. If grid cell previously processed, continue
			. Check static defence threat grid (continue if high threat), check unit defence threat grid (after five mins)
			. Check grid ref for friendly defences in sector (continue if done)
			. Check active missions (continue if already active)
			. Check grid ref for other derricks in sector ( -- influences how many defences)
			. Check owner ( -- influences offensive vs friendly oil; if other types of defences are needed) or if tileIsBurning 
			. Build one defence per undefended location also 
			. Handle special case of clustered derricks with unreachable enemy derricks (build hardpoint)
		*/
		const grid = state.grid.grid;
		const derricks = state.poi.derricks;
		const controlStability = state.fields.controlStability;
		const enemyUnitThreat = state.fields.enemyUnitThreat;

		const MAX_CONTROL = 5;
		const PROXIMITY_RADIUS = 7;

		const makePrimaryDefence = (derrickObj) => this.translateIntoBuildRequest({
			missionType: MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE, 
			structureData: STRUCTURES["Rotary MG Bunker"],
			payload: derrickObj
		});
		const makeSecondaryDefence = (derrickObj) => this.translateIntoBuildRequest({
			missionType: MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE, 
			structureData: STRUCTURES["Assault Gun Hardpoint"],
			payload: derrickObj
		});

		let highPrioOil = [], normalPrioOil = [];		
		let seenDerricks = [];

		// debug(``);
		for (let i=0; i<derricks.length; i++) {
			const d = derricks[i];

			// the following replicates the old 'sector' system grouping of derricks
			let previouslySeen = false;
			for (let j=seenDerricks.length-1; j>=0; j--) {
				if (distSq(seenDerricks[j].x, d.x, seenDerricks[j].y, d.y) < PROXIMITY_RADIUS ** 2) {
					previouslySeen = true;
					break;
				}
			}
			if (previouslySeen) {
				// debug(`skipped ${d.id}: already seen`);
				continue;
			}

			seenDerricks.push(d);			

			if (activeDefenceBuildTaskIDs.includes(d.id)) {
				// debug(`skipped ${d.id}: activeMission`);
				continue;
			}

			if (enemyUnitThreat[d.gx][d.gy] > 0) {
				// debug(`skipped ${d.id}: unit threat`);
				continue
			};			// TODO: move this prioritisation to hq_command (decisions on options should be made in command)

			if (controlStability[d.gx][d.gy] <= -1 * MAX_CONTROL) {		// TODO: move this prioritisation to hq_command (decisions on options should be made in command)
				// debug(`skipped ${d.id}: (${d.gx}, ${d.gy}); control too large (${controlStability[d.gx][d.gy]})`);
				continue;
			}

			if (!isReachable[d.x][d.y]) {		// this checks if the location is reachable with wheeled trucks
				continue;
			}

			// Intent: enumRange is used as this offers better granularity compared to directly accessing the grid
			const nearby = state.grid.enumRangeLazy(d.x, d.y, PROXIMITY_RADIUS, true, true);
			
			let friendlyDefencesNearby = 0, friendlyBuildSitesNearby = 0, friendlyDerricksNearby = 0;
			nearby['friendlyStructures'].forEach(obj => {	
				if (gameObjectNoLongerExists(obj)) return;

				const flags = obj.flags;

				if (flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					friendlyDerricksNearby++;
					
					const friendlyDerrickID = obj.id;
					if (activeDefenceBuildTaskIDs.includes(friendlyDerrickID)) {
						previouslySeen = true;
					}
				}

				if (flags & OBJ_FLAGS.DEFENSIVE_STRUCTURE && !(flags & OBJ_FLAGS.ADA)) {
					if (flags && OBJ_FLAGS.IS_BUILT) {
						friendlyDefencesNearby++;
					} else {
						friendlyBuildSitesNearby++;
					}
				}
			});

			if (previouslySeen)  {
				continue;
			}

			const BUILT_DEFENCES = OBJ_FLAGS.DEFENSIVE_STRUCTURE | OBJ_FLAGS.IS_BUILT;

			let enemyDefencesNearby = 0, enemyDerricksNearby = 0;
			nearby['targetStructures'].forEach(obj => {	
				if (gameObjectNoLongerExists(obj)) return;

				const flags = obj.flags;

				if (flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					enemyDerricksNearby++;

					const enemyDerrickID = obj.id;
					if (activeDefenceBuildTaskIDs.includes(enemyDerrickID)) {
						previouslySeen = true;
					}
				}

				if ((flags & BUILT_DEFENCES) === BUILT_DEFENCES && !(flags & OBJ_FLAGS.ADA)) {
					enemyDefencesNearby++;
				}
			});

			if (previouslySeen)  {
				continue;
			}

			if (enemyDefencesNearby > 0) {
				// debug(`skipped ${d.id}: friendlyDefencesNearby`);
				continue;
			}

			if (controlStability[d.gx][d.gy] >= 5 && enemyDerricksNearby === 0) {		// TODO: move this prioritisation to hq_command (decisions on options should be made in command)
				// debug(`skipped ${d.id}: (${d.gx}, ${d.gy}); control too large (${controlStability[d.gx][d.gy]})`);
				continue;
			}

			const isHighPriority = grid[d.gx][d.gy].derricks.length >= 4;
			if (isHighPriority) {
				// Has a special case of defences === 1 -> can build secondary defence
				if (friendlyDefencesNearby === 0) {
					highPrioOil.unshift(makePrimaryDefence(d));			// unshift -> reverses the order of `state.poi.derricks` which is ordered in ascending order from base
				} else if (friendlyDefencesNearby === 1) {
					const specialContestedDerrick = (enemyDerricksNearby > 0 && friendlyDefencesNearby === 1);
					if (specialContestedDerrick) {
						normalPrioOil.push(makeSecondaryDefence(d));
					}
				}
				continue;
			}

			if (friendlyDefencesNearby > 0) {
				// debug(`skipped ${d.id}: friendlyDefencesNearby`);
				continue;
			}
			
			const regularContestedDerrick = tileIsBurning(d.x, d.y) || (enemyDerricksNearby > 0 && friendlyDefencesNearby === 0);		// todo to split
			if (regularContestedDerrick) {
				normalPrioOil.unshift(makePrimaryDefence(d));
			} else {
				normalPrioOil.unshift(makePrimaryDefence(d));
			}
		}

		if (false) {
			debug(`generateOilDefenceConstructionOptions() @${gameTime}`);
			debug(`	highPrio: ${highPrioOil}`);
			debug(`	normalPrio: ${normalPrioOil}`);
		}

		return [...highPrioOil, ...normalPrioOil];
	}

	/**
	 * Generates locations for construction and demolition of repair facilities.
	 * Demolition is required because there is a hard cap on the number of repair facilities you can build.
	 * @param {worldState} state
	 * @param {FbObject[]} myRepairFacilities
	 * @param {PositionInfo[]} forceLocations
	 * @returns 
	 */
	generateRemoteServiceCenterConstructionOptions(state, myRepairFacilities, forceLocations) {

		const enemyUnitThreat = state.fields.enemyUnitThreat;
		const cellSize = state.grid.cellSize;

		const potentialRepairCenterLocations = [];
		const potentialDemolitionLocations = [];

		const options = {
			'newFacilityLocations': potentialRepairCenterLocations,
			'demolitionLocations': potentialDemolitionLocations
		}

		const REPAIR_CENTER_SEARCH_RADIUS = 18;

		// PART 1: FIND DEMOLITION LOCATIONS
		myRepairFacilities.forEach(f => {
			if (enemyUnitThreat[f.gx][f.gy] !== 0) {
				return;
			}

			const repairFacility = getObject(f.type, f.player, f.id);
			if (repairFacility == null) {
				return;
			}

			const FACILITY_INSIDE_BASE_RADIUS = distSq(repairFacility.x, baseLocation.x, repairFacility.y, baseLocation.y) <= REPAIR_CENTER_SEARCH_RADIUS ** 2;
			if (FACILITY_INSIDE_BASE_RADIUS) {
				// debug(`${gameTime}: repair facility @ ${repairFacility.x}, ${repairFacility.y} - ignored`);
				return;
			}

			const FACILITY_NEAR_SOME_GROUP = forceLocations.some(brigadeLoc => {
				if (distSq(brigadeLoc.x, repairFacility.x, brigadeLoc.y, repairFacility.y) <= REPAIR_CENTER_SEARCH_RADIUS ** 2) {
					return true;
				}
				return false;
			});
			if (FACILITY_NEAR_SOME_GROUP) {
				return;
			}

			const buildRequest = this.translateIntoBuildRequest({
				missionType: MISSION_TYPE.DEMOLISH_REPAIR_CENTER, 
				structureData: STRUCTURES["Repair Facility"],
				payload: repairFacility
			});

			potentialDemolitionLocations.push(buildRequest);
		});

		// Sort closest to furthest from base (simplistic assumption). TODO: find loc with largest combined distance from active BCTs
		potentialDemolitionLocations.sort((a,b) => 
			distSq(a.payload.x, baseLocation.x, a.payload.y, baseLocation.y) - distSq(b.payload.x, baseLocation.x, b.payload.y, baseLocation.y));

		// PART 2: FIND CONSTRUCTION LOCATIONS
		forceLocations.forEach(LOCATION => {
			const x = LOCATION.x;
			const y = LOCATION.y;
			if (!isReachable[x][y]) {		// this checks if the location is reachable with wheeled trucks
				return;
			}

			const gx = Math.floor(x / cellSize);
			const gy = Math.floor(y / cellSize);
			if (enemyUnitThreat[gx][gy] !== 0) {
				return;
			}

			if (distSq(x, baseLocation.x, y, baseLocation.y) <= REPAIR_CENTER_SEARCH_RADIUS ** 2) {
				// Too close to the base (prevents doubling-up on the repair facility in the base build order)
				return;
			}

			let friendlyRepairCenterCount = 0;

			const nearby = state.grid.enumRangeLazy(x, y, REPAIR_CENTER_SEARCH_RADIUS, false, true);
			nearby['friendlyStructures'].forEach(s => {
				if (!(s.flags & OBJ_FLAGS.REPAIR)) {
					return;
				}
				if (gameObjectNoLongerExists(s)) {
					return;
				}
				friendlyRepairCenterCount++;
			});
			
			if (friendlyRepairCenterCount > 0) {
				return;
			}

			const NEARBY_FRIENDLY_UNIT_COUNT = nearby['friendlyUnits'].length;
			const MIN_NEARBY_FRIENDLY_UNITS = 5;
			if (NEARBY_FRIENDLY_UNIT_COUNT < MIN_NEARBY_FRIENDLY_UNITS) {
				return;		
			}

			let nearbyFriendlyUnits = 0;
			for (let i=0; i<nearby['friendlyUnits'].length; i++) {
				const unit = nearby['friendlyUnits'][i];
				if (unit.flags & (OBJ_FLAGS.ARMOUR | OBJ_FLAGS.INFANTRY)) {
					nearbyFriendlyUnits++;
				}

				if (nearbyFriendlyUnits >= MIN_NEARBY_FRIENDLY_UNITS) {
					break;
				}
			}
			if (nearbyFriendlyUnits < MIN_NEARBY_FRIENDLY_UNITS) {
				return;
			}
			
			// debug(`\t\t${gameTime}: repair center not within ${SEARCH_RADIUS} tiles of ${BRIGADE_ID} (${x} ${y})`);

			// Else, schedule a new task
			const buildRequest = this.translateIntoBuildRequest({
				missionType: MISSION_TYPE.CONSTRUCT_REPAIR_CENTER, 
				structureData: STRUCTURES["Repair Facility"],
				payload: LOCATION
			});

			potentialRepairCenterLocations.push(buildRequest);
		});

		return options;
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @returns 
	 */
	requestBaseConstruction(state) {
		// Inputs:
		// -	buildQueue: a list of STRUCTURES['exampleName']

		const baseBuildOrder_T1NoBase = [
			STRUCTURES["Factory"],
			STRUCTURES["Factory"],
			STRUCTURES["Command Center"],
			STRUCTURES["Power Generator"],	
			STRUCTURES["Power Generator"],	
			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],
			STRUCTURES["Power Generator"],
			STRUCTURES["Cyborg Factory"],		
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["VTOL Factory"],
			STRUCTURES["Power Module"],				// The script will automatically find the position to place this power module
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Power Module"],
			STRUCTURES["Power Module"],
			STRUCTURES["Repair Facility"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Cyborg Factory"],		
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],

			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],
			STRUCTURES["Research Module"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["Factory"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Cyborg Factory"],
			
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["Factory"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],

			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],

			STRUCTURES["Factory"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],

			STRUCTURES["Cyborg Factory"],

			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],

			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["Cyborg Factory"],

			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],

			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],
		];

		// Put each task into an appropriate format for approval ("buildTask", which is internal to g4_construction)
		let buildTasks = [];

		// Create running tally
		let minimumRequired = {};
		baseBuildOrder_T1NoBase.forEach(struct => {
			if (!defined(minimumRequired[struct.id])) {
				minimumRequired[struct.id] = 0;
				// debug(`	requestBaseConstruction(): minimumRequired -> ${struct.id} ${minimumRequired[struct.id]}`);
			}
		});

		for (let i=0; i<baseBuildOrder_T1NoBase.length; i++) {
			// Iterate through the build order & check if the desired number of structures have been built already;
			const currStructureData = baseBuildOrder_T1NoBase[i];

			// Part 1: Add new structure to running tally
			minimumRequired[currStructureData.id] += 1;

			// Part 2: Check how many in progress / built
			let structCount = undefined;
			if (["Research Module", "Power Module", "Factory Module"].includes(currStructureData.name)) {
				structCount = this.#getNumFinishedModules({structureID: currStructureData.id});
			} else {
				structCount = enumStruct(me, currStructureData.id).length;		// returns both 'BUILT' & 'BEING_BUILT' results
			}

			if (false) debug(`	structCount -> structCount ${structCount} 	VS 	built ${minimumRequired[currStructureData.id]}`);

			if (structCount >= minimumRequired[currStructureData.id]) {
				continue;
			}

			// Else, schedule a new task
			const buildRequest = this.translateIntoBuildRequest({
				missionType: MISSION_TYPE.CONSTRUCT_AUTO_DETECT_BY_STRUCTURE, 
				structureData: currStructureData,
				payload: undefined
			});
			buildTasks.push(buildRequest);
			break;		// Note: this means that only the first available will be selected.
		}
		
		return buildTasks;
	}

	/*
		MISSION CREATION
	*/

	#createBuildRequest({missionType, structureData, payload}) {
		return {
			missionType: missionType,
			structureID: structureData.id,
			payload: payload,
		};
	}

	translateIntoBuildRequest({missionType, structureData, payload}) {
		let buildRequest = undefined;

		switch (missionType) {
			case MISSION_TYPE.CONSTRUCT_AUTO_DETECT_BY_STRUCTURE:
				let mt = undefined;
				switch(structureData.id) {
					case STRUCTURES["Research Module"].id:	
					case STRUCTURES["Power Module"].id:
					case STRUCTURES["Factory Module"].id:		// these three have the same handler
						mt = MISSION_TYPE.CONSTRUCT_SINGLE_MODULE;	
						break;
					default:
						mt = MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE;
				}
				buildRequest = this.#createBuildRequest({missionType: mt, structureData: structureData, payload: payload});
				break;
			case MISSION_TYPE.CONSTRUCT_OIL_DERRICK:
			case MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR:
			case MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE:
			case MISSION_TYPE.CONSTRUCT_REPAIR_CENTER:
			case MISSION_TYPE.DEMOLISH_REPAIR_CENTER:
				buildRequest = this.#createBuildRequest({missionType: missionType, structureData: structureData, payload: payload});
				break;
			default:
				debug(`WARNING: hq_g4_construction/translateIntoBuildRequest(): Unrecognised missionType: ${missionType}`);
				// do nothing for now
		}

		return buildRequest;
	}

	/**
	 * @typedef {Object} missionData
	 * @property {string | undefined} id Unique ID to designate this particular mission
	 * @property {number | undefined} missionType
	 * @property {number | undefined} missionStatus
	 * @property {number | undefined} priority
	 * @property {number | string | undefined} taskForceID
	 * @property {function | undefined} orders
	 * @property {function | undefined} ceaseOrders
	 * @property {number | undefined} timeStarted
	 * @property {number | undefined} timeCompleted
	 * @property {string | undefined} sectorID
	 * @property {number | undefined} gx
	 * @property {number | undefined} gy
	 */

	/**
	 * Creates standard mission orders.
	 * @returns {missionData} `missionData` with the following parameters: 
	 * 		- `id`				: Unique ID to designate this particular mission (set here)
			- `missionType`		: Integer to denote mission type (determined in OPS)
			- `missionStatus`	: Integer to denote mission status (this function sets it to FAILED_CREATION)
			- `priority`		: Integer to denote priority (determined in OPS)
			- `taskForceID`		: Unique ID to designate all units in the group (set here)
			- `orders`			: how to carry out the mission (__tac level functions)
			- `ceaseOrders` 	: how to finish the mission (__tac level functions)
			- `timeStarted`		: gameTime when the mission was executed by the mission manager
			- `timeCompleted`	: gameTime when ceaseOrders was called & processed (filled by ceaseOrders())

			The following parameters are used for mission cancellation / planning
			- `sectorID`		: parameter to denote position (v0.3.0 sector system)
			- `gx`				: grid x coordinate (v0.4.0 sector system)
			- `gy`				: grid y coordinate (v0.4.0 sector system)
	 */
	#createMissionOrders() {
		return {
			'id': undefined, 
			'missionType': undefined, 
			'missionStatus': MISSION_STATUS.FAILED_CREATION, 
			'priority': MISSION_PRIORITY.LOW, 
			'taskForceID': undefined, 
			'orders': undefined, 
			'ceaseOrders': undefined,
			'timeStarted': -2,
			'timeCompleted': -1,

			// The following 3 parameters are used for mission cancellation (they indicate something about position)
			'sectorID': undefined,	// v0.3.0 sector system	
			'gx': -1,				// v0.4.0 grid system
			'gy': -1,				// v0.4.0 grid system
		};
	}

	#mcb(callback, ...args) {
		// This function is here so we can schedule execution of the callback function at some later point
		return callback(...args);	//...args is important otherwise all remaining args will be interpreted as a single array of parameters
	}

	#finaliseConstruction(md) {
		// Mission completed
		const taskForceUnits = state.g.enumGroup(md.taskForceID);
		if (taskForceUnits.length > 0) {
			taskForceUnits.forEach((droid) => {
				state.g.addDroidToGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
				orderDroidLoc(droid, DORDER_MOVE, baseLocation.x, baseLocation.y);
			});	
		} else {
			// debug(`Terminated mission: taskForceID ${md.taskForceID} are all dead.`);
		}
		state.g.deleteGroup(md.taskForceID);
		md.timeCompleted = getCurrGameTime();
	}

	/**
	 * @typedef {Object} MissionParams
	 * @property {Object} buildTask Build task details (standard format generated by `translateIntoBuildRequest()`).
	 * @property {number} tickUID Number used by mission planning to differentiate tasks assigned in the same decision tick.
	 */

	/**
	 * Defines the default behaviour of all trucks.
	 * @returns {missionData} Returns `missionData` which is used by the mission manager to continuously execute the default mission.
	 */
	createHelpConstructTask() {
		let md = this.#createMissionOrders();

		// Create mission details		
		const id = getCurrGameTime() + "HELP_CONSTRUCT";
		md.id = id;
		md.taskForceID = ENGINEERING.ENGINEERING_RESERVE;		// taskForceID is used for enumGroup so 

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(helpConstructAroundBase, md.taskForceID);		
		md.ceaseOrders = () => {return;};	// doesn't do anything

		return md;
	}

	/**
	 * Creates a task to build a single base structure.
	 * @param {MissionParams} params 
	 * @returns {missionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildBaseStructureTask({buildTask, tickUID}) {
		const cellSize = state.grid.cellSize;
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {			
			// debug(`#createBuildBaseStructureTask(): No trucks available.`);
			return undefined;
		}

		let MAX_TRUCKS = 2;

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildBaseStructureTask(): Structure not available: ${buildTask.structureID}`);
			return undefined;
		}

		const loc = pickBaseStructLocation(buildTask.structureID);		
		if (loc == undefined) {
			// debug(`#createBuildBaseStructureTask(): pickStructLocation() couldn't find a good location for ${buildTask.structureID}.`);
			return undefined;
		}

		// Select closest trucks to new location
		engineeringReserve.sort((a,b) => distSq(a.x, buildTask.x, a.y, buildTask.y) - distSq(b.x, buildTask.x, b.y, buildTask.y));
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS); 

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_BASE_STRUCTURE_" + tickUID;
		md.id = id;
		md.taskForceID = id;
		md.gx = Math.floor(loc.x / cellSize);
		md.gy = Math.floor(loc.y / cellSize);
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(buildBaseStructure, md.taskForceID, buildTask.structureID, loc.x, loc.y);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}

	/**
	 * Creates a task to build a single derrick.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.x` and `.y` properties.
	 * @returns {missionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildDerrickTask({buildTask, tickUID}) {		
		const cellSize = state.grid.cellSize;
		const derrick = buildTask.payload;

		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {
			// debug(`#createBuildBaseStructureTask(): No trucks available.`);
			return undefined;
		}
		
		let MAX_TRUCKS = 1;
		
		// Select closest trucks to sector
		engineeringReserve.sort((a,b) => distSq(a.x, buildTask.x, a.y, buildTask.y) - distSq(b.x, buildTask.x, b.y, buildTask.y));
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS);

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`createBuildDerrickTask(): Structure not available: ${buildTask.structureID} - were oil derricks disabled?`);
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_OIL_DERRICK_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.sectorID = buildTask.payload.id;
		md.gx = Math.floor(derrick.x / cellSize);
		md.gy = Math.floor(derrick.y / cellSize);
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(buildOilDerrick, md.taskForceID, buildTask.structureID, derrick);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}

	/**
	 * Creates a task to build all derricks in a grid cell.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.derricks` property (e.g. `gridCell` contains `.derricks`).
	 * @returns {missionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildAllDerricksInSectorTask({buildTask, tickUID}) {				
		const sector = buildTask.payload;
		const sectorDerricks = buildTask.payload.derricks;

		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {
			// debug(`#createBuildBaseStructureTask(): No trucks available.`);
			return undefined;
		}
		
		let MAX_TRUCKS = 1;
		
		// Select closest trucks to sector
		engineeringReserve.sort((a,b) => distSq(a.x, buildTask.x, a.y, buildTask.y) - distSq(b.x, buildTask.x, b.y, buildTask.y));	
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS);

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildAllDerricksInSectorTask(): Structure not available: ${buildTask.structureID} - were oil derricks disabled?`);
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_SECTOR_DERRICKS_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.sectorID = sector.id;
		md.gx = sector.gx;
		md.gy = sector.gy;
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(buildMultipleOilDerricks, md.taskForceID, buildTask.structureID, sectorDerricks);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}

	/**
	 * Creates a task to build *one* additional module extension on an upgradeable structure.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` is not required.
	 * @returns {missionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildSingleModuleTask({buildTask, tickUID}) {

		const cellSize = state.grid.cellSize;

		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {
			// debug(`#createBuildBaseStructureTask(): No trucks available.`);
			return undefined;
		}

		const MAX_TRUCKS = 2;

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildSingleModuleTask(): Structure not available: ${buildTask.structureID}`);
			return undefined;
		}
		
		const MAX_POWER_MODULES = 1;
		const MAX_FACTORY_MODULES = 2;
		const MAX_RESEARCH_MODULES = 1;

		let baseStructures = [];
		switch(buildTask.structureID) {
			case (STRUCTURES["Power Module"].id):
				let generators = enumStruct(me, POWER_GEN).filter(gen => gen.modules < MAX_POWER_MODULES);
				baseStructures.push(...generators);
				break;
			case (STRUCTURES["Factory Module"].id):
				let factories = enumStruct(me, FACTORY).filter(factory => factory.modules < MAX_FACTORY_MODULES);
				let vtolFactories = enumStruct(me, VTOL_FACTORY).filter(factory => factory.modules < MAX_FACTORY_MODULES);
				baseStructures.push(...factories, ...vtolFactories);
				break;
			case (STRUCTURES["Research Module"].id):
				let labs = enumStruct(me, RESEARCH_LAB).filter(lab => lab.modules < MAX_RESEARCH_MODULES);
				baseStructures.push(...labs);
				break;
			default:
				// Do nothing
		}

		if (baseStructures.length === 0) {
			// debug(`#createBuildSingleModuleTask(): no available structures to place: ${buildTask.structureID}`);
			return undefined;
		}

		const x = baseStructures[0].x; 
		const y = baseStructures[0].y;
		const numFinishedModules = baseStructures[0].modules + 1;

		// Select closest trucks to location
		engineeringReserve.sort((a,b) => distSq(a.x, buildTask.x, a.y, buildTask.y) - distSq(b.x, buildTask.x, b.y, buildTask.y));
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS); 

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_SINGLE_MODULE_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.gx = Math.floor(x / cellSize);
		md.gy = Math.floor(y / cellSize);
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(buildSingleModule, md.taskForceID, buildTask.structureID, x, y, numFinishedModules);
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}

	/**
	 * Creates a task to build one defensive structure near a specified location.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.x` and `.y` properties.
	 * @returns {missionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildNearbyDefenceTask({buildTask, tickUID}) {
		const cellSize = state.grid.cellSize;

		const MINIMUM_TRUCKS = 2;
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length < MINIMUM_TRUCKS) {
			// debug(`#createBuildNearbyDefenceTask(): No trucks available.`);
			return undefined;
		}

		// Select closest trucks to new location
		const currDerrick = buildTask.payload;
		engineeringReserve.sort((a,b) => distSq(a.x, currDerrick.x, a.y, currDerrick.y) - distSq(b.x, currDerrick.x, b.y, currDerrick.y));
		const taskForceUnits = engineeringReserve.slice(0, MINIMUM_TRUCKS); 

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildNearbyDefenceTask(): Structure not available: ${buildTask.structureID}`);
			return undefined;
		}

		let preferredLoc = pickStructLocation3({structureID: buildTask.structureID, x: currDerrick.x, y: currDerrick.y});
		if (preferredLoc === undefined) {
			debug(`createBuildNearbyDefenceTask(): pickStructLocation3() could not find a valid location`);
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_NEARBY_DEFENCE_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.sectorID = currDerrick.id;			// TODO: CHECK IF "SECTORID" is the correct abstraction even though this is derrick ID (position ID?)
		md.gx = Math.floor(preferredLoc.x / cellSize);
		md.gy = Math.floor(preferredLoc.y / cellSize);
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations
		md.orders = () => this.#mcb(buildNearbyDefences, md.taskForceID, buildTask.structureID, preferredLoc.x, preferredLoc.y);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		// debug(`Mission creation for: _CONSTRUCT_NEARBY_DEFENCE_ -> (${preferredLoc.x}, ${preferredLoc.y}) `);			

		return md;
	}

	/**
	 * Creates a task to build one repair facility near a specified location.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.x` and `.y` properties.
	 * @returns {missionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildRepairCenterTask({buildTask, tickUID}) {
		const cellSize = state.grid.cellSize;

		const MINIMUM_TRUCKS = 2;
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length < MINIMUM_TRUCKS) {
			// debug(`#createBuildRepairCenterTask(): No trucks available.`);
			return undefined;
		}

		// Select closest trucks to new location
		const loc = buildTask.payload;
		engineeringReserve.sort((a,b) => distSq(a.x, loc.x, a.y, loc.y) - distSq(b.x, loc.x, b.y, loc.y));
		const taskForceUnits = engineeringReserve.slice(0, MINIMUM_TRUCKS); 

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildRepairCenterTask(): Structure not available: ${buildTask.structureID}`);
			return undefined;
		}

		let preferredLoc = pickStructLocation3({structureID: buildTask.structureID, x: loc.x, y: loc.y});
		if (preferredLoc === undefined) {
			debug(`createBuildRepairCenterTask(): pickStructLocation3() could not find a valid location`);
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_REPAIR_CENTER_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.sectorID = loc.id;			// TODO: CHECK IF "SECTORID" is the correct abstraction even though this is derrick ID (position ID?)
		md.gx = Math.floor(preferredLoc.x / cellSize);
		md.gy = Math.floor(preferredLoc.y / cellSize);
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations
		// Can use the same driver as 'buildNearbyDefences' (same logic)
		md.orders = () => this.#mcb(buildNearbyDefences, md.taskForceID, buildTask.structureID, preferredLoc.x, preferredLoc.y);		
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		// debug(`Mission creation for: CONSTRUCT_REPAIR_CENTER -> (${preferredLoc.x}, ${preferredLoc.y}) `);		

		return md;
	}

	/**
	 * Creates a task to demolish one repair facility at a specified location.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.x` and `.y` properties.
	 * @returns {missionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createDemolishRepairCenterTask({buildTask, tickUID}) {
		const cellSize = state.grid.cellSize;

		const MINIMUM_TRUCKS = 1;
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length < MINIMUM_TRUCKS) {
			// debug(`#createBuildRepairCenterTask(): No trucks available.`);
			return undefined;
		}

		// Select closest trucks to new location
		const loc = buildTask.payload;
		engineeringReserve.sort((a,b) => distSq(a.x, loc.x, a.y, loc.y) - distSq(b.x, loc.x, b.y, loc.y));
		const taskForceUnits = engineeringReserve.slice(0, MINIMUM_TRUCKS); 

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_DEMOLISH_REPAIR_CENTER_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.sectorID = loc.id;			
		md.gx = Math.floor(loc.x / cellSize);
		md.gy = Math.floor(loc.y / cellSize);
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations
		if (false) debug(`Mission creation for: DEMOLISH_REPAIR_CENTER -> (${loc.x}, ${loc.y}) `);			

		// Can use the same driver as 'buildNearbyDefences' (same logic)
		md.orders = () => this.#mcb(demolishStructure, md.taskForceID, buildTask.structureID, loc.x, loc.y);		
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}
}