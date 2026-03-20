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
The functions in this class:
- Have the authority to write to the global state (typically delegated to `hq_toc.js`)
- Should make decisions on what course action to take, but should handle no direct execution (this should be delegated to other functions)
- Should be supported by proposals made by the staff functions hq_gX
 */
class CommandCenter {
	constructor() {

		this.toc = new TacticalOperationsCenter();

		this.campaignStatus = CAMPAIGN_STATUS.BUILDUP;	

		/*
			This constructor is intended to contain *all* FishBot parameters which change how it behaves.
		*/

		this.OIL_DOMINANCE_PERCENTAGE = 55;


		// Task scheduling parameters
		// Add regular, high priority, high computational load tasks to the start of the list.
		// The naming convention is important as this allows the handlers in _run.js to run the correct function.
		// e.g. label intelligence tasks with 'intel_'.
		this.REQUESTS_PER_MINUTE = {
			'combat_runC2': 60,
			'global_missionManager': 60,
			'runLogistics': 60,
			'intel_getNearbyGroundTargets': 30,
			'intel_updateSectorInfo': 30,
			'intel_updateCOP': 30,	
			'intel_getMapIntelligence': 15,
			'intel_checkCampaignStatus': 15,
			'intel_getAviationTargets': 6,
			'intel_checkOilDominance': 2,
		};

		this.INTELLIGENCE_SUBTASK_NAMES = [];

	}

	/////////////////////////////////////////////////// STATE INITIALISATION ///////////////////////////////////////////////////

	setDefaultSectorParameters(state) {
		// TODO: mutates the state. move to hq_toc

		// Service: run once - establishes default sector info based on real sector data

		// Simple heuristic rule to set initial threat level
		const RING_RADIUS = Math.floor(Math.min(mapWidth/3, mapHeight/3)); 	// this maps to the 3 different levels of threat & stability

		for (let i=0; i<state.sectors.length; i++) {

			const distanceToSector = distance(baseLocation, state.sectors[i]);	
			
			let threatLevel, controlStability;

			if (distanceToSector < RING_RADIUS) {
				// First ring
				threatLevel = REGION_THREAT_LEVEL.LOW;
				controlStability = REGION_STABILITY.HIGH;
			} else if (RING_RADIUS < distanceToSector && distanceToSector < 2*RING_RADIUS) {
				// Second ring
				threatLevel = REGION_THREAT_LEVEL.MEDIUM;
				controlStability = REGION_STABILITY.MEDIUM;
			} else {
				// Third ring
				threatLevel = REGION_THREAT_LEVEL.HIGH;
				controlStability = REGION_STABILITY.LOW;			
			}
			
			state.sectors[i].threatLevel = threatLevel;
			state.sectors[i].controlStability = controlStability;
		}

		if (false) {
			(`establishSituation(): sector info`)
			state.sectors.forEach(s => {
				debug(`	threat: ${s.id}, ${s.threatLevel}, ${s.controlStability}`);
			});
		}
	}

	setDefaultMissions(state) {
		// TODO: mutates the state. move to hq_toc

		// Aviation - rearming
		const md1 = this.toc.createNewMission({missionType: MISSION_TYPE.VTOL_STAGING_MISSION, priority: MISSION_PRIORITY.LOW});		

		// Construction - helping construct around base
		const md2 = this.toc.createNewMission({missionType: MISSION_TYPE.HELP_CONSTRUCT, priority: MISSION_PRIORITY.LOW});

		state.activeMissions.push(md1, md2);
	}

	setSchedulerParameters(state) {
		// TODO: mutates the state. move to hq_toc

		const SHOW_SCHEDULER_PARAMS = false;
		const INTERVALS_PER_MIN = state.INTERVALS_PER_MIN;

		const r = generateRange(INTERVALS_PER_MIN);		
		let usedTimeBlocks = [];

		let taskID = 1;

		for (const [task, requestsPerMin] of Object.entries(this.REQUESTS_PER_MINUTE)) {

			// Classify
			if (task.includes("intel_")) {
				this.INTELLIGENCE_SUBTASK_NAMES.push(task);
			}

			// Initialise the schedule; a multiplicative-hash-function is used to produce a 'random' phase offset
			state.WORKER_IDS[task] = [];		// make a new list

			let u = [];		// debugging	

			const requestInterval = Math.floor(INTERVALS_PER_MIN / requestsPerMin);

			const taskHash = taskID * 2654435761;
			taskID++;

			// Creating long arrays of 'true' & 'false' in memory allows for simple lookup using the time index, 
			// instead of using .includes() in final application in _run.js (more computationally efficient)
			for (let i=0; i<r.length; i++) {
				const hash = taskHash + r[i] * 1013904223;

				if (hash % requestInterval !== 0) {
					state.WORKER_IDS[task].push(false);			
				} else {
					state.WORKER_IDS[task].push(true);
					usedTimeBlocks.push(i);		// for debugging
					u.push(i);
				}
			}

			if (SHOW_SCHEDULER_PARAMS) {
				u.sort((a,b) => a - b);
				debug(`"${task}" used timeslots: ${u}`);
			}
			
		}

		if (SHOW_SCHEDULER_PARAMS) {
			usedTimeBlocks.sort((a,b) => a - b);
			debug(`used timeslots: ${usedTimeBlocks}`);
		}
	}

	/////////////////////////////////////////////////// "CAMPAIGN STATUS" ///////////////////////////////////////////////////
	#getCampaignStatus() {
		return this.campaignStatus;
	}

	#updateCampaignStatus(event) {
		const currState = this.#getCampaignStatus();

		// Advance the state machine on 'event'
		let nextState = undefined;
		if(defined(campaignTransitions[event])) {
			nextState = campaignTransitions[event][currState];
		}

		if (defined(nextState)) {
			// debug(`Advanced to next campaign state ${nextState}`);
			this.campaignStatus = nextState;
		} 
	}

	checkCampaignStatus(state) {
		// Note: this modifies 'campaignStatus' directly -> to be integrated into 'state'

		// ADVANCE CAMPAIGN BASED ON GAME STATE -- TEMPORARY IMPLEMENTATION
		let event = undefined;

		const status = groundForces.getGroundForceStatus(state);
		if (status['completedInitialBuildup']) {
			event = 'CompletedBuildup';
		}
		if (status['completedFinalBuildup']) {
			event = 'CompletedStaging';
		}

		if (defined(event)) {
			const currCampaignStatus = this.#getCampaignStatus();
			this.#updateCampaignStatus(event);
			const newCampaignStatus = this.#getCampaignStatus();
			if (newCampaignStatus !== currCampaignStatus) {
				debug(`Campaign event detected: ${event}, campaign status updated to: ${this.#getCampaignStatus()}`);
			}	
		}
	}

	/////////////////////////////////////////////////// COMBAT OPERATIONS ///////////////////////////////////////////////////
	prioritiseLandForceTargets(targetInfo, groupPosition) {

		let output = {
			"directFireTarget": undefined, 
			"fireSupportTarget": undefined,
			"adaTarget": undefined, 
			"casTargets": undefined,
			"targetsInImmediateRadius": 0
		};

		/*
			targetInfo in this format:
 			info = {
				'enemyArmor': [], 
				'enemyInfantry': [], 
				'enemyIndirectFire': [], 
				'enemyADA': [], 
				'enemyAviation': [], 
				'enemyConstructor': [], 
				'enemyIndustrial': [], 
				'enemyUtility': [], 
				'enemyDefenses': [],
				'closestObject': undefined,
				'targetsInImmediateRadius': 0
			};		
		*/

		if (!defined(targetInfo["closestObject"]) || !defined(groupPosition)) {
			// Then the target-generating function immediately returned as there were no inputs
			return output;
		}

		// DIRECT FIRE TARGETS
		const c = targetInfo["closestObject"];
		if (defined(getObject(c.type, c.player, c.id))) {
			output["directFireTarget"] = targetInfo["closestObject"];
		}
		
		if (!defined(output["directFireTarget"])) {
			// This is a fallback to handle stale inputs
			for (let i=0; i<targetInfo["closestObjects"].length; i++) {
				const t = targetInfo["closestObjects"][i];
				const obj = getObject(t.type, t.player, t.id);
				if (defined(obj)) {
					output["directFireTarget"] = t;
					// debug(`fallback directFireTarget used @ ${gameTime} ms`);
					break;
				}
			}
		}

		// CAS
		output["casTargets"] = [...targetInfo["enemyIndirectFire"], ...targetInfo["enemyADA"], ...targetInfo["enemyArmor"]];

		// FIRE SUPPORT
		const EFFECTIVE_SQ_FS_RADIUS = 12 ** 2;
		const infantryTargets = targetInfo["enemyInfantry"];
		if (infantryTargets.length > 0) {
			let closestIdx = 0;
			let closestCyborg = undefined;
			let closestDistSq = 0;

			for (let i=0; i<infantryTargets.length; i++) {
				const currCyborg = getObject(infantryTargets[i].type, infantryTargets[i].player, infantryTargets[i].id);

				if (!defined(currCyborg)) {
					continue;
				}

				if (!defined(closestCyborg)) {
					closestCyborg = currCyborg;
					closestDistSq = distSq(closestCyborg.x, groupPosition.x, closestCyborg.y, groupPosition.y);
					continue;
				}

				const currDistSq = distSq(currCyborg.x, groupPosition.x, currCyborg.y, groupPosition.y);
				if (currDistSq < closestDistSq) {
					closestDistSq = currDistSq;
					closestIdx = i;
				}
			}

			if (closestDistSq < EFFECTIVE_SQ_FS_RADIUS) {
				output["fireSupportTarget"] = infantryTargets[closestIdx];
			}
		}

		if (!defined(output["fireSupportTarget"])) {
			let backupFsTargets = [...targetInfo["enemyADA"], ...targetInfo["enemyIndirectFire"], ...targetInfo["enemyIndustrial"], ...targetInfo["enemyDefenses"]];
			if (backupFsTargets.length > 0) {

				backupFsTargets = backupFsTargets.filter(t => {
					const o = getObject(t.type, t.player, t.id);
					if (!defined(o)) {
						return false;
					}

					if (distSq(o.x, groupPosition.x, o.y, groupPosition.y) < EFFECTIVE_SQ_FS_RADIUS) {
						return true;
					} else {
						return false;
					}
				});

				output["fireSupportTarget"] = backupFsTargets[0];		// no sorting, maybe should refactor to sort in order of distance (think it doesn't matter though)
			}
		}

		if (!defined(output["fireSupportTarget"]) && defined(output["directFireTarget"])) {
			output["fireSupportTarget"] = output["directFireTarget"];
		}

		// ADA (Air Defense Artillery)
		let adaTargets = targetInfo["enemyAviation"];

		if (adaTargets.length > 0) {
			let lowestHealthIdx = undefined;
			let lowestHealth = undefined;

			for (let i=0; i<adaTargets.length; i++) {
				const t = adaTargets[i];
				const v = getObject(t.type, t.player, t.id);
				if (!defined(v)) {
					continue;
				}

				if (distSq(v.x, groupPosition.x, v.y, groupPosition.y) > EFFECTIVE_SQ_FS_RADIUS) {		// uses the same FS RADIUS as fireSupport
					continue;
				}

				if (!defined(lowestHealthIdx)) {
					lowestHealthIdx = i;
					lowestHealth = v.health;
				} else {
					if (v.health < lowestHealth) {
						lowestHealthIdx = i;
						lowestHealth = v.health;
					}
				}
			}

			if (defined(lowestHealthIdx)) {
				output["adaTarget"] = adaTargets[lowestHealthIdx];
			}
		}		
		
		if (!defined(output["directFireTarget"]) && adaTargets.length > 0) {
			// handle the case where there are only a few remaining enemy VTOLs & all other land units are dead
			output["directFireTarget"] = adaTargets[0];
		}

		output["targetsInImmediateRadius"] = targetInfo["targetsInImmediateRadius"];

		return output;
	}

	#extractAdaThreatMap(state, threshold){ 
		const heatmap = state.fields.adaThreat;
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;	

		const gridCoord = (gx, gy) => {return {'gx': gx, 'gy': gy}};

		let adaCells = [];

		const PRINT_HEATMAP = false;
		
		if (PRINT_HEATMAP) debug(`\processAdaHeatmap(): ada heatmap @ ${gameTime}`);
		for (let gy=0; gy<numYCells; gy++) {
			let row = "";
			for (let gx=0; gx<numXCells; gx++) {

				// The following line determines the 'pain threshold' of the air force (0 = will be super safe)
				if (heatmap[gx][gy] > threshold) {
					adaCells.push(gridCoord(gx, gy));
				}
				if (PRINT_HEATMAP) row += `${heatmap[gx][gy]} `;
			}
			if (PRINT_HEATMAP) debug(row);
		}
	
		return adaCells;
	}

	prioritiseAviationTargets(state, groupPosition, nearbyTargetCount, airRaidTargets, casTargets, industrialTargets, adaTargets) {
		const cellSize = state.grid.cellSize;
		const IS_OIL_DOMINANT = state.oilDominance;
		const NUM_AIRCRAFT = state.playerInfo[me].numAirUnits;		// TODO: formalise if this is an expected access pattern
		const AIR_UNIT_DOMINANCE = NUM_AIRCRAFT >= 10;
		const AIR_UNIT_SHORTAGE = NUM_AIRCRAFT <= 6;

		let targetCandidates = [];

		if (!defined(airRaidTargets)) {
			airRaidTargets = [];
		}

		// TEMPORARY IMPLEMENTATION
		const prioritiseCasTargets = (nearbyTargetCount >= 2 && !IS_OIL_DOMINANT) || (IS_OIL_DOMINANT && casTargets.length >= 4);
		const prioritiseRaidTargets = !IS_OIL_DOMINANT;
		const prioritiseIndustrialTargets = IS_OIL_DOMINANT;
		const CLOSING_ANTI_AIR_MISSIONS = prioritiseIndustrialTargets && AIR_UNIT_DOMINANCE;

		// Set no-fly regions
		let threatThreshold = 0;
		if (AIR_UNIT_DOMINANCE) {
			threatThreshold = 1;
		}
		const NO_FLY_ZONES = this.#extractAdaThreatMap(state, threatThreshold);		

		// Set priority of new missions (needs rework, don't know all the edge cases)
		let highestNewTargetPriority = MISSION_PRIORITY.LOW;
		casTargets.forEach(t => {
			if (prioritiseCasTargets && casTargets.length > 0) {
				highestNewTargetPriority = MISSION_PRIORITY.URGENT;
				t.priority = highestNewTargetPriority;
			}
			t.missionType = MISSION_TYPE.CAS_STRIKE;
		});

		airRaidTargets.forEach(t => {
			if (prioritiseRaidTargets && airRaidTargets.length > 0) {
				highestNewTargetPriority = MISSION_PRIORITY.HIGH;
				t.priority = highestNewTargetPriority;
			}
			t.missionType = MISSION_TYPE.AIR_RAID;
		});
		
		industrialTargets.forEach(t => {
			if (prioritiseIndustrialTargets && industrialTargets.length > 0) {
				highestNewTargetPriority = MISSION_PRIORITY.MEDIUM;
				t.priority = highestNewTargetPriority;
			}
			t.missionType = MISSION_TYPE.DAS_STRIKE;
		});
		adaTargets.forEach(t => {
			if (prioritiseIndustrialTargets && adaTargets.length > 0) {
				highestNewTargetPriority = MISSION_PRIORITY.VERY_HIGH;
				t.priority = highestNewTargetPriority;
			}
			t.missionType = MISSION_TYPE.DAS_STRIKE;
		});

		if (prioritiseCasTargets) {
			targetCandidates = [...casTargets, ...airRaidTargets];
		} else if (prioritiseRaidTargets) {
			targetCandidates = [...airRaidTargets, ...casTargets];
		} else {
			// assuming industrial targets are prioritised
			if (CLOSING_ANTI_AIR_MISSIONS) {
				targetCandidates = [...adaTargets, ...industrialTargets, ...casTargets, ...airRaidTargets];
			} else {
				targetCandidates = [...industrialTargets, ...casTargets, ...airRaidTargets, ...adaTargets];			
			}
		}

		// Terminate current missions which are TWO PRIORITY LEVELS below e.g.
		// If new URGENT task -> cancel HIGH missions 
		const OFFENSIVE_MISSION_TYPES = [MISSION_TYPE.CAS_STRIKE, MISSION_TYPE.AIR_RAID, MISSION_TYPE.DAS_STRIKE];
		let activeMissions = this.toc.getActiveAviationMissions(state).
										filter(m => OFFENSIVE_MISSION_TYPES.includes(m.missionType));

		let activeTargetIDs = [];
		const CAS_RADIUS = 15;

		for (let i=0; i<activeMissions.length; i++) {
			let c = activeMissions[i];
			activeTargetIDs.push(c.id);

			if (c.priority <= highestNewTargetPriority - 2) {
				// debug(`aborted ${c.missionType}: ${c.target.name} @ ${gameTime}, higher priorities`);
				c.missionStatus = MISSION_STATUS.ABORT;
				continue;
			}
			
			const currObj = getObject(c.target.type, c.target.player, c.target.id);
			if (!defined(currObj) || !defined(groupPosition)) {
				continue;
			}

			if (c.missionType === MISSION_TYPE.CAS_STRIKE) {
				if (distSq(currObj.x, groupPosition.x, currObj.y, groupPosition.y) >= CAS_RADIUS ** 2) {
					// debug(`aborted CAS_STRIKE: ${c.target.name} @ ${gameTime}, too far away`);
					c.missionStatus = MISSION_STATUS.ABORT;					
					continue;
				}
			}

			if (!CLOSING_ANTI_AIR_MISSIONS) {
				const gx = Math.floor(currObj.x / cellSize), gy = Math.floor(currObj.y / cellSize);
				let skipIfDangerous = false;

				for (let j=0; j<NO_FLY_ZONES.length; j++) {
					if (gx === NO_FLY_ZONES[j].gx && gy === NO_FLY_ZONES[j].gy) {
						skipIfDangerous = true;
						// debug(`	removed active ${currObj.name} (${c.missionType}) @ grid (${currObj.x} ${currObj.y})`);
						break;
					}
				}

				if (skipIfDangerous) {
					c.missionStatus = MISSION_STATUS.ABORT;		
					continue;
				}
			}
		}
		
		// Remove already active missions (inefficient, loops through the list again)
		// Also handles stale inputs, to be integrated with another part of the code later
		let newAviationTargets = [], existingAviationTargets = [], unsortedTargets = [];

		for (let i=0; i<targetCandidates.length; i++) {
			const c = getObject(targetCandidates[i].type, targetCandidates[i].player, targetCandidates[i].id);
			if (!defined(c)) {
				continue;
			}

			// Depending on state, removes dangerous missions
			if (!CLOSING_ANTI_AIR_MISSIONS) {
				const gx = Math.floor(c.x / cellSize), gy = Math.floor(c.y / cellSize);
				let skipIfDangerous = false;

				for (let j=0; j<NO_FLY_ZONES.length; j++) {
					if (gx === NO_FLY_ZONES[j].gx && gy === NO_FLY_ZONES[j].gy) {
						skipIfDangerous = true;
						// debug(`	removed ${c.name} @ grid (${gx} ${gy})`);
						break;
					}
				}

				if (skipIfDangerous) {
					continue;
				}
			}

			unsortedTargets.push(targetCandidates[i]);

			if (!activeTargetIDs.includes(targetCandidates[i].id)) {
				newAviationTargets.push(targetCandidates[i]);
			} else {
				existingAviationTargets.push(targetCandidates[i]);
			}
		}

		let prioritisedTargets = {
			'aviationTargets': undefined,
			'minAircraft': 0
		};

		if (prioritiseIndustrialTargets) {		
			if (CLOSING_ANTI_AIR_MISSIONS) {
				// want simultaneous strikes on target
				prioritisedTargets['aviationTargets'] = [...newAviationTargets, ...existingAviationTargets];	
				prioritisedTargets['minAircraft'] = 3;			
			} else {
				// regular industrial strikes; priority is sequential destruction
				prioritisedTargets['aviationTargets'] = unsortedTargets;
				prioritisedTargets['minAircraft'] = 2;
			}
		} else {
			prioritisedTargets['aviationTargets'] = [...newAviationTargets, ...existingAviationTargets];
			if (AIR_UNIT_SHORTAGE) {
				prioritisedTargets['minAircraft'] = 1;
			} else {
				prioritisedTargets['minAircraft'] = 2;
			}
		}

		return prioritisedTargets;
	}

	runCombatOperations(state) {

		const nearbyGroundTargets = state.nearbyGroundTargets;
		const forceLocation = state.forceLocation;
		const raidTargets = state.aviationTargets['raidTargets'];
		const productionTargets = state.aviationTargets['productionTargets'];
		const adaTargets = state.aviationTargets['adaTargets'];

		const campaignStatus = this.#getCampaignStatus();
		const readyToAttack = campaignStatus === CAMPAIGN_STATUS.MAIN_ASSAULT || campaignStatus === CAMPAIGN_STATUS.STAGING;

		let casTargets = [];
		let numTargetsInImmediateRadius = 0;

		if (readyToAttack) {
			// Prioritise & assign targets
			const groundTargets = this.prioritiseLandForceTargets(nearbyGroundTargets, forceLocation);

			// Attack ground targets; HACK: directly calls tactical level function
			groundForceAttack({
				"state": state, 
				"directFireTarget": groundTargets["directFireTarget"], 
				"fireSupportTarget": groundTargets["fireSupportTarget"],
				"adaTarget": groundTargets["adaTarget"]
			});

			// Extract further information for aviation missions
			if (defined(groundTargets["casTargets"])) {
				casTargets.push(...groundTargets["casTargets"]);
			}
			numTargetsInImmediateRadius = groundTargets["targetsInImmediateRadius"];
		}

		const t = this.prioritiseAviationTargets(state, 
			forceLocation, 
			numTargetsInImmediateRadius, 
			raidTargets, 
			casTargets, 
			productionTargets,
			adaTargets,
		);

		this.toc.assignAviationMissions(state, t['aviationTargets'], t['minAircraft']);					
	}

	/////////////////////////////////////////////////// INTELLIGENCE ///////////////////////////////////////////////////

	/**
	 * 	For performance reasons, this function was changed from linear to distributed.
	 * 	The intent is:
	 * 	1. Intelligence mission is scheduled
	 * 	2. Intelligence mission is executed by the global mission manager / internally
	 * 	3. Observations are compiled into the global 'state'
	 */
	runIntelligence(state, taskID) {
		
		// Note: For performance reasons, anything which can be executed immediately should not use the mission management system.

		switch(taskID) {
			case 'intel_updateSectorInfo':

				let sectorUpdateTasks = [];
				state.sectors.forEach(s => sectorUpdateTasks.push(intelligence.createIntelRequest({missionType: MISSION_TYPE.SECTOR_RECON_ENGINE, payload: s})));
				this.toc.assignIntelMissions({intelTasks: sectorUpdateTasks, state: state});	// hq/toc: this translates orders (previous step) into missions	
				break;

			case 'intel_updateCOP':

				const observations = this.toc.getCompletedIntelMissionReports();				// hq/toc: gets completed data (intelligence reports)
				this.toc.compileSectorIntelIntoCOP(observations, state);						// hq/toc: processes intelligence reports & updates state ("Common Operational Picture")
				this.toc.updateHighRiskSectors(state);											// hq/toc: separated state update function
				break;

			case 'intel_checkOilDominance':
				const isOilDominant = checkOilDominance(state, this.OIL_DOMINANCE_PERCENTAGE);
				this.toc.setOilDominanceStatus(state, isOilDominant);
				break;
			
			case 'intel_getNearbyGroundTargets':

				// Update location(s) & composition(s) of active combat force(s) -- TEMPORARY IMPLEMENTATION
				const mainForceLocation = groundForces.getForceMedianLocation(0);
				this.toc.setForceLocation(state, mainForceLocation);

				if (defined(state.forceLocation)) {
					const nearbyGroundTargets = intelligence.proposeTargetsInRadius2({state: state, loc: state.forceLocation, searchRadius: 25, immediateRadius: 10});		
					hq.toc.setNearbyGroundTargets(state, nearbyGroundTargets);
				}
				break;
			
			case 'intel_checkCampaignStatus':

				this.checkCampaignStatus(state);
				break;

			case 'intel_getAviationTargets':

				const raidTargets = intelligence.getDefencesNearDerricks(state);
				const baseTargets = intelligence.getBaseTargets(state);
				hq.toc.setAviationTargets(state, raidTargets, baseTargets['productionTargets'], baseTargets['adaTargets']);

				break;

			case 'intel_getMapIntelligence':

				const objectData = intelligence.getAllObjects(state);
				this.toc.setCoreIntelParameters(state, objectData['grid'], objectData['playerInfo'], objectData['allTargets']);
				this.toc.updateSpatialFields(state, objectData['grid']);
				break;
				
			default:
				debug(`	WARNING	runIntelligence(): could not understand ${taskID} @ ${gameTime}`);
				return;
		}

		if (false) debug(`${gameTime}:		${taskID}`);
	
	}

	/////////////////////////////////////////////////// CONSTRUCTION ///////////////////////////////////////////////////

	/**
	 * Approves requested tasks based on game state & generates approved buildTasks for TOC execution 
	 */
	prioritiseConstructionTasks(requestedSectorOilCapTasks, requestedBaseBuildTasks, requestedSectorDefenceBuildTasks, sectorIndirectFireBuildTasks, state) {

		const truckData = engineering.getTruckAvailability();
		// No tasks if no trucks available
		if (truckData.numAvailable === 0 || truckData.numTotal === 0) {
			// numTotal will eventually be used to trigger production
			return [];
		}

		const activeConstructionMissions = this.toc.getActiveConstructionMissions(state);

		/////// OIL CAPTURE ///////

		// Oil capture -> filter out sectors already in progress
		let activeOilCapTasks = [];
		const TYPES_OF_DERRICK_CAPTURE_MISSIONS = [
			MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR, 
			MISSION_TYPE.CONSTRUCT_OIL_DERRICK
		];

		activeConstructionMissions.forEach(missionData => {
			if (TYPES_OF_DERRICK_CAPTURE_MISSIONS.includes(missionData.missionType)) {
				activeOilCapTasks.push(missionData.sectorID);	
			}
		});
		if (false) {
			debug(`issueConstructionTasking(): activeOilCapSectors: `);
			activeOilCapTasks.forEach(s => debug(`	sector id ${s}`));
		}

		// let approvedSectorOilCapTasks = requestedSectorOilCapTasks.filter(task => !activeOilCapSectors.includes(task.payload.id));
		let approvedSectorOilCapTasks = [];
		for (let i=0; i<requestedSectorOilCapTasks.length; i++) {
			const curr = requestedSectorOilCapTasks[i];
			if (activeOilCapTasks.includes(curr.payload.id)) {
				// payload = sector for requestedSectorOilCapTasks
				if (false) debug(`	- skipping Sector ${curr.payload.id}`);
				continue;
			} else {
				approvedSectorOilCapTasks.push(curr);
			}		
		}

		/////// BASE BUILD ///////
		const BASE_BUILD_MISSION_TYPES = [MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE, MISSION_TYPE.CONSTRUCT_SINGLE_MODULE];
		let activeBaseBuildTasks = [];
		activeConstructionMissions.forEach(missionData => {
			if (BASE_BUILD_MISSION_TYPES.includes(missionData.missionType)) {
				activeBaseBuildTasks.push(missionData);	
			}
		});

		/////// GENERATE BASE BUILD + OIL CAPTURE TASKS ///////
		let approvedConstructionTasks = [];

		if (activeBaseBuildTasks.length === 0) {
			approvedConstructionTasks.push(...requestedBaseBuildTasks.slice(0, 1));
			return approvedConstructionTasks;
		}

		approvedConstructionTasks.push(...approvedSectorOilCapTasks);
		if (approvedSectorOilCapTasks.length >= 2) {
			return approvedConstructionTasks;
		}

		/////// DERRICK DEFENCE CONSTRUCTION ///////
		let activeFortificationSectors = [];
		activeConstructionMissions.forEach(missionData => {
			if (missionData.missionType === MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE) {
				activeFortificationSectors.push(missionData.sectorID);	
			}
		});

		let approvedSectorDefenceTasks = [];
		for (let i=0; i<requestedSectorDefenceBuildTasks.length; i++) {
			const currTask = requestedSectorDefenceBuildTasks[i];
			const currSector = currTask.payload;
			if (activeFortificationSectors.includes(currSector.id)) {
				// debug(`	issueConstructiontasking: skipped sector ${currSector.id}`);
				continue;
			}
			approvedSectorDefenceTasks.push(currTask);
		}

		const MAX_CONCURRENT_FORTIFICATION_TASKS = 2;
		// debug(`activeFortificationSectors.length ${activeFortificationSectors.length}, approvedSectorDefenceTasks.length ${approvedSectorDefenceTasks.length}`);
		if (activeFortificationSectors.length < MAX_CONCURRENT_FORTIFICATION_TASKS) {
			approvedConstructionTasks.push(...approvedSectorDefenceTasks.slice(0, MAX_CONCURRENT_FORTIFICATION_TASKS - activeFortificationSectors.length));
		}
		
		if (approvedSectorDefenceTasks.length > 0) {
			return approvedConstructionTasks;
		}


		/////// FORWARD STRUCTURE CONSTRUCTION ///////
		// sectorIndirectFireBuildTasks.forEach(l => debug(`requesting building mortar / sensor around ${l.payload.x}, ${l.payload.y}`));
		// approvedConstructionTasks.push(...sectorIndirectFireBuildTasks.slice(0, 2));
		
		return approvedConstructionTasks;
	}

	prioritiseOilCapTasks(state) {
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

		let existingQueuedDerrickIDs = [];
		const TYPES_OF_DERRICK_CAPTURE_MISSIONS = [MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR, MISSION_TYPE.CONSTRUCT_OIL_DERRICK];

		this.toc.getActiveConstructionMissions(state).forEach(missionData => {
			if (TYPES_OF_DERRICK_CAPTURE_MISSIONS.includes(missionData.missionType)) {
				existingQueuedDerrickIDs.push(missionData.sectorID);			// TODO: to be changed for derrickID once old sector system is migrated	
			}
		});

		const DEBUG_ON = false;
		let debugGrid = create2DGrid(numXCells, numYCells, (...args) => {return "_";});
		let valid = [];

		// Iterate through the grid, find & remember valid cells
		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {

				// Filter out invalid / bad entries
				if (unclaimedDerricksInCell[gx][gy] === 0) continue;
				if (enemyStaticDefenceThreat[gx][gy] > 0) continue;			// Simplistic; static defence threat should be filtered before use
				if (enemyUnitThreat[gx][gy] > 0) continue;

				const derricksInCell = grid[gx][gy].derricks;
				for (let i=0; i<derricksInCell.length; i++) {
					const d = derricksInCell[i];
					if (existingQueuedDerrickIDs.indexOf(d.id) !== -1) continue; 	// === found an existing mission 

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
	
	abortDangerousConstructionTasks2(state) {
		const cellSize = state.grid.cellSize;

		const enemyStaticDefenceThreat = state.fields.enemyStaticDefenceThreat;
		const enemyUnitThreat = state.fields.enemyUnitThreat;

		const REMOTE_MISSION_TYPES = [
			MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR, 
			MISSION_TYPE.CONSTRUCT_OIL_DERRICK,
			MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE,
		];
		let activeRemoteMissions = this.toc.getActiveConstructionMissions(state).filter(
			md => REMOTE_MISSION_TYPES.includes(md.missionType)
		);

		// New mission planning system has implemented .gx, .gy grid references for all missions
		// This allows the following algorithm:
		// 	1. Check threat @ grid ref
		//	2. Check truck distances to grid ref 
		//	3. Cancel mission
		activeRemoteMissions.forEach(md => {
			// Check static defence & unit threat at grid ref
			if (enemyStaticDefenceThreat[md.gx][md.gy] === 0 && enemyUnitThreat[md.gx][md.gy] === 0) {
				return;
			}
			
			// Check truck locations relative to grid ref
			const assignedTrucks = state.g.enumGroup(md.id);
			const moreThanOneCellAway = assignedTrucks.every(truck => {
				const tgx = Math.floor(truck.x / cellSize);
				const tgy = Math.floor(truck.y / cellSize);

				if (distSq(tgx, md.gx, tgy, md.gy) > 2) {
					return true;
				} else {
					return false;
				}
			});

			if (moreThanOneCellAway) {
				debug(`aborted (${md.id}) @ (~ tileco ${md.gx * cellSize} ${md.gy * cellSize}); high threat`);
				md.missionStatus = MISSION_STATUS.ABORT;
			}
		});
	}

	abortDangerousConstructionTasks(state) {
		// Cancel tasks where the area is now dangerous but the units are far away (> 10 tiles away).

		const activeMissions = this.toc.getActiveConstructionMissions(state);
		
		let dangerousDerricks = [];

		for (let i=0; i<state.sectors.length; i++) {
			let currSector = state.sectors[i];
			currSector.derricks.forEach(d => {
				if (d.threatLevel > REGION_THREAT_LEVEL.MEDIUM) {
					dangerousDerricks.push(d);
				}
			});
		}

		for (let i=0; i<activeMissions.length; i++) {
			
			let currMission = activeMissions[i];

			let dangerousSector = undefined;
			dangerousSector = dangerousDerricks.find(s => (s.id === currMission.sectorID));		// TODO: 'sectorID': is derrickID for derricks, is "positionUID" more appropriate?

			if (!defined(dangerousSector)) {
				continue;
			}

			// Cancel if trucks & far away and the sector does not have a lot of oil (low value)
			const assignedTrucks = state.g.enumGroup(currMission.id);
			if (assignedTrucks.every(truck => distance(truck, dangerousSector) > 6)) {
				// debug(`Cancelling mission ${currMission.id} in sector ${currMission.sectorID} due to high threat`);
				currMission.missionStatus = MISSION_STATUS.ABORT;
			}
		}
	}

	runConstructionTasks(state) {

		let sectorOilCaptureBuildTasks;	
		if (false) {
			sectorOilCaptureBuildTasks = engineering.requestOilCapture(state);
			this.prioritiseOilCapTasks(state);	
		} else {
			sectorOilCaptureBuildTasks = this.prioritiseOilCapTasks(state);	
		}

		const baseBuildTasks = engineering.requestBaseConstruction(state);
		const sectorDefenceBuildTasks = engineering.requestSectorDefenceConstruction(state);	

		const approvedTasks = this.prioritiseConstructionTasks(sectorOilCaptureBuildTasks, baseBuildTasks, sectorDefenceBuildTasks, undefined, state);
		this.toc.assignConstructionTasks({approvedTasks: approvedTasks, state: state});
	
		if (false) {
			this.abortDangerousConstructionTasks(state);
		} else {
			this.abortDangerousConstructionTasks2(state);
		}
		
	}

	runLogistics(state) {
		// Production
		supply.manageProduction();
		// Research
		research.manageResearch();
		// Construction
		this.runConstructionTasks(state);												
	}


	runMissionManager(state) {
		// Executes all bot actions which use the mission manager (e.g. aviation, construction)
		// debug(`${gameTime}:		global_missionManager`);
		this.toc.manageMissions(state);
	}

}