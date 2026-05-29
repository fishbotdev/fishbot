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

class TacticalOperationsCenter {
	// This is the central location where all missions are planned, controlled & monitored.
	constructor() {

	}
	
	/**
	 * 
	 * @param {worldState} state 
	 * @returns 
	 */
	getActiveConstructionMissions(state) {
		const ACTIVE_MISSION_STATUSES = [MISSION_STATUS.IN_PROGRESS, MISSION_STATUS.NOT_STARTED];
		return state.activeMissions.filter(missionData => CONSTRUCTION_MISSION_TYPES.includes(missionData.missionType) && 
														 ACTIVE_MISSION_STATUSES.includes(missionData.missionStatus));
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @returns 
	 */
	getActiveAviationMissions(state) {
		const ACTIVE_MISSION_STATUSES = [MISSION_STATUS.IN_PROGRESS, MISSION_STATUS.NOT_STARTED];
		return state.activeMissions.filter(missionData => AVIATION_MISSION_TYPES.includes (missionData.missionType) &&
										  ACTIVE_MISSION_STATUSES.includes(missionData.missionStatus));
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @returns 
	 */
	manageMissions(state) {
		// This function manages the queue of missions; it is a state mutator

		if (state.activeMissions.length === 0) {
			return;
		}

		let numActive = 0;
		let currActiveMissions = [];

		// For each mission,
		for (let i=0; i<state.activeMissions.length; i++) {
			let md = state.activeMissions[i];

			// Ignore all missions which have already failed / succeeded
			if (md.missionStatus === MISSION_STATUS.FAILED || 
				md.missionStatus === MISSION_STATUS.SUCCEEDED || 
				md.missionStatus === MISSION_STATUS.FAILED_ABORTED) {
				continue;
			}

			// Close aborted missions
			if (md.missionStatus === MISSION_STATUS.ABORT) {
				if (defined(md.ceaseOrders)) {
					md.ceaseOrders();
				}
				md.missionStatus = MISSION_STATUS.FAILED_ABORTED;
				continue;
			}

			// Else add to active missions & execute pending missions
			numActive += 1;
			currActiveMissions.push(md);

			// Update mission status for unstarted missions
			if (md.missionStatus === MISSION_STATUS.NOT_STARTED) {
				md.missionStatus = MISSION_STATUS.IN_PROGRESS;
			}

			let retval = md.orders();

			// Process return value for in-progress missions
			if (md.missionStatus === MISSION_STATUS.IN_PROGRESS) {

				// debug(`retval.status ${retval.status}`);
				// debug("");
				switch (retval.status) {
					case MISSION_STATUS.SUCCEEDED:

						if (defined(md.ceaseOrders)) {
							md.ceaseOrders();
						}

						md.missionStatus = MISSION_STATUS.SUCCEEDED;
						break;
					case MISSION_STATUS.FAILED:
						if (defined(md.ceaseOrders)) {
							md.ceaseOrders();
						}
						md.missionStatus = MISSION_STATUS.FAILED;
						break;
					case MISSION_STATUS.IN_PROGRESS:
						continue;		// continue processing the next mission
					default:
						// do nothing
				}
			}
		}

		// actively prunes the list after management (this mutates state)
		state.activeMissions = currActiveMissions;
	}


	/**
	 * Note: This function shouldn't make decisions. It is the responsibility of higher command to determine which missions are worth doing.
	 * @param {worldState} state 
	 * @param {AirStrikeMissionRequest[]} aviationTargets 
	 * @returns {void}
	 */
	assignAviationMissions(state, aviationTargets) {

		aviationTargets.forEach((newMissionRequest, tickUID) => {

			const target = newMissionRequest.target;
			const missionType = newMissionRequest.missionType;
			const priority = newMissionRequest.priority;
			const NUM_UNITS = newMissionRequest.numAircraft;

			const missionData = this.createNewMission({missionType: missionType, priority: priority}, target, NUM_UNITS, tickUID);
				
			if (defined(missionData)) {
				// debug(`Scheduled AIR_STRIKE (${missionType}) for:`, missionData.id, newMissionRequest.name, newMissionRequest.type, newMissionRequest.player, newMissionRequest.id);
				state.activeMissions.push(missionData);
			}

		});
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @param {Array} intelTasks 
	 * @returns {void}
	 */
	assignIntelMissions(state, intelTasks) {

		for (let i=0; i<intelTasks.length; i++) {

			const missionType = intelTasks[i].missionType;
			const payload = intelTasks[i].payload;
			const priority = intelTasks[i].priority;

			const missionData = this.createNewMission({missionType: missionType, priority: priority}, payload, i);
			
			if (defined(missionData)) {
				state.activeMissions.push(missionData);
				// debug(`scheduled ${missionData.id} (${missionType}) @${gameTime}`);
				continue;
			} 
		}
	}

	/**
	 * Prints out a newly assigned construction task, where `task.missionType` matches any one of the search terms in `missionFilter`.
	 * @param {*} task 
	 * @param {*} missionID 
	 * @param {number[]?} missionFilter optional array for mission IDs e.g. [MISSION_TYPE.CONSTRUCT_OIL_DERRICK, MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE]
	 */
	#printConstructionDebugOutput(task, missionID, missionFilter=null) {
		let sectorID = '', structureID = '';
		if (defined(task.payload)) {
			sectorID = `@ ${task.payload.id}`;
			structureID = `-- ${task.structureID}`
		}

		if (missionFilter == null) {
			debug(`Scheduled BUILD (${task.missionType}) for: ${missionID} ${sectorID} ${structureID} ${sectorID}`);
		} else {
			if (missionFilter.includes(task.missionType)) {
				debug(`Scheduled BUILD (${task.missionType}) for: ${missionID} ${sectorID} ${structureID} ${sectorID}`);
			}
		}		
	};

	/**
	 * Adds new construction tasks to the `activeMissions` queue.
	 * @param {worldState} state 
	 * @param {Array} buildTasks 
	 * @returns {void}
	 */
	assignConstructionTasks(state, buildTasks) {
		const PRIORITY = MISSION_PRIORITY.HIGH;

		buildTasks.forEach((task, i) => {	
			const missionData = this.createNewMission({missionType: task.missionType, priority: PRIORITY}, task, i);		
			if (missionData !== undefined) {
				state.activeMissions.push(missionData);
				// this.#printConstructionDebugOutput(task, missionData.id);
			} 
		});
	}

	/**
	 * This function returns either:
	 * - `missionID`, if mission was created successfully
	 * - `undefined`, if mission was not created
	 * @param {*} missionData object containing `missionType: number` and `priority: number`.
	 * @param  {...any} args arguments containing mission information & administrative data (e.g. `tickUID` is used to differentiate the same type of mission started on the same decision tick).
	 * @returns 
	 */
	createNewMission({missionType, priority=MISSION_PRIORITY.LOW}, ...args) {
		let md = undefined; 	

		switch (missionType) {
			case MISSION_TYPE.ABORT_MISSION:
				break;		// handled in the mission manager


			/*
				AVIATION MISSIONS
			*/
			case MISSION_TYPE.VTOL_STAGING_MISSION:
				md = aviation.createVtolStagingMission();		
				break;
			case MISSION_TYPE.CAS_PATROL:
				md = aviation.createCasPatrolMission({x: args[0], y: args[1], tickUID: args[2]});		
				break;
			case MISSION_TYPE.CAS_STRIKE:
				md = aviation.createAirStrikeMission({targetInfo: args[0], numRaidAircraft: args[1], tickUID: args[2], type: "CAS_STRIKE"});
				break;
			case MISSION_TYPE.AIR_RAID:
				md = aviation.createAirStrikeMission({targetInfo: args[0], numRaidAircraft: args[1], tickUID: args[2], type: "AIR_RAID"});
				break;
			case MISSION_TYPE.DAS_STRIKE:
				md = aviation.createAirStrikeMission({targetInfo: args[0], numRaidAircraft: args[1], tickUID: args[2], type: "DAS_STRIKE"});
				break;
			case MISSION_TYPE.AIR_RECON_SILENT:
				md = aviation.createAirReconSilentMission({x: args[0], y: args[1], tickUID: args[2]});		
				break;
			case MISSION_TYPE.AIR_RECON_PATROL:
				md = aviation.createAirReconPatrolMission({x: args[0], y: args[1], tickUID: args[2]});		
				break;

			/*
				GROUND MISSIONS
			*/
			case MISSION_TYPE.RETURN_FOR_REPAIR:
				md = groundForces.createReturnForRepairMission();
				break;

			/*
				CONSTRUCTION MISSIONS
			*/
			case MISSION_TYPE.HELP_CONSTRUCT:
				md = engineering.createHelpConstructTask();		
				break;
			case MISSION_TYPE.CONSTRUCT_OIL_DERRICK:
				md = engineering.createBuildDerrickTask({buildTask: args[0], tickUID: args[1]});
				break;
			case MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE:
				md = engineering.createBuildBaseStructureTask({buildTask: args[0], tickUID: args[1]});		
				break;
			case MISSION_TYPE.CONSTRUCT_SINGLE_MODULE:
				md = engineering.createBuildSingleModuleTask({buildTask: args[0], tickUID: args[1]});
				break;
			case MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE:
				md = engineering.createBuildNearbyDefenceTask({buildTask: args[0], tickUID: args[1]});		
				break;
			case MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR:
				md = engineering.createBuildAllDerricksInSectorTask({buildTask: args[0], tickUID: args[1]});
				break;
			case MISSION_TYPE.CONSTRUCT_REPAIR_CENTER:
				md = engineering.createBuildRepairCenterTask({buildTask: args[0], tickUID: args[1]});		
				break;
			case MISSION_TYPE.DEMOLISH_REPAIR_CENTER:
				md = engineering.createDemolishRepairCenterTask({buildTask: args[0], tickUID: args[1]})		
				break;	
			default:	
				// Do nothing
		}

		if (md !== undefined) {
			// If mission is valid, mission data (md) is defined
			md.missionStatus = MISSION_STATUS.NOT_STARTED;
			md.missionType = missionType;
			md.priority = priority;	
			md.timeStarted = getCurrGameTime();

			// If valid mission, return missionData to higher level command, else, return undefined
			return md;			
		} else {
			return undefined;		 
		}
	}

	#debugPrintSpatialField(heatmap, name) {
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;

		debug(`\nupdateSpatialFields(): ${name} @ ${gameTime}`);
		for (let gy=0; gy<numYCells; gy++) {
			let row = "";

			for (let gx=0; gx<numXCells; gx++) {					
				const val = Math.round(heatmap[gx][gy]);
				if (val < 0 || val >= 10) {
					row += `${val} `;
				} else {
					row += ` ${val} `;
				}				
			}
			debug(row);
		}
	}

	/**
	 * This function fills in a square region of the `heatmap` centred at `cx`, `cy` with minimum value `minVal`.
	 * @param {number[][]} heatmap 
	 * @param {number} numXCells 
	 * @param {number} numYCells 
	 * @param {number} cx 
	 * @param {number} cy 
	 * @param {number} radius 
	 * @param {number} minVal 
	 * @returns {void}
	 */
	#floodFillSquareRegion(heatmap, numXCells, numYCells, cx, cy, radius, minVal) {

		const DEV = radius;

		for (let dx=-DEV; dx <= DEV; dx++) {
			for (let dy=-DEV; dy<=DEV; dy++) {
				const x = cx+dx;
				const y = cy+dy;

				if (x < 0 || x >= numXCells || y < 0 || y >= numYCells) 	continue;

				if (minVal === 0) {
					heatmap[x][y] = 0;
				} else if (minVal > 0) {
					heatmap[x][y] = Math.max(heatmap[x][y], minVal);			
				} else {
					heatmap[x][y] = Math.min(heatmap[x][y], minVal);
				}
			}
		}
	}

	/**
	 * Applies a simple smoothing kernel
	 * @param {number[][]} heatmap 
	 * @param {number} numXCells 
	 * @param {number} numYCells 
	 * @returns 
	 */
	#filterField(heatmap, numXCells, numYCells) {
		const emptyCell = (...args) => {return 0;};
		let filteredGrid = create2DGrid(numXCells, numYCells, emptyCell);

		const KERNEL = [
			[0.33, 0.33, 0.33],
			[0.33, 1.0,  0.33],
			[0.33, 0.33, 0.33]
		];

		const XDEV = 1;
		const YDEV = 1;

		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {
				if (heatmap[gx][gy] === 0) {
					continue;
				}

				for (let dx=-XDEV; dx <= XDEV; dx++) {
					if (gx + dx < 0 || gx + dx >= numXCells) {
						continue;
					}

					for (let dy=-YDEV; dy <= YDEV; dy++) {
						if (gy + dy < 0 || gy + dy >= numYCells) {
							continue;
						}
						const influence = heatmap[gx][gy] * KERNEL[dy + YDEV][dx + XDEV];		
						filteredGrid[gx+dx][gy+dy] += influence;
					}
				}
			}
		}

		return filteredGrid;
	}

	/**
	 * Updates all derived fields which are subsequently used for decision making.
	 * This is a necessary tool for FishBot to understand the game world.
	 * @param {worldState} state 
	 * @param {any[][]} newGrid 
	 */
	updateSpatialFields(state, newGrid) {
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;
		const grid = state.grid.grid;
		const cellSize = state.grid.cellSize;

		const TEMP_GRID = newGrid;

		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {
				state.fields['adaThreat'][gx][gy] = TEMP_GRID[gx][gy]['adaCount'];
				state.fields['enemyUnitThreat'][gx][gy] = TEMP_GRID[gx][gy]['enemyDirectFireUnitCount'];				
				state.fields['enemyStaticDefenceThreat'][gx][gy] = TEMP_GRID[gx][gy]['fixedDefenceCount'];
				state.fields['unclaimedDerricksInCell'][gx][gy] = grid[gx][gy]['derricks'].length - TEMP_GRID[gx][gy]['claimedDerricks'].length;

				let numFriendlyDerricks = 0, numEnemyDerricks = 0;
				TEMP_GRID[gx][gy]['claimedDerricks'].forEach(d => {
					if (isEnemy(d.playerID)) {
						numEnemyDerricks++;
					} else {
						numFriendlyDerricks++;
					}
				});

				const NUM_FRIENDLY_STRUCTURES = grid[gx][gy]['friendlyStructures'].length - numFriendlyDerricks;
				const NUM_ENEMY_STRUCTURES = grid[gx][gy]['targetStructures'].length - numEnemyDerricks;
				state.fields['controlStability'][gx][gy] = NUM_FRIENDLY_STRUCTURES - NUM_ENEMY_STRUCTURES;				

				// Then update derrick information (updates the DerrickObject directly)
				const claimed = TEMP_GRID[gx][gy]['claimedDerricks'];
				const derricksInCell = state.grid.grid[gx][gy]['derricks'];
				derricksInCell.forEach(d => {
					for (let i=0; i<claimed.length; i++) {
						// if (true) debug(`derrick d${d.id}, claimed.length; ${claimed.length}`);
						if (d.id !== claimed[i].id) {
							continue;
						}

						d['isClaimed'] = true;
						d['playerID'] = claimed[i]['playerID'];
						return;
					}
					// Else unclaimed
					d['isClaimed'] = false;
					d['playerID'] = undefined;
					return;			
				});
			}	
		}

		if (false) this.#debugPrintSpatialField(state.fields['adaThreat'], 'adaThreat - BEFORE FILTER');		
		state.fields['adaThreat'] = this.#filterField(state.fields['adaThreat'], numXCells, numYCells);
		if (false) this.#debugPrintSpatialField(state.fields['adaThreat'], 'adaThreat - AFTER FILTER');
		if (false) this.#debugPrintSpatialField(state.fields['enemyStaticDefenceThreat'], 'enemyStaticDefenceThreat');
		if (false) this.#debugPrintSpatialField(state.fields['enemyUnitThreat'], 'enemyUnitThreat');
		state.fields['enemyUnitThreat'] = this.#filterField(state.fields['enemyUnitThreat'], numXCells, numYCells);		
		if (false) this.#debugPrintSpatialField(state.fields['enemyUnitThreat'], 'enemyUnitThreat');
		if (false) this.#debugPrintSpatialField(state.fields['unclaimedDerricksInCell'], 'unclaimedDerricksInCell');
		state.fields['controlStability'] = this.#filterField(state.fields['controlStability'], numXCells, numYCells);						
						
		if (false) this.#debugPrintSpatialField(state.fields['controlStability'], 'controlStability - BEFORE');

		const livingPlayers = state.enumLivingPlayers();
		const EQUIDIVISION_RADIUS = Math.max(Math.floor(mapWidth / startPositions.length / cellSize), Math.floor(mapHeight / startPositions.length / cellSize));
		const baseControlRadius = Math.min(EQUIDIVISION_RADIUS, Math.ceil(30 / cellSize));

		state.poi.bases.forEach(b => {
			if (!livingPlayers.includes(b.playerID)) return;
			
			if (isEnemy(b.playerID)) {
				this.#floodFillSquareRegion(state.fields['controlStability'], numXCells, numYCells, b.gx, b.gy, baseControlRadius, -5);
			} else {
				this.#floodFillSquareRegion(state.fields['controlStability'], numXCells, numYCells, b.gx, b.gy, baseControlRadius, 5);
			}
		});
		if (false) this.#debugPrintSpatialField(state.fields['controlStability'], 'controlStability - AFTER');
	}

	/**
	 * 
	 * @param {Object} state 
	 * @param {any[][]} newGrid 
	 * @param {Array} playerInfo 
	 * @returns {void}
	 */
	#printDebugGrid(state, newGrid, playerInfo) {
		// Write updated units to grid (only overwriting "KEYS" defined below)
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;

		state.playerInfo = playerInfo;
		
		if (false) {
			debug(`\nGrid-form derrickInfo @ ${gameTime}`);
			for (let gy=0; gy<numYCells; gy++) {
				let row = "\t";

				for (let gx=0; gx<numXCells; gx++) {
					let count = 0;

					const derricksInCell = state.grid.grid[gx][gy]['derricks'];
					derricksInCell.forEach(d => {
						if (d.isClaimed) {
							count++;
						}
					});
					row += `${count} `;
				}
				debug(row);
			}
		}

		if (false) {
			// Test if grid['derricks'] & state.poi.derricks point to the same location in memory (yes)
			debug(`List form - derrickInfo @ ${gameTime}`);
			state.poi.derricks.forEach(d => debug(`	${d.id}\t\t${d.isClaimed ? `claimed by ${d.playerID}`: 'unclaimed'}`));
		}

		if (false) {
			const cellSize = state.grid.cellSize;
			const numXCells = Math.ceil(mapWidth / cellSize);
			const numYCells = Math.ceil(mapHeight / cellSize);

			if (false) {
				for (let gx=0; gx<numXCells; gx++) {
					for (let gy=0; gy<numYCells; gy++) {

						if (newGrid[gx][gy]['targetUnits'].length > 0 || newGrid[gx][gy]['targetStructures'].length > 0) {
							debug(`\nObjects in grid: (${gx} ${gy}) @ ${gameTime}`);

							newGrid[gx][gy]['targetUnits'].forEach(t => debug(`	${t.name} (${t.id}): player ${t.player}`));							
							newGrid[gx][gy]['targetStructures'].forEach(t => debug(`	${t.name} (${t.id}): player ${t.player} `));
						}
					}
				}
			}

			for (let gx=0; gx<numXCells; gx++) {
				for (let gy=0; gy<numYCells; gy++) {
					if (state.grid.grid[gx][gy]['targetUnits'].length > 0 || state.grid.grid[gx][gy]['targetStructures'].length > 0) {
						debug(`Objects in actual grid: (${gx} ${gy}) @ ${gameTime}`);

						state.grid.grid[gx][gy]['targetUnits'].forEach(t => debug(`	${t.name} (${t.id}): player ${t.player}`));							
						state.grid.grid[gx][gy]['targetStructures'].forEach(t => debug(`	${t.name} (${t.id}): player ${t.player} `));
						debug(`${state.grid.grid[gx][gy]['derricks']}`);
					}
				}
			}
		}

		if (false) {
			playerInfo.forEach(p => {
				debug(`${p.playerID} (${p.isFriendly})\n\tDROID tot ${p.numTotalUnits}, inf ${p.numInfantryUnits}, arm ${p.numArmourUnits}, air ${p.numAirUnits}, indi ${p.numIndirectUnits}, ada ${p.numADA}\n\tSTRUCTURE tot ${p.numStructs}, derr ${p.numDerricks}`);
			});
			debug('');
		}
	}

	/**
	 * Prints `playerInfo` to the console.
	 * @param {*} p 
	 */
	#debugPrintPlayerInfo(p) {
		
		if (false) {
			debug(`== ${p.playerID} UNIT STATS ==`);

			// Print Unit stats
			debug(`\nnumTotalUnits: ${p['numTotalUnits']}`); 
			debug(`\tnumInfantryUnits: ${p['numInfantryUnits']}`); 
			debug(`\tnumArmourUnits: ${p['numArmourUnits']}`); 
            debug(`\tnumAirUnits: ${p['numAirUnits']}`);      
			debug(``);
            debug(`\tnumRocketUnits: ${p['numRocketUnits']}`);        
            debug(`\tnumCannonUnits: ${p['numCannonUnits']}`);      
            debug(`\tnumMGUnits: ${p['numMGUnits']}`);
            debug(`\tnumShortRangeIndirectUnits: ${p['numShortRangeIndirectUnits']}`);
            debug(`\tnumLongRangeIndirectUnits: ${p['numLongRangeIndirectUnits']}`);
            debug(`\tnumVTOLBombUnits: ${p['numVTOLBombUnits']}`);
            debug(`\tnumADAUnits: ${p['numADAUnits']}`); 
            debug(`\tnumLaserUnits: ${p['numLaserUnits']}`);
            debug(`\tnumFlamerUnits: ${p['numFlamerUnits']}`);
		}
	}

	/**
	 * 	This function performs multiple functions:
	 * 	1. Gets all droids & structures on the map (like taking a satellite image of the whole map).
	 * 	2. Classifies all droids & structures, writing a new `state.playerInfo` as well as `state.grid.grid`. 
	 * 	3. Updates spatial fields (calls `this.updateSpatialFields`).
	 * @param {worldState} state 
	 * @param {PlayerInfoBucketObject[]} rawObjectData 
	 * @returns {void}
	 */
	updateCoreIntel(state, rawObjectData) {

		const grid = state.grid.grid;
		const numXCells = state.grid.numXCells;		
		const numYCells = state.grid.numYCells;
		const cellSize = state.grid.cellSize;

		const createNewCell = (gx, gy) => {
			return {
				'gx': gx,
				'gy': gy,    
				'adaCount': 0,						// for adaThreat      
				'fixedDefenceCount': 0, 			// for enemyStaticDefences
				'claimedDerricks': [],				// for updating of derrick information
				'enemyDirectFireUnitCount': 0,		// for direct fire unit threat
			}
		}
		const TEMP_GRID = create2DGrid(numXCells, numYCells, createNewCell);

		const createNewClaimedDerrick = (x, y, playerID) => {       
			// Reduced version of the function in `worldStateBuilder`.
			return {
				'id': `DERRICK_${x}_${y}`,				
				'playerID': playerID,
			}
		};

		const resetAllGridCells = () => {
			const PROPERTIES_TO_ERASE = ['targetUnits', 'targetStructures', 'friendlyUnits', 'friendlyStructures'];
			for (let gx=0; gx<numXCells; gx++) {
				for (let gy=0; gy<numYCells; gy++) {
					PROPERTIES_TO_ERASE.forEach(property => {grid[gx][gy][property].length = 0;});
				}
			}
		};

		resetAllGridCells();

		// Write new grid cells
		for (let i=0; i<rawObjectData.length; i++) {
			const currPlayerEntry = rawObjectData[i];

			const PLAYER_ID = currPlayerEntry['playerID'];
			const p = createPlayerInfoEntry(PLAYER_ID);

			const PLAYER_IS_ENEMY = !p['isFriendly'];
			const PLAYER_IS_ME = (PLAYER_ID === me);


			for (let j=0; j<currPlayerEntry['droids'].length; j++) {
				const obj = currPlayerEntry['droids'][j];

				const flags = classifyGameObject(obj);
				const x = obj.x;
				const y = obj.y;
				const gx = Math.floor(x / cellSize);
				const gy = Math.floor(y / cellSize);

				const fbObject = createFbObject(obj, flags, x, y, gx, gy);

				// Update player information
				p['numTotalUnits']++;

				// UNIT "BODY" (ARMOUR, CYBORGS, VTOLS)
				const ARMOUR_FORBIDDEN_FLAGS = (OBJ_FLAGS.ADA | OBJ_FLAGS.INDIRECT_FIRE);

				if (flags & OBJ_FLAGS.ARMOUR && !(flags & ARMOUR_FORBIDDEN_FLAGS)) {
					p['numArmourUnits']++;
				} else if (flags & OBJ_FLAGS.INFANTRY) {
					p['numInfantryUnits']++;
				} else if (flags & OBJ_FLAGS.AVIATION) {
					p['numAirUnits']++;
				}
			
				// UNIT "WEAPON"
				if (flags & OBJ_FLAGS.CANNON_WEAPON) {
					p['numCannonUnits']++;
				} else if (flags & OBJ_FLAGS.AT_ROCKET_WEAPON) {
					p['numRocketUnits']++;
				} else if (flags & OBJ_FLAGS.MACHINEGUN_WEAPON) {
					p['numMGUnits']++;
				} else if (flags & OBJ_FLAGS.SHORT_RANGE_ARTILLERY_WEP) {
					p['numShortRangeIndirectUnits']++;
				} else if (flags & OBJ_FLAGS.LONG_RANGE_ARTILLERY_WEP) {
					p['numLongRangeIndirectUnits']++;
				} else if (flags & OBJ_FLAGS.VTOL_ARTILLERY_WEAPON) {
					p['numVTOLBombUnits']++;
				} else if (flags & (OBJ_FLAGS.AA_DIRECT_FIRE_WEAPON | OBJ_FLAGS.AA_ROCKET_WEAPON)) {
					p['numADAUnits']++;
				} else if (flags & OBJ_FLAGS.LASER_WEAPON) {
					p['numLaserUnits']++;
				} else if (flags & OBJ_FLAGS.FLAMER_WEAPON) {
					p['numFlamerUnits']++;
				} else if (flags & OBJ_FLAGS.CONSTRUCTOR) {
					p['numTrucks']++;
				}

				if (PLAYER_IS_ENEMY) {
					// Update grid
					grid[gx][gy]['targetUnits'].push(fbObject);

					// Update spatial field
					if (flags & OBJ_FLAGS.ADA) {
						TEMP_GRID[gx][gy]['adaCount']++;			
					}

					const LAND_UNITS = OBJ_FLAGS.ARMOUR | OBJ_FLAGS.INDIRECT_FIRE | OBJ_FLAGS.INFANTRY;
					if (flags & LAND_UNITS) {						
						TEMP_GRID[gx][gy]['enemyDirectFireUnitCount']++;
					}

				} else {
					// Update grid
					grid[gx][gy]['friendlyUnits'].push(fbObject);
				}
			}	


			for (let j=0; j<currPlayerEntry['structs'].length; j++) {
				const obj = currPlayerEntry['structs'][j];
				
				const flags = classifyGameObject(obj);
				const x = obj.x;
				const y = obj.y;
				const gx = Math.floor(x / cellSize);
				const gy = Math.floor(y / cellSize);

				const fbObject = createFbObject(obj, flags, x, y, gx, gy);
				
				// Update player information
				p['numStructs'] += 1;

				if (flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					p['numDerricks']++;
					TEMP_GRID[gx][gy]['claimedDerricks'].push(createNewClaimedDerrick(obj.x, obj.y, obj.player));			
				}


				if (flags & OBJ_FLAGS.PRODUCTION) {
					p['numFactories']++;

					if (PLAYER_IS_ME) {
						if (obj.stattype === FACTORY) {
							// debug(`${p.playerID}: factory ${idx} `)
							p["normalFactoryFbObjects"].push(fbObject);
						} else if (obj.stattype === CYBORG_FACTORY) {
							// debug(`${p.playerID}: cybfactory ${idx}`)
							p["cyborgFactoryFbObjects"].push(fbObject);
						} else if (obj.stattype === VTOL_FACTORY) {
							// debug(`${p.playerID}: vtolfactory ${idx}`)
							p["vtolFactoryFbObjects"].push(fbObject);
						}
					}
				}

				if (flags & OBJ_FLAGS.RESEARCH) {
					if (PLAYER_IS_ME) {
						p["researchFacilityFbObjects"].push(fbObject);
					}
				}

				if (obj.stattype === HQ && obj.status === BUILT) {
					// manual classification (outside of `classifyObject`) -> not required to track HQs
					p['numConstructedHQs']++;
				}
				
				if (flags & OBJ_FLAGS.REPAIR) {
					p['numRepairFacilities']++;
					if (PLAYER_IS_ME) {
						p["repairFacilityFbObjects"].push(fbObject);
					}
				}

				if (PLAYER_IS_ENEMY) {	
					grid[gx][gy]['targetStructures'].push(fbObject);
					
					// ADA defences
					if (flags & OBJ_FLAGS.ADA) {
						TEMP_GRID[gx][gy]['adaCount']++;
					}

					// Ground defences
					const BUILT_DEFENCE = OBJ_FLAGS.DEFENSIVE_STRUCTURE | OBJ_FLAGS.IS_BUILT;
					if ((flags & BUILT_DEFENCE) === BUILT_DEFENCE && !(flags & OBJ_FLAGS.ADA)) {
						TEMP_GRID[gx][gy]['fixedDefenceCount']++;
					}
				} else {
					grid[gx][gy]['friendlyStructures'].push(fbObject);
				}
			}

			// this.#debugPrintPlayerInfo(p);
			state.playerInfo[PLAYER_ID] = p;		
		}
	
		this.updateSpatialFields(state, TEMP_GRID);

	}

	/**
	 * This function writes `oilDominance` to `state`.
	 * @param {worldState} state
	 * @param {boolean} isOilDominant
	 * @returns {void}
	 */
	setOilDominanceStatus(state, isOilDominant) {

		if (state.oilDominance === isOilDominant) {
			return;
		}

		debug(`${gameTime}: oil dominance changed to ${isOilDominant}`);
		state.oilDominance = isOilDominant;
	}

	/**
	 * Updates `brigade.nearbyTargets`.
	 * @param {worldState} state 
	 * @param {number} brigadeID 
	 * @param {NearbyTargets} newNearbyTargets 
	 * @returns {void}
	 */
	addBrigadeTargets(state, brigadeID, newNearbyTargets) {
		const currBrigadeTargets = state.brigades[brigadeID]['nearbyTargets'];

		for (const [targetType, metadata] of Object.entries(newNearbyTargets)) {
			currBrigadeTargets[targetType] = metadata;
		}
	}

	/**
	 * This function writes `location` to `state.brigades[id].location`.
	 * @param {worldState} state 
	 * @param {number} brigadeID 
	 * @param {PositionInfo} brigadeLocation
	 * @returns {void}
	 */
	setBrigadeLocation(state, brigadeID, brigadeLocation) {
		const currBrigade = state.brigades[brigadeID];
		currBrigade['location'] = brigadeLocation;
	}

	/**
	 * This function writes `strength` (percentage) to `state.brigades[id].strength`.
	 * @param {worldState} state 
	 * @param {number} brigadeID 
	 * @param {number} strength
	 * @returns {void}
	 */
	setBrigadeStrength(state, brigadeID, strength) {
		const currBrigade = state.brigades[brigadeID];
		currBrigade['strength'] = strength;
	}

	/**
	 * This function overwrites `state.brigades[id].casStrikeRequests` with new CAS strike requests.
	 * @param {worldState} state 
	 * @param {number} brigadeID 
	 * @param {AirStrikeMissionRequest[]} newCasRequests 
	 */
	setBrigadeCASStrikeRequests(state, brigadeID, newCasRequests) {
		const currBrigade = state.brigades[brigadeID];
		currBrigade['casStrikeRequests'].length = 0;
		currBrigade['casStrikeRequests'] = newCasRequests;
	}

	/**
	 * This function writes `aviationTargets` to `state`.
	 * @param {worldState} state 
	 * @param {AirStrikeMissionRequest[]} raidTargets 
	 * @param {AirStrikeMissionRequest[]} productionTargets 
	 * @param {AirStrikeMissionRequest[]} adaTargets 
	 * @param {AirStrikeMissionRequest[]} indirectFireTargets 
	 * @param {AirStrikeMissionRequest[]} defensiveStructureTargets 
	 * @returns {void}
	 */
	setAviationTargets(state, raidTargets, productionTargets, adaTargets, indirectFireTargets, defensiveStructureTargets) {
		state.aviationTargets['raidTargets'] = raidTargets;
		state.aviationTargets['productionTargets'] = productionTargets;
		state.aviationTargets['adaTargets'] = adaTargets;
		state.aviationTargets['indirectFireTargets'] = indirectFireTargets;
		state.aviationTargets['defensiveStructureTargets'] = defensiveStructureTargets;
	}

	/**
     * Adds all newly manufactured droids into a FishBot group. 
	 * Called directly by the `eventDroidBuilt` handler.
	 * @param {worldState} state
     * @param {DroidObject} droid 
	 * @param {number | undefined} groupIdToRemove
     * @returns {void}
     */
    setNewDroidGroup(state, droid, groupIdToRemove=undefined) {

		const groupID = getDroidFbGroupClassification(droid);

		if (defined(groupIdToRemove)) {
			state.g.removeDroidFromGroup({groupID: groupIdToRemove, droidID: droid.id});
		}

		state.g.addDroidToGroup({groupID: groupID, droidID: droid.id});
	}

	/**
	 * Assigns units to a brigade.
	 * @param {worldState} state 
	 * @param {*} reinforcements 
	 * @param {number} brigadeID 
	 * @returns {void}
	 */
	assignUnitsToBrigade(state, reinforcements, brigadeID) {
		
		for (const c of Object.values(reinforcements)) {
			c['unitList'].forEach(droid => {
				state.g.removeDroidFromGroup({groupID: c['category'], droidID: droid.id});
				state.g.addDroidToGroup({groupID: brigadeID, droidID: droid.id});
			});
		}
	}

	/**
	 * Assigns units to the `RETURNING_FOR_REPAIR` group (these units will immediately head towards base / the nearest repair facility).
	 * @param {worldState} state 
	 * @param {DroidObject[]} unitList 
	 * @param {number} brigadeID 
	 */
	assignUnitsForRepair(state, unitList, brigadeID) {
		unitList.forEach(droid => {
			state.g.removeDroidFromGroup({groupID: brigadeID, droidID: droid.id});
			state.g.addDroidToGroup({groupID: DIVISION.RETURNING_FOR_REPAIR, droidID: droid.id});
		});
	}
}