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
		
		this.pendingIntelReports = [];
	}

	getCompletedIntelMissionReports() {
		return this.pendingIntelReports;
	}
	
	getActiveConstructionMissions(state) {
		const ACTIVE_MISSION_STATUSES = [MISSION_STATUS.IN_PROGRESS, MISSION_STATUS.NOT_STARTED];
		return state.activeMissions.filter(missionData => CONSTRUCTION_MISSION_TYPES.includes(missionData.missionType) && 
														 ACTIVE_MISSION_STATUSES.includes(missionData.missionStatus));
	}

	getActiveAviationMissions(state) {
		const ACTIVE_MISSION_STATUSES = [MISSION_STATUS.IN_PROGRESS, MISSION_STATUS.NOT_STARTED];
		return state.activeMissions.filter(missionData => AVIATION_MISSION_TYPES.includes (missionData.missionType) &&
										  ACTIVE_MISSION_STATUSES.includes(missionData.missionStatus));
	}

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

						// Handle other retval payload based on missionType
						if ([MISSION_TYPE.SECTOR_RECON_ENGINE].includes(md.missionType)) {
							// send intel to pending intel
							this.pendingIntelReports.push(retval.intelReport);
						}

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

	assignAviationMissions(state, newAviationTargets) {

		for (let i=0; i<newAviationTargets.length; i++) {
			// Determine mission type based on target properties

			// Meaningful parameters are stored in aviationTargets[i]; this function shouldn't make decisions
			// It is the responsibility of higher command to determine what missions are worth devoting more resources to i.e. the priority beforehand

			const newMissionRequest = newAviationTargets[i];

			const missionType = newMissionRequest.missionType;
			let NUM_UNITS = 2;
			if (missionType === MISSION_TYPE.AIR_RAID) {
				NUM_UNITS = 1;
			}		
			const priority = newMissionRequest.priority;

			const missionData = this.createNewMission({missionType: missionType, priority: priority}, newMissionRequest, NUM_UNITS, i);
				
			if (defined(missionData)) {
				// debug(`Scheduled AIR_STRIKE (${missionType}) for:`, missionData.id, newMissionRequest.name, newMissionRequest.type, newMissionRequest.player, newMissionRequest.id);
				state.activeMissions.push(missionData);
			}
		}
	}

	assignIntelMissions({intelTasks, state}) {

		// debug(`assignReconMissions(): reconTasks.length = ${reconTasks.length}`);
		for (let i=0; i<intelTasks.length; i++) {

			// This function just executes, it doesn't reason (e.g. it doesn't stop a new mission from being scheduled if there's already an active one)

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

	assignConstructionTasks({approvedTasks, state}) {
		// Application service: 
		let buildTasks = approvedTasks;

		// debug(`assignConstructionTasks(): buildTasks.length = ${buildTasks.length}`);

		for (let i=0; i<buildTasks.length; i++) {
			const buildTask = buildTasks[i];
		
			// Priority is hardcoded for now
			const missionData = this.createNewMission({missionType: buildTask.missionType, priority: MISSION_PRIORITY.HIGH}, buildTask, i);		
				
			if (defined(missionData)) {
				state.activeMissions.push(missionData);

				if (false) {
					let sectorID = undefined;
					if (defined(buildTask.payload)) {
						sectorID = buildTask.payload.id;
					}
					debug(`Scheduled BUILD (${buildTask.missionType}) for: ${missionData.id}, in Sect ${sectorID}`);
				}
			} 
		}
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
			case MISSION_TYPE.SECTOR_RECON_ENGINE:
				md = intelligence.createSectorReconEngineMission({sectorInfo: args[0], missionType: missionType, tickUID: args[1]});		
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

	compileSectorIntelIntoCOP(reports, state) {
        // Application service: compiles & saves available sector intelligence reports returned from 
        //  - getSectorIntelFromGameEngine()
        // into the main game state.

		for (let i=0; i<reports.length; i++) {
			const r = reports[i];

			// Process other check (example only)
			/*
			if (r['missionType'] === MISSION_TYPE.[INSERT_MISSION_HERE]]) {
				if (state.oilDominance !== r['report']) {
					debug(`oil dominance changed to ${r['report']} @ ${gameTime} ms`);
					state.oilDominance = r['report'];
				};
				continue;
			}
			*/

			// Else, assume it is SECTOR_RECON_ENGINE
			let currSectorReport = r['report'];

			// Find the sector
            const relevantSectorList = state.sectors.filter(sector => sector.id === currSectorReport.id);
            if (relevantSectorList.length !== 1) {
                debug(`WARNING -- toc/compileIntelIntoCOP(): sector with ID ${currSectorReport.id} returned ${relevantSectorList.length} results, !== 1`);
				continue;
            }
            let relevantSector = relevantSectorList[0];

            // Update sector information: 

			// TODO: update when there are base structures outside of the designated base area

            //      Part 1: Update nearbyBaseStructures
            if (defined(currSectorReport.base) && defined(relevantSector.base)) { 
                relevantSector.base.nearbyBaseStructures = currSectorReport.base.nearbyBaseStructures; 

				// Update alliance info in case alliances change mid-game
				if (isEnemy(relevantSector.base.playerID)) {
					relevantSector.base.isEnemy = true;
				} else {
					relevantSector.base.isEnemy = false;
				}
            }

			let friendlyBaseBuiltInSector = false, enemyBaseBuiltInSector = false;
			if (defined(relevantSector.base)) {
				// Update enemy state
				relevantSector.base.isEnemy = isEnemy(relevantSector.base.playerID);

				// Check if any base structures built nearby
				if (relevantSector.base.nearbyBaseStructures > 0) {
					if (relevantSector.base.isEnemy) { 
						enemyBaseBuiltInSector = true;
					} else {
						friendlyBaseBuiltInSector = true;
					}
				}
			}

            //      Part 2: Update derrick info
            if ((currSectorReport.derricks.length > 0 && 
                relevantSector.derricks.length === currSectorReport.derricks.length)) {
                for (let j=0; j<relevantSector.derricks.length; j++) {

                    // Important: assumes intel report was generated in the same order (intention is to avoid using ".find()" every cycle)
                    let derrick = relevantSector.derricks[j];
                    let derrickIntel = currSectorReport.derricks[j];

                    if (derrick.id !== derrickIntel.id) {
						debug(`toc/compileIntelIntoCOP(): derrickID does not match: ${derrick.id} !== ${derrickIntel.id}; nothing was written, continuing`);
                        continue;
					}

					// Else, update parameters
					derrick.isClaimed = derrickIntel.isClaimed;
					derrick.playerID = derrickIntel.playerID;

					derrick.friendlyDefenceCount = derrickIntel.friendlyDefenceCount;
					derrick.enemyDefenceCount = derrickIntel.enemyDefenceCount;	

					// Define owner, controlStability, threatLevel
					if (!defined(derrick.playerID)) {
						derrick.owner = REGION_OWNER.NEUTRAL;

						if (tileIsBurning(derrick.x, derrick.y)) {
							derrick.owner = REGION_OWNER.CONTESTED;
						}
					} else {
						if (!isEnemy(derrick.playerID)) {
							derrick.owner = REGION_OWNER.FRIENDLY;
						} else {
							if (derrick.enemyDefenceCount === 0) {
								derrick.owner = REGION_OWNER.CONTESTED;
							} else {
								derrick.owner = REGION_OWNER.ENEMY;
							}
						}
					}

					if (derrick.enemyDefenceCount === 0 && derrick.friendlyDefenceCount > 0 || friendlyBaseBuiltInSector) {
						derrick.threatLevel = REGION_THREAT_LEVEL.LOW;				
						derrick.controlStability = REGION_STABILITY.HIGH;			
					} else if (derrick.enemyDefenceCount > 0 && derrick.friendlyDefenceCount === 0 || enemyBaseBuiltInSector) {
						derrick.threatLevel = REGION_THREAT_LEVEL.HIGH;
						derrick.controlStability = REGION_STABILITY.HIGH;			
					} else if (derrick.enemyDefenceCount === 0 && derrick.friendlyDefenceCount === 0) {
						if (derrick.owner === REGION_OWNER.FRIENDLY) {
							derrick.threatLevel = REGION_THREAT_LEVEL.LOW;	
							derrick.controlStability = REGION_STABILITY.MEDIUM;	
						} else {
							derrick.threatLevel = REGION_THREAT_LEVEL.MEDIUM;	
							derrick.controlStability = REGION_STABILITY.MEDIUM;	
						}
					} else {
						derrick.threatLevel = REGION_THREAT_LEVEL.HIGH;
						derrick.controlStability = REGION_STABILITY.LOW;				
					}
                }   
            }

            //      Part 3: Update overall sector info (use doctrinal rules)
            relevantSector.friendlyDefenceCount = currSectorReport.friendlyDefenceCount;
            relevantSector.enemyDefenceCount = currSectorReport.enemyDefenceCount;

			// 		Part 4: Set region owner (TEMPORARY)
			if (relevantSector.enemyDefenceCount === 0 && relevantSector.friendlyDefenceCount > 0 || friendlyBaseBuiltInSector) {
				relevantSector.owner = REGION_OWNER.FRIENDLY;
			} else if (relevantSector.enemyDefenceCount > 0 && relevantSector.friendlyDefenceCount === 0 || enemyBaseBuiltInSector) {
				relevantSector.owner = REGION_OWNER.ENEMY;
			} else if (relevantSector.enemyDefenceCount > 0 && relevantSector.friendlyDefenceCount > 0) {
				relevantSector.owner = REGION_OWNER.CONTESTED;
			} else {
				// No defences nearby (either friendly or enemy)
				let friendlyOwnedDerrickCount = 0, enemyOwnedDerrickCount = 0, unclaimedDerrickCount = 0;

				// check how many derricks, and make decision based on that
				for (let d=0; d<relevantSector.derricks.length; d++) {
					if (relevantSector.derricks[d].owner === REGION_OWNER.FRIENDLY) {
						friendlyOwnedDerrickCount++;
					} else if (relevantSector.derricks[d].owner === REGION_OWNER.ENEMY) {
						enemyOwnedDerrickCount++;
					} else {
						unclaimedDerrickCount++;
					}
				}

				if (friendlyOwnedDerrickCount > enemyOwnedDerrickCount) {
					relevantSector.owner = REGION_OWNER.FRIENDLY;
				} else if (enemyOwnedDerrickCount > friendlyOwnedDerrickCount) {
					relevantSector.owner = REGION_OWNER.CONTESTED;
				} else if (enemyOwnedDerrickCount === 0 && friendlyOwnedDerrickCount === 0 && unclaimedDerrickCount > 0) {
					relevantSector.owner = REGION_OWNER.NEUTRAL;
				}
			}

			// 		Part 5: Set threat level & stability based on rules
			if (relevantSector.enemyDefenceCount === 0 && relevantSector.friendlyDefenceCount > 0 || friendlyBaseBuiltInSector) {
				relevantSector.threatLevel = REGION_THREAT_LEVEL.LOW;				
				relevantSector.controlStability = REGION_STABILITY.HIGH;			
			} else if (relevantSector.enemyDefenceCount > 0 && relevantSector.friendlyDefenceCount === 0 || enemyBaseBuiltInSector) {
				relevantSector.threatLevel = REGION_THREAT_LEVEL.HIGH;
				relevantSector.controlStability = REGION_STABILITY.HIGH;			
			} else if (relevantSector.enemyDefenceCount === 0 && relevantSector.friendlyDefenceCount === 0) {
				if (relevantSector.owner === REGION_OWNER.FRIENDLY) {
					relevantSector.threatLevel = REGION_THREAT_LEVEL.LOW;	
					relevantSector.controlStability = REGION_STABILITY.MEDIUM;	
				} else {
					relevantSector.threatLevel = REGION_THREAT_LEVEL.MEDIUM;	
					relevantSector.controlStability = REGION_STABILITY.MEDIUM;	
				}
			} else {
				relevantSector.threatLevel = REGION_THREAT_LEVEL.HIGH;
				relevantSector.controlStability = REGION_STABILITY.LOW;				
			}

		}

		// 		Part 6: Set threat level of all sectors + derricks next to living enemy bases
		const livingPlayers = enumLivingPlayers();

		for (let i=0; i<state.sectors.length; i++) {
			let currSector = state.sectors[i];
			if (defined(currSector.base)) {
				if (currSector.base.nearbyBaseStructures === 0) {
					continue;
				}

				if (!livingPlayers.includes(currSector.base.playerID)) {
					continue;
				}

				if (!currSector.base.isEnemy) {
					// Set sectors near alive, friendly bases to HIGH STABILITY
					for (let j=0; j<currSector.adjacentSectors.length; j++) {
						if(currSector.adjacentSectors[j].derricks.every(d => d.owner === REGION_OWNER.FRIENDLY)) {

							currSector.adjacentSectors[j].controlStability = REGION_STABILITY.HIGH;
							currSector.adjacentSectors[j].derricks.forEach(d => {{
								d.controlStability = REGION_STABILITY.HIGH;
								d.threatLevel = REGION_THREAT_LEVEL.LOW;
							}});

							// if (true) debug(`	Set ${currSector.adjacentSectors[j].id} to STABILITY -> HIGH`);
						}
					}
					
					continue;
				}

				// Else, set sectors near alive, enemy bases to HIGH THREAT & STABILITY if they have enemy derricks on them
				currSector.derricks.forEach(d => {
					d.threatLevel = REGION_THREAT_LEVEL.HIGH;
					d.controlStability = REGION_STABILITY.HIGH;
				});

				for (let j=0; j<currSector.adjacentSectors.length; j++) {

					const someDerricksCaptured = currSector.adjacentSectors[j].derricks.some(d => d.owner === REGION_OWNER.ENEMY || d.owner === REGION_OWNER.CONTESTED)
					if (someDerricksCaptured) {
						currSector.adjacentSectors[j].threatLevel = REGION_THREAT_LEVEL.HIGH;
						currSector.adjacentSectors[j].controlStability = REGION_STABILITY.HIGH;
						// if (true) debug(`	Set ${currSector.adjacentSectors[j].id} to THREAT -> HIGH`);

						currSector.adjacentSectors[j].derricks.forEach(d => {{
							if (d.owner === REGION_OWNER.ENEMY || d.owner === REGION_OWNER.CONTESTED) {
								d.controlStability = REGION_STABILITY.HIGH;
								d.threatLevel = REGION_THREAT_LEVEL.HIGH;
							}
						}});
					};
					// Else, they keep their normal threat level
				}
			}
		}

		// Print out sector info (debug only)
		if (false) {
			for (let i=0; i<state.sectors.length; i++) {
				let s = state.sectors[i];

				debug(`compileIntoCOP(): sector ${s.id}:`);
				debug(`	friendlystruct: ${s.friendlyDefenceCount}, enemystruct: ${s.enemyDefenceCount}`);
				if (defined(s.base)) {
					debug(`		base: ${s.base.id}, nearby structs: ${s.base.nearbyBaseStructures}`);
				}
				s.derricks.forEach(d => debug(`		derr: ${d.id}, claimed: ${d.isClaimed}, playerID: ${d.playerID}, friendlyDefences: ${d.friendlyDefenceCount}, enemyDefences: ${d.enemyDefenceCount}, owner: ${d.owner}, threatLevel: ${d.threatLevel}, stability: ${d.threatLevel}`));
				debug(`	sector threatLevel: ${s.threatLevel}, stability: ${s.controlStability}, owner: ${s.owner}`)
			}
		}

		// Delete all pending intel reports
		this.pendingIntelReports.length = 0;
	}

	updateHighRiskSectors(state) {
		const alivePlayers = enumLivingPlayers();

		let enemyBaseSectors = [];
		state.sectors.forEach(sector => {
			if (defined(sector.base)) {
				if (sector.base.isEnemy && alivePlayers.includes(sector.base.playerID)) {
					enemyBaseSectors.push(sector);
				}
			}
		});

		let adjSectors = [];
		enemyBaseSectors.forEach(s => 
			{adjSectors.push(...s.adjacentSectors.filter(sect => sect.threatLevel === REGION_THREAT_LEVEL.HIGH))}
		);
		adjSectors.push(...enemyBaseSectors);

		state.highRiskSectors = adjSectors;
	}

	#debugPrintSpatialField(heatmap, name) {
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;

		debug(`\nupdateSpatialFields(): ${name} @ ${gameTime}`);
		for (let gy=0; gy<numYCells; gy++) {
			let row = "";

			for (let gx=0; gx<numXCells; gx++) {					
				row += `${heatmap[gx][gy]} `;
			}
			debug(row);
		}
	}

	#filterHeatMap(state, heatmap) {
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;
		const emptyCell = () => {return 0;};
		let filteredGrid = create2DGrid(numXCells, numYCells, emptyCell);

		const KERNEL = [
			[0.25, 0.5, 0.25],
			[0.5,  1.0, 0.5 ],
			[0.25, 0.5, 0.25]
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
						// Influence is rounded to the nearest integer to make easier.
						const influence = Math.round(heatmap[gx][gy] * KERNEL[dy + YDEV][dx + XDEV]);		
						filteredGrid[gx+dx][gy+dy] = Math.max(influence, heatmap[gx+dx][gy+dy]);
					}
				}
			}
		}

		return filteredGrid;
	}

	updateSpatialFields(state, newGrid) {
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;
		const grid = newGrid;

		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {
				state.heatmaps['adaThreat'][gx][gy] = grid[gx][gy]['adaCount'];
				state.heatmaps['enemyStaticDefenceThreat'][gx][gy] = grid[gx][gy]['fixedDefenceCount'];
				state.heatmaps['enemyUnitThreat'][gx][gy] = grid[gx][gy]['targetUnits'].length;
			}	
		}	

		if (false) this.#debugPrintSpatialField(state.heatmaps['adaThreat'], 'adaThreat - BEFORE FILTER');		
		state.heatmaps['adaThreat'] = this.#filterHeatMap(state, state.heatmaps['adaThreat']);
		if (false) this.#debugPrintSpatialField(state.heatmaps['adaThreat'], 'adaThreat - AFTER FILTER');
		if (false) this.#debugPrintSpatialField(state.heatmaps['enemyStaticDefenceThreat'], 'enemyStaticDefenceThreat');
		if (false) this.#debugPrintSpatialField(state.heatmaps['enemyUnitThreat'], 'enemyUnitThreat');
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
	 */
	setForceLocation(state, forceLocation) {
		state.forceLocation = forceLocation;
	}

	/**
	 * This function writes `nearbyGroundTargets` to `state`.
	 */
	setNearbyGroundTargets(state, nearbyGroundTargets) {
		state.nearbyGroundTargets = nearbyGroundTargets;
	}

	/**
	 * This function writes `aviationTargets` to `state`.
	 */
	setAviationTargets(state, raidTargets, productionTargets, adaTargets) {
		state.aviationTargets['raidTargets'] = raidTargets;
		state.aviationTargets['productionTargets'] = productionTargets;
		state.aviationTargets['adaTargets'] = adaTargets;
	}
}