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
	 * @param {Array} aviationTargets 
	 * @param {number} minAircraft 
	 * @returns {void}
	 */
	assignAviationMissions(state, aviationTargets, minAircraft) {

		for (let i=0; i<aviationTargets.length; i++) {

			const newMissionRequest = aviationTargets[i];
			const NUM_UNITS = minAircraft;

			const missionType = newMissionRequest.missionType;
			const priority = newMissionRequest.priority;

			const missionData = this.createNewMission({missionType: missionType, priority: priority}, newMissionRequest, NUM_UNITS, i);
				
			if (defined(missionData)) {
				// debug(`Scheduled AIR_STRIKE (${missionType}) for:`, missionData.id, newMissionRequest.name, newMissionRequest.type, newMissionRequest.player, newMissionRequest.id);
				state.activeMissions.push(missionData);
			}
		}
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

	#printConstructionDebugOutput(task, missionID) {
		let sectorID = '', structureID = '';
		if (defined(task.payload)) {
			sectorID = `@ ${task.payload.id}`;
			structureID = `-- ${task.structureID}`
		}
		debug(`Scheduled BUILD (${task.missionType}) for: ${missionID} ${sectorID} ${structureID} ${sectorID}`);
	};

	/**
	 * 
	 * @param {worldState} state 
	 * @param {Array} buildTasks 
	 * @returns {void}
	 */
	assignConstructionTasks(state, buildTasks) {
		const PRIORITY = MISSION_PRIORITY.HIGH;

		buildTasks.forEach((task, i) => {	
			const missionData = this.createNewMission({missionType: task.missionType, priority: PRIORITY}, task, i);		
			if (defined(missionData)) {
				state.activeMissions.push(missionData);
				// this.#printConstructionDebugOutput(task, missionData.id);
			} 
		});
	}

	createNewMission({missionType, priority=MISSION_PRIORITY.LOW}, ...args) {
		// This function returns either:
		//	- missionID (can be searched with getMissionData(missionID)), if mission was created successfully
		//	- undefined, if mission was not created

		// Side effect: pushes any successful mission to the activeMissions queue

		let md = undefined; 	

		switch (missionType) {
			
			case MISSION_TYPE.ABORT_MISSION:
				// does nothing for now
				break;

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
				INTELLIGENCE MISSIONS
			*/


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
			default:	
				// Do nothing
		}

		if (defined(md)) {
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

	#filterField(numXCells, numYCells, heatmap) {
		const emptyCell = (...args) => {return 0;};
		let filteredGrid = create2DGrid(numXCells, numYCells, emptyCell);

		const KERNEL = [
			[0.25, 0.25, 0.25],
			[0.25, 1.0,  0.25],
			[0.25, 0.25, 0.25]
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

	
	updateSpatialFields(state, newGrid) {
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;
		const grid = state.grid.grid;

		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {
				state.fields['adaThreat'][gx][gy] = newGrid[gx][gy]['adaCount'];
				state.fields['enemyUnitThreat'][gx][gy] = newGrid[gx][gy]['enemyDirectFireUnitCount'];				
				state.fields['enemyStaticDefenceThreat'][gx][gy] = newGrid[gx][gy]['fixedDefenceCount'];
				state.fields['unclaimedDerricksInCell'][gx][gy] = grid[gx][gy]['derricks'].length - newGrid[gx][gy]['claimedDerricks'].length;

				let numFriendlyDerricks = 0, numEnemyDerricks = 0;
				newGrid[gx][gy]['claimedDerricks'].forEach(d => {
					if (isEnemy(d.playerID)) {
						numEnemyDerricks++;
					} else {
						numFriendlyDerricks++;
					}
				});

				const ts = newGrid[gx][gy]['targetStructures'].length - numEnemyDerricks - newGrid[gx][gy]['adaCount'];
				state.fields['controlStability'][gx][gy] = newGrid[gx][gy]['friendlyStructures'].length - (ts);				// todo remove friendly derricks once safe regions are set
			}	
		}	

		if (false) this.#debugPrintSpatialField(state.fields['adaThreat'], 'adaThreat - BEFORE FILTER');		
		state.fields['adaThreat'] = this.#filterField(numXCells, numYCells, state.fields['adaThreat']);
		if (false) this.#debugPrintSpatialField(state.fields['adaThreat'], 'adaThreat - AFTER FILTER');
		if (false) this.#debugPrintSpatialField(state.fields['enemyStaticDefenceThreat'], 'enemyStaticDefenceThreat');
		if (false) this.#debugPrintSpatialField(state.fields['enemyUnitThreat'], 'enemyUnitThreat');
		if (false) this.#debugPrintSpatialField(state.fields['unclaimedDerricksInCell'], 'unclaimedDerricksInCell');
		state.fields['controlStability'] = this.#filterField(numXCells, numYCells, state.fields['controlStability']);
		if (false) this.#debugPrintSpatialField(state.fields['controlStability'], 'controlStability');
	}

	/**
	 * This function writes the result of blanket `enumDroid` and `enumStruct` calls to `state`.
	 * @param {Object} state 
	 * @param {any[][]} newGrid 
	 * @param {Array} playerInfo 
	 * @param {Array} allTargets 
	 * @returns {void}
	 */
	setCoreIntelParameters(state, newGrid, playerInfo, allTargets) {
		// Write updated units to grid (only overwriting "KEYS" defined below)
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;

		state.playerInfo = playerInfo;
		state.allTargets = allTargets;

		// Update grid 
		// TODO: see if spatial fields should also be updated here for performance reasons
		const CATEGORIES = ['friendlyUnits', 'targetUnits', 'friendlyStructures', 'targetStructures'];
		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {

				CATEGORIES.forEach(category => {
					state.grid.grid[gx][gy][category] = newGrid[gx][gy][category];
				});

				// Then update derrick information
				const claimed = newGrid[gx][gy]['claimedDerricks'];
				let derricksInCell = state.grid.grid[gx][gy]['derricks'];
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
			debug(`\n${gameTime} allTargets`);
			state.allTargets.forEach(t => {
				debug(`\t${t.name}  ${t.id}  (player ${t.player})	(flags ${toBinary20(t.flags)})`);
			});
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
	 * This function writes `forceLocation` to `state`.
	 * @param {worldState} state
	 * @param {Object} forceLocation
	 * @returns {void}
	 */
	setForceLocation(state, forceLocation) {
		state.forceLocation = forceLocation;
	}

	/**
	 * This function writes `nearbyGroundTargets` to `state`.
	 * @param {worldState} state
	 * @param {Object} nearbyGroundTargets
	 * @returns {void}
	 */
	setNearbyGroundTargets(state, nearbyGroundTargets) {
		state.nearbyGroundTargets = nearbyGroundTargets;
	}

	/**
	 * This function writes `aviationTargets` to `state`.
	 * @param {worldState} state 
	 * @param {Object} raidTargets 
	 * @param {Object} productionTargets 
	 * @param {Object} adaTargets 
	 */
	setAviationTargets(state, raidTargets, productionTargets, adaTargets) {
		state.aviationTargets['raidTargets'] = raidTargets;
		state.aviationTargets['productionTargets'] = productionTargets;
		state.aviationTargets['adaTargets'] = adaTargets;
	}
}