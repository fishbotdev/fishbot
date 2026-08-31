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

/**
 * This function writes to (mutates) the game state (`worldState`).
 */
class TacticalOperationsCenter {
	constructor() {

	}
	
	/**
	 * This function assigns time blocks to each of the requested periodic tasks in `taskSchedule`.
	 * 	 It creates a long array of 'true' & 'false' in memory, which allows for simple lookup using the time index.
	 * 	 This function uses multiplicative hashing to produce a 'random' phase offset for each task.
	 * @param {worldState} state 
	 * @param {Object} taskSchedule
	 */
	setSchedulerParameters(state, taskSchedule) {

		const SHOW_SCHEDULER_PARAMS = false;
		const BLOCKS_PER_MIN = state.BLOCKS_PER_MIN;

		const r = generateRange(BLOCKS_PER_MIN);		

		const usedTimeBlocks = [];
		
		let taskCount = 0;
		for (const [taskName, taskData] of Object.entries(taskSchedule)) {
			state.WORKER_IDS[taskName] = [];	
			const u = [];		

			const requestsPerMin = taskData.requestsPerMin;
			
			const requestInterval = Math.floor(BLOCKS_PER_MIN / requestsPerMin);

			taskCount += 1;
			const taskHash = taskCount * 2654435761;

			for (let i=0; i<r.length; i++) {
				const blockHash = r[i] * 1013904223;
				const hash = taskHash + blockHash;

				const taskSchedule = state.WORKER_IDS[taskName];

				if (hash % requestInterval !== 0) {
					taskSchedule.push(-1);		
					continue;			
				} 

				taskSchedule.push(1);		// todo: temporary, consider making this staged -> can be anything but -1

				usedTimeBlocks.push(i);	
				u.push(i);
			}

			if (SHOW_SCHEDULER_PARAMS) {
				u.sort((a,b) => a - b);
				deb(`"${taskName}" used timeslots: ${u}`);
			}
		}

		if (SHOW_SCHEDULER_PARAMS) {
			usedTimeBlocks.sort((a,b) => a - b);
			deb(`used timeslots: ${usedTimeBlocks}`);
		}
	}

	/**
	 * @param {worldState} state 
	 * @returns 
	 */
	getActiveConstructionMissions(state) {
		const ACTIVE_MISSION_STATUSES = [MISSION_STATUS.IN_PROGRESS, MISSION_STATUS.NOT_STARTED];
		return state.activeMissions.filter(missionData => CONSTRUCTION_MISSION_TYPES.includes(missionData.missionType) && 
														 ACTIVE_MISSION_STATUSES.includes(missionData.missionStatus));
	}

	/**
	 * @param {worldState} state 
	 * @returns 
	 */
	getActiveAviationMissions(state) {
		const ACTIVE_MISSION_STATUSES = [MISSION_STATUS.IN_PROGRESS, MISSION_STATUS.NOT_STARTED];
		return state.activeMissions.filter(missionData => AVIATION_MISSION_TYPES.includes (missionData.missionType) &&
										  ACTIVE_MISSION_STATUSES.includes(missionData.missionStatus));
	}

	/**
	 * This function manages the queue of missions, executes in-progress missions & prunes the `state.activeMissions` list after processing.
	 * @param {worldState} state 
	 * @returns {void}
	 */
	manageMissions(state) {

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

			const retval = md.orders();

			// Process return value for in-progress missions
			if (md.missionStatus === MISSION_STATUS.IN_PROGRESS) {
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
						warn(`Could not understand return code: "${retval.status}" for in-progress mission "${md.id}". Skipping.`);
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
				
			if (missionData != undefined) {
				// debug(`Scheduled AIR_STRIKE (${missionType}) for:`, missionData.id, newMissionRequest.name, newMissionRequest.type, newMissionRequest.player, newMissionRequest.id);
				state.activeMissions.push(missionData);
			}

		});
	}

	/**
	 * Prints out a newly assigned construction task, where `task.missionType` matches any one of the search terms in `missionFilter`.
	 * @param {*} task 
	 * @param {*} missionID 
	 * @param {number[]?} missionFilter optional array for mission IDs e.g. [MISSION_TYPE.CONSTRUCT_OIL_DERRICK, MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE]
	 */
	#printConstructionDebugOutput(task, missionID, missionFilter=null) {
		let structureID = '', coordinate = '';
		if (defined(task.payload)) {
			structureID = `-- ${task.structureID}`;
			coordinate = `(${task.payload.x}, ${task.payload.y})`
		}

		if (missionFilter == null) {
			debug(`\t${gameTime}: Scheduled BUILD (${task.missionType}) for: ${missionID} ${structureID} ${coordinate}`);
		} else {
			if (missionFilter.includes(task.missionType)) {
				debug(`\t${gameTime}: Scheduled BUILD (${task.missionType}) for: ${missionID} ${structureID} ${coordinate}`);
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
				// this.#printConstructionDebugOutput(task, missionData.id, [MISSION_TYPE.DEMOLISH_REPAIR_CENTER, MISSION_TYPE.CONSTRUCT_REPAIR_CENTER]);
			} 
		});
	}

	/**
	 * Prunes expired entries from an aborted-sector record, then records the sectors called off this tick.
	 * Everything left in the record afterwards is still cooling down.
	 * @param {Map<number | string, number>} record Map from `sectorID` to the `gameTime` it was called off.
	 * @param {(number | string)[]} abortedSectorIDs Sectors called off as dangerous this tick.
	 * @param {number} cooldownMs How long an aborted sector stays off the option list.
	 * @returns {void}
	 */
	#updateAbortedSectorRecord(record, abortedSectorIDs, cooldownMs) {
		record.forEach((abortedAt, sectorID) => {
			if (gameTime - abortedAt >= cooldownMs) {
				record.delete(sectorID);
			}
		});

		abortedSectorIDs.forEach(sectorID => record.set(sectorID, gameTime));
	}

	/**
	 * Writes back what a construction tick learned about remote construction planning: the sectors called off
	 * as too dangerous (oil capture and derrick defences are recorded separately, as a defence mission reuses
	 * the derrick's ID as its sectorID), and whether an oil-capture planning pass ran.
	 * @param {worldState} state
	 * @param {Object} abortedSectors Sectors called off as dangerous this tick.
	 * @param {(number | string)[]} abortedSectors.abortedOilSectorIDs
	 * @param {(number | string)[]} abortedSectors.abortedDefenceSectorIDs
	 * @param {boolean} planningPassRan Whether oil-capture options were regenerated this tick.
	 * @param {number} cooldownMs How long an aborted sector stays off the option list.
	 * @returns {void}
	 */
	updateConstructionPlanningRecord(state, {abortedOilSectorIDs, abortedDefenceSectorIDs}, planningPassRan, cooldownMs) {
		this.#updateAbortedSectorRecord(state.abortedOilSectors, abortedOilSectorIDs, cooldownMs);
		this.#updateAbortedSectorRecord(state.abortedDefenceSectors, abortedDefenceSectorIDs, cooldownMs);

		if (planningPassRan) {
			state.oilCapPlannedAt = state.grid.lastUpdatedAt;
		}
	}

	/**
	 * @param {Object} missionData 
	 * @param {number} missionData.missionType
	 * @param {number} missionData.priority
	 * @param  {...any} args arguments containing mission information & administrative data (e.g. `tickUID` is used to differentiate the same type of mission started on the same decision tick).
	 * @returns {ConstructionMissionData | CombatMissionData | undefined}
	 */
	createNewMission({missionType, priority=MISSION_PRIORITY.LOW}, ...args) {
		let md; 	

		switch (missionType) {
			case MISSION_TYPE.ABORT_MISSION:
				break;		// handled in the mission manager

			/*
				AVIATION MISSIONS
			*/
			case MISSION_TYPE.VTOL_STAGING_MISSION:
				md = aviation.createVtolStagingMission({missionType: missionType});		
				break;
			case MISSION_TYPE.CAS_STRIKE:
				md = aviation.createAirStrikeMission({missionType: missionType, target: args[0], numRaidAircraft: args[1], tickUID: args[2], type: "CAS_STRIKE"});
				break;
			case MISSION_TYPE.AIR_RAID:
				md = aviation.createAirStrikeMission({missionType: missionType, target: args[0], numRaidAircraft: args[1], tickUID: args[2], type: "AIR_RAID"});
				break;
			case MISSION_TYPE.DAS_STRIKE:
				md = aviation.createAirStrikeMission({missionType: missionType, target: args[0], numRaidAircraft: args[1], tickUID: args[2], type: "DAS_STRIKE"});
				break;

			/*
				GROUND MISSIONS
			*/
			case MISSION_TYPE.RETURN_FOR_REPAIR:
				md = groundForces.createReturnForRepairMission({missionType: missionType});
				break;

			/*
				CONSTRUCTION MISSIONS
			*/
			case MISSION_TYPE.HELP_CONSTRUCT:
				md = engineering.createHelpConstructTask({missionType: missionType});		
				break;
			case MISSION_TYPE.CONSTRUCT_OIL_DERRICK:
				md = engineering.createBuildDerrickTask({missionType: missionType, buildTask: args[0], tickUID: args[1]});
				break;
			case MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE:
				md = engineering.createBuildBaseStructureTask({missionType: missionType, buildTask: args[0], tickUID: args[1]});		
				break;
			case MISSION_TYPE.CONSTRUCT_SINGLE_MODULE:
				md = engineering.createBuildSingleModuleTask({missionType: missionType, buildTask: args[0], tickUID: args[1]});
				break;
			case MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE:
				md = engineering.createBuildNearbyDefenceTask({missionType: missionType, buildTask: args[0], tickUID: args[1]});		
				break;
			case MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR:
				md = engineering.createBuildAllDerricksInSectorTask({missionType: missionType, buildTask: args[0], tickUID: args[1]});
				break;
			case MISSION_TYPE.CONSTRUCT_REPAIR_CENTER:
				md = engineering.createBuildRepairCenterTask({missionType: missionType, buildTask: args[0], tickUID: args[1]});		
				break;
			case MISSION_TYPE.DEMOLISH_REPAIR_CENTER:
				md = engineering.createDemolishRepairCenterTask({missionType: missionType, buildTask: args[0], tickUID: args[1]})		
				break;	
			default:	
				// Do nothing
		}

		// If valid mission, return missionData to higher level command, else, return undefined
		if (md == undefined) {
			return undefined;
		}
		
		// If mission is valid, mission data (md) is defined
		md.missionStatus = MISSION_STATUS.NOT_STARTED;
		md.priority = priority;	
		md.timeStarted = gameTime;
		return md;			
	}

	/**
	 * Sets the default behaviours of the bot for the specified `missionTypes`.
	 * @param {worldState} state 
	 */
	setDefaultMissions(state) {

		const md1 = this.createNewMission({missionType: MISSION_TYPE.VTOL_STAGING_MISSION, priority: MISSION_PRIORITY.LOW});		

		const md2 = this.createNewMission({missionType: MISSION_TYPE.HELP_CONSTRUCT, priority: MISSION_PRIORITY.LOW});
		
		const md3 = this.createNewMission({missionType: MISSION_TYPE.RETURN_FOR_REPAIR, priority: MISSION_PRIORITY.LOW});		

		state.activeMissions.push(md1, md2, md3);
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
			if (b.playerID == null) 	return;
			if (!livingPlayers.includes(b.playerID)) 	return;
			
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
	 * 	This function:
	 * 	1. Gets all droids & structures on the map (like taking a satellite image of the whole map).
	 * 	2. Classifies all droids & structures, writing a new `state.playerInfo` as well as `state.grid.grid`. 
	 * 	3. Updates spatial fields (calls `this.updateSpatialFields`).
	 *  IIFEs are used to allow the generated droid / structures arrays to go out of scope to be GCed. This is required for performance reasons.
	 * @param {worldState} state 
	 * @returns {void}
	 */
	updateCoreIntel(state) {

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
		const PLAYER_ID_LIST = generateRange(maxPlayers);       // will create 0-indexed playerIDs from 0, 1, 2, ..., maxPlayers - 1

		for (let playerID=0; playerID<PLAYER_ID_LIST.length; playerID++) {

			const p = createPlayerInfoEntry(playerID);

			const PLAYER_IS_ENEMY = !p['isFriendly'];
			const PLAYER_IS_ME = (playerID === me);

			((playerID) => {


			// const enumDroid2 = () => enumDroid(playerID);		// moved here for perf reasons, want these arrays to go out of frame (to be GCed asap)
   			// const droids = fprof(enumDroid2, `_${playerID}`);

			const droids = enumDroid(playerID);
			for (let j=0; j<droids.length; j++) {
				const obj = droids[j];

				const flags = classifyGameObject(obj);
				const x = obj.x;
				const y = obj.y;
				const gx = Math.floor(x / cellSize);
				const gy = Math.floor(y / cellSize);

				const fbObject = createFbObject(obj, flags, x, y);

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
			})(playerID);		

			((playerID) => {
    		// const enumStruct2 = () => enumStruct(playerID);
    		// const structs = fprof(enumStruct2, `_${playerID}`);

			const structs = enumStruct(playerID);
			for (let j=0; j<structs.length; j++) {
				const obj = structs[j];
				
				const flags = classifyGameObject(obj);
				const x = obj.x;
				const y = obj.y;
				const gx = Math.floor(x / cellSize);
				const gy = Math.floor(y / cellSize);

				const fbObject = createFbObject(obj, flags, x, y);
				
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
			})(playerID);	

			// this.#debugPrintPlayerInfo(p);
			state.playerInfo[playerID] = p;		
		}
	
		this.updateSpatialFields(state, TEMP_GRID);
		state.grid.lastUpdatedAt = gameTime;

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
	 * Records the direct fire targets a brigade selected, ranked best-first. Used for target persistence.
	 * Pass an empty list to `targets` to clear the brigade's current target list.
	 * @param {worldState} state 
	 * @param {number} brigadeID 
	 * @param {FbObject[]} targets 
	 * @returns {void}
	 */
	setBrigadeDirectFireTargets(state, brigadeID, targets) {
		state.brigades[brigadeID].currentDirectFireTargets = targets;
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
	 * Updates unit lists for each battalion in a brigade, and the brigade's overall strength.
	 * @param {worldState} state
	 * @param {number} brigadeID
     * @param {ProductionParameters} parameters
	 * @returns {void}
	 */
    updateBrigadeSupplyStatus(state, brigadeID, parameters) {
        
		const brigadeComposition = state.brigades[brigadeID]["composition"];
		const maxBrigadeComposition = parameters.BRIGADE_COMPOSITION;

		/** @type {Map<number, number>} */
        const maxUnitsByCategory = new Map([
            [DIVISION.INFANTRY_RESERVE, maxBrigadeComposition.MAX_INFANTRY],
            [DIVISION.HEAVY_CAV_RESERVE, maxBrigadeComposition.MAX_HEAVY_CAVALRY],
            [DIVISION.LIGHT_CAV_RESERVE, maxBrigadeComposition.MAX_LIGHT_CAVALRY],
            [DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, maxBrigadeComposition.MAX_MORTAR],
            [DIVISION.AIR_DEFENCE_RESERVE, maxBrigadeComposition.MAX_ADA],
            [DIVISION.SENSOR_RESERVE, maxBrigadeComposition.MAX_SENSOR],
            [DIVISION.MAINTENANCE_RESERVE, maxBrigadeComposition.MAX_REPAIR]
		]);

        const needsRepair = (unit, category, cyborgRepairThreshold, vehicleRepairThreshold) => {
            if (category === DIVISION.INFANTRY_RESERVE) {
                if (unit.health < cyborgRepairThreshold) {
                    return true;
                } else {
                    return false;
                }
            }
            if (unit.health < vehicleRepairThreshold) {
                return true;
            } else {
                return false;
            }
        };

        // This clears existing data from the previous run
        for (const [btnID, btnInfo] of brigadeComposition) {
            btnInfo["damagedUnitList"].length = 0;
            btnInfo["healthyUnitList"].length = 0;
        }

        // Reclassify as damaged / healthy
        const brigadeUnits = state.g.enumGroup(brigadeID);      
        brigadeUnits.forEach(unit => {
            const category = getDroidFbGroupClassification(unit);

            const currBattalion = brigadeComposition.get(category);
			if (currBattalion == null) {
				warn(`attempted to get non-existent category "${category}" in brigadeComposition.`);
				return;
			}
			
            if (needsRepair(unit, category, parameters.CYBORG_REPAIR_THRESHOLD, parameters.VEHICLE_REPAIR_THRESHOLD)) {
                currBattalion["damagedUnitList"].push(unit);
            } else {
                currBattalion["healthyUnitList"].push(unit);
            }
        });

        // Update the unit count + deficit
        for (const [category, battalionComposition] of brigadeComposition) {
            const maxUnitCount = maxUnitsByCategory.get(category);
			if (maxUnitCount == null) {
				warn(`attempted to get non-existent maxUnitCount for category "${category}".`);
				return;
			}

            const healthyUnitCount = battalionComposition["healthyUnitList"].length;
            battalionComposition["count"] = healthyUnitCount;
            battalionComposition["deficit"] = maxUnitCount - healthyUnitCount;
        };

        // Update brigade strength. This counts the same units that `getForceCenterLoc()` averages over
        // (all direct-fire units, healthy or damaged). Strength rises immediately with reinforcement but
        // decays gradually, so it does not jitter when single units die and are replaced.
        const directFireUnitCount = brigadeUnits.filter(unit => !unit.hasIndirect).length;
        const currBrigade = state.brigades[brigadeID];
        currBrigade["strength"] = Math.max(directFireUnitCount, currBrigade["strength"] - parameters.STRENGTH_DECAY_RATE);

        if (false) {
            debug(`${gameTime}: Brigade ${brigadeID} Composition`)
            for (const [btnID, btnInfo] of brigadeComposition) {
                debug(`\t - ${btnID}: ${btnInfo["count"]} healthy (- ${btnInfo["deficit"]}) ( - ${btnInfo["damagedUnitList"].length} damaged)`);
            }
        }
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
	 * @param {AirStrikeMissionRequestLazy[]} raidTargets 
	 * @param {AirStrikeMissionRequestLazy[]} productionTargets 
	 * @param {AirStrikeMissionRequestLazy[]} adaTargets 
	 * @param {AirStrikeMissionRequestLazy[]} indirectFireTargets 
	 * @param {AirStrikeMissionRequestLazy[]} defensiveStructureTargets 
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
     * Adds all newly manufactured droids into a FishBot reserve group (called by `eventDroidBuilt()`).
	 * @param {worldState} state
     * @param {DroidObject} droid 
     * @returns {number} new groupID
     */
    setNewDroidGroup(state, droid) {
		const groupID = getDroidFbGroupClassification(droid);
		state.g.addDroidToGroup({groupID: groupID, droidID: droid.id});
		return groupID;
	}

	/**
	 * Resets the FishBot group of a droid to the appropriate reserve groupID (used during unit repair).
	 * @param {worldState} state 
	 * @param {DroidObject} droid 
	 * @param {number} groupIdToRemove 
	 * @returns {void}
	 */
	resetDroidGroup(state, droid, groupIdToRemove) {
		state.g.removeDroidFromGroup({groupID: groupIdToRemove, droidID: droid.id});
		this.setNewDroidGroup(state, droid);
	}

	/**
	 * Assigns units to a brigade.
	 * @param {worldState} state 
	 * @param {DroidObject[]} reinforcements 
	 * @param {number} reserveID
	 * @param {number} brigadeID 
	 * @returns {void}
	 */
	assignUnitsToBrigade(state, reinforcements, reserveID, brigadeID) {
		
		reinforcements.forEach(droid => {
			state.g.removeDroidFromGroup({groupID: reserveID, droidID: droid.id});
			state.g.addDroidToGroup({groupID: brigadeID, droidID: droid.id});
		});
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @param {ProductionJob} newProductionJob
	 */
	addToActiveProductionJobs(state, newProductionJob) {
		state.activeProductionJobs.push(newProductionJob);
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @param {StructureObject} factory
	 * @param {number} groupID
	 */
	removeFromActiveProductionJobs(state, factory, groupID) {

		const activeProductionJobs = state.activeProductionJobs;
		const itemToRemove = `"${factory.id} | ${groupID}"`;

		for (let i=0; i<activeProductionJobs.length; i++) {
			const job = activeProductionJobs[i];

			if (factory.id !== job['factory'].id) 
				continue;

			if (groupID !== job['type']) 	
				continue;

			const [deleted] = state.activeProductionJobs.splice(i, 1);
			// debug(`\nRemoved ${deleted['factory'].id} | ${deleted['type']}`);
			return;
		}

		warn(`removeFromActiveProductionJobs() failed to remove: "${itemToRemove}". Ignoring.`)
	}
}