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

		// Strategic parameters
		this.OIL_DOMINANCE_PERCENTAGE = 60;
		this.TARGET_SEARCH_RADIUS = 25;
		this.FORCE_IMMEDIATE_RADIUS = 16;

		// Production logistics parameters
		this.MAX_TRUCKS = 6;

		this.FISHBOT_BRIGADE_COMPOSITION = {
			'MAX_HEAVY_CAVALRY': 8,
			'MAX_LIGHT_CAVALRY': 3,
			'MAX_MORTAR': 6,
			'MAX_ADA': 2,
			'MAX_SENSOR': 1,
			'MAX_INFANTRY': 6
		}
		this.TOTAL_UNITS_PER_BRIGADE = Object.values(this.FISHBOT_BRIGADE_COMPOSITION).reduce((a, b) => a + b, 0);

		this.NUMBER_OF_BRIGADES = 2;
		this.BRIGADE_DESIGNATIONS = [DIVISION.FIRST_BCT, DIVISION.SECOND_BCT, DIVISION.THIRD_BCT, DIVISION.FOURTH_BCT, DIVISION.FIFTH_BCT].slice(0, this.NUMBER_OF_BRIGADES);

		this.BRIGADE_REPAIR_THRESHOLD = 30;
		
		// Task scheduling parameters
		// Add regular, high priority, high computational load tasks to the start of the list.
		// The naming convention is important as this allows the handlers in _run.js to run the correct function.
		// e.g. label intelligence tasks with 'intel_'.
		this.REQUESTS_PER_MINUTE = {
			'combat_runC2': 60,
			'global_missionManager': 60,
			'runLogistics': 60,
			'intel_getNearbyGroundTargets': 60,
			'intel_getMapIntelligence': 20,
			'intel_checkCampaignStatus': 15,
			'intel_getAviationTargets': 15,
			'intel_checkOilDominance': 2,
		};

		this.INTELLIGENCE_SUBTASK_NAMES = [];

	}

	/////////////////////////////////////////////////// STATE INITIALISATION ///////////////////////////////////////////////////

	/**
	 * 
	 * @param {worldState} state 
	 */
	setDefaultMissions(state) {
		// TODO: mutates the state. move to hq_toc

		// Aviation - rearming
		const md1 = this.toc.createNewMission({missionType: MISSION_TYPE.VTOL_STAGING_MISSION, priority: MISSION_PRIORITY.LOW});		

		// Construction - helping construct around base
		const md2 = this.toc.createNewMission({missionType: MISSION_TYPE.HELP_CONSTRUCT, priority: MISSION_PRIORITY.LOW});
		
		// Ground forces - return for repair
		const md3 = this.toc.createNewMission({missionType: MISSION_TYPE.RETURN_FOR_REPAIR, priority: MISSION_PRIORITY.LOW});		

		state.activeMissions.push(md1, md2, md3);
	}

	/**
	 * 
	 * @param {worldState} state 
	 */
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

	/**
	 * 
	 * @param {string} event 
	 */
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

	/**
	 * 
	 * @param {worldState} state 
	 */
	#checkCampaignStatus(state) {
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

	/////////////////////////////////////////////////// G2: INTELLIGENCE ///////////////////////////////////////////////////

	/**
	 * 	For performance reasons, this function was changed from linear to distributed.
	 * 	The intent is:
	 * 	1. Intelligence mission/task is scheduled
	 * 	2. Mission is either immediately run or scheduled to run by the global mission manager
	 * 	3. Observations are compiled into the global 'state' by the `toc`
	 * @param {worldState} state
	 * @param {string} taskID
	 * @returns {void}
	 */
	runIntelligence(state, taskID) {
		
		// Note: For performance reasons, anything which can be executed immediately should not use the mission management system.

		switch(taskID) {

			case 'intel_checkOilDominance':
				const isOilDominant = checkOilDominance(state, this.OIL_DOMINANCE_PERCENTAGE);
				this.toc.setOilDominanceStatus(state, isOilDominant);
				break;
			
			case 'intel_getNearbyGroundTargets':

				// Update location(s) & composition(s) of active combat force(s)
				const forceLocations = [];

				this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
					forceLocations.push({
						'brigadeID': brigadeID,
						'location': groundForces.getForceMedianLocation(brigadeID)
					});
				});
				this.toc.setForceLocations(state, forceLocations);

				const nearbyGroundTargets = [];
				state.forceLocations.forEach(fLoc => {
					const targetInfo = {
						'brigadeID': fLoc['brigadeID'],
						'targets' : intelligence.proposeTargetsInRadius2(state, fLoc['location'], this.TARGET_SEARCH_RADIUS, this.FORCE_IMMEDIATE_RADIUS)
					};

					nearbyGroundTargets.push(targetInfo);						
				});

				hq.toc.setNearbyGroundTargets(state, nearbyGroundTargets);
				break;
			
			case 'intel_checkCampaignStatus':

				this.#checkCampaignStatus(state);
				break;

			case 'intel_getAviationTargets':

				const raidTargets = intelligence.getTargetsNearDerricks(state);
				const baseTargets = intelligence.getBaseTargets(state);
				hq.toc.setAviationTargets(state, 
					raidTargets, 
					baseTargets['productionTargets'], 
					baseTargets['adaTargets'],
					baseTargets['indirectFireTargets'],
					baseTargets['defensiveStructureTargets']
				);

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

	/////////////////////////////////////////////////// G3: COMBAT OPERATIONS ///////////////////////////////////////////////////
	#prioritiseLandForceTargets(targetInfo, groupPosition) {

		let output = {
			"directFireTarget": undefined, 
			"fireSupportTarget": undefined,
			"adaTarget": undefined, 
			"casTargets": [],
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
		const DIRECT_FIRE_DEBUG = false;

		const isNotTruckOrADA = (t) => (t.flags & (OBJ_FLAGS.CONSTRUCTOR | OBJ_FLAGS.ADA)) === 0;
		const isHighPriorityStructure = (t) => (t.flags & OBJ_FLAGS.IS_BUILT) && (t.flags & (OBJ_FLAGS.RESOURCE_EXTRACTOR | OBJ_FLAGS.PRODUCTION | OBJ_FLAGS.DEFENSIVE_STRUCTURE)) !== 0;

		const cObj = targetInfo["closestObject"];
		if (defined(getObject(cObj.type, cObj.player, cObj.id))) {
			if (cObj.type === DROID && isNotTruckOrADA(cObj) && cObj.stattype !== WALL) {
				output["directFireTarget"] = targetInfo["closestObject"];
				if (DIRECT_FIRE_DEBUG) debug(`used default direct fire target @${gameTime}`);
			}
		} 

		let closestDroidTarget = undefined, closestDroidDistSq = 8888;				// some large number is used in case it is never set
		let closestStructTarget = undefined, closestStrucTargetDistSq = 8888;
		if (!defined(output["directFireTarget"])) {
			// This is a fallback to handle stale inputs / non-droid targets
			for (let i=0; i<targetInfo["closestObjects"].length; i++) {

				const t = targetInfo["closestObjects"][i];
				const obj = getObject(t.type, t.player, t.id);

				if (!defined(obj)) {
					continue;
				}

				const d = distSq(obj.x, groupPosition.x, obj.y, groupPosition.y);
				if (t.type === DROID && isNotTruckOrADA(t)) {
					if (!defined(closestDroidTarget)) {
					closestDroidTarget = t;
					closestDroidDistSq = d;
					} else if (d < closestDroidDistSq) {
						closestDroidTarget = t;
						closestDroidDistSq = d;
					}
				} else if (t.type === STRUCTURE && isHighPriorityStructure(t)) {
					if (!defined(closestStructTarget)) {
						closestStructTarget = t;
						closestStrucTargetDistSq = d;
					} else if (d < closestStrucTargetDistSq) {
						closestStructTarget = t;
						closestStrucTargetDistSq = d;
					}
				}
			}

			if (defined(closestDroidTarget) && closestDroidDistSq <= 10 ** 2) {
				output["directFireTarget"] = closestDroidTarget;
				if (DIRECT_FIRE_DEBUG) debug(`fallback directFireTarget (DROID) used @ ${gameTime} ms`);
			} else if (defined(closestStructTarget) && closestStrucTargetDistSq < 10 ** 2) {
				output["directFireTarget"] = closestStructTarget;
				if (DIRECT_FIRE_DEBUG) debug(`fallback directFireTarget (STRUCTURE) used @ ${gameTime} ms`);
			} else {
				output["directFireTarget"] = targetInfo["closestObject"];
				if (DIRECT_FIRE_DEBUG) debug(`used non-preferable closestObject @${gameTime}`);
			}
		}

		// CAS
		output["casTargets"].push(...targetInfo["enemyIndirectFire"], ...targetInfo["enemyArmor"]);

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
			let backupFsTargets = [...targetInfo["enemyIndirectFire"], ...targetInfo["enemyADA"], ...targetInfo["enemyIndustrial"], ...targetInfo["enemyDefenses"]];
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

	/**
	 * 
	 * @param {worldState} state 
	 * @param {*} groupPositions 
	 * @param {*} nearbyTargetCount 
	 * @param {*} airRaidTargets 
	 * @param {*} casTargets 
	 * @param {*} industrialTargets 
	 * @param {*} adaTargets 
	 * @returns {Array}
	 */
	#prioritiseAviationTargets(state, groupPositions, nearbyTargetCount, airRaidTargets, casTargets, industrialTargets, adaTargets, indirectFireTargets, defensiveStructureTargets) {

		const aviationTargets = [];
		
		const adaThreat = state.fields.adaThreat;
		const cellSize = state.grid.cellSize;
		const IS_OIL_DOMINANT = state.oilDominance;
		const NUM_AIRCRAFT = state.playerInfo[me].numAirUnits;	
		const AIR_UNIT_DOMINANCE = NUM_AIRCRAFT >= 10;
		const AIR_UNIT_SHORTAGE = NUM_AIRCRAFT === 1;

		const GROUP_POSITIONS = [];
		groupPositions.forEach(p => GROUP_POSITIONS.push(p['location']));

		let targetCandidates = [];

		if (!defined(airRaidTargets)) {
			airRaidTargets = [];
		}

		// TEMPORARY IMPLEMENTATION
		const prioritiseCasTargets = (nearbyTargetCount >= 4 && !IS_OIL_DOMINANT) || (IS_OIL_DOMINANT && nearbyTargetCount >= 5);
		const prioritiseRaidTargets = !IS_OIL_DOMINANT;
		const prioritiseIndustrialTargets = IS_OIL_DOMINANT;
		const SATURATION_RAID = prioritiseIndustrialTargets && AIR_UNIT_DOMINANCE;		// Saturation raid = an attack designed to overwhelm defenses

		let minAircraft = (AIR_UNIT_SHORTAGE && !IS_OIL_DOMINANT) ? 1 : 2;

		// Set missionType & numAircraft (attached to existing target object)
		casTargets.forEach(t => {
			t.missionType = MISSION_TYPE.CAS_STRIKE;
			if (prioritiseCasTargets) {
				t.priority = MISSION_PRIORITY.URGENT;
			}
			t.minAircraft = minAircraft;
		});
		airRaidTargets.forEach(t => {
			t.missionType = MISSION_TYPE.AIR_RAID;
			t.minAircraft = minAircraft;
		});
		industrialTargets.forEach(t => {
			t.missionType = MISSION_TYPE.DAS_STRIKE;
			if (SATURATION_RAID) {		
				t.minAircraft = 3;
			} else {
				t.minAircraft = minAircraft;
			}
		});
		adaTargets.forEach(t => {
			t.missionType = MISSION_TYPE.DAS_STRIKE;
			t.minAircraft = 3;
		});

		const casPriorityTargets = [...casTargets, ...airRaidTargets];
		const raidPriorityTargets = [...airRaidTargets, ...casTargets];

		if(prioritiseIndustrialTargets) {

			if (SATURATION_RAID) {
				targetCandidates = [...adaTargets, ...industrialTargets, ...indirectFireTargets, ...defensiveStructureTargets, ...casPriorityTargets];
			} else {
				targetCandidates = [...adaTargets, ...indirectFireTargets, ...industrialTargets, ...defensiveStructureTargets, ...casPriorityTargets];			
			}
		} else if (prioritiseCasTargets) {
			targetCandidates = casPriorityTargets;
		} else if (prioritiseRaidTargets) {
			targetCandidates = raidPriorityTargets;
		} else {
			targetCandidates = casPriorityTargets;
		}

		if (targetCandidates.length === 0) {
			// debug(`${gameTime}: no target candidates; (CAS/RAID/IND = ${prioritiseIndustrialTargets}, ${prioritiseCasTargets}, ${prioritiseRaidTargets})`);
			return aviationTargets;
		} 

		// Terminate current missions which are TWO PRIORITY LEVELS below e.g.
		// If new URGENT task -> cancel HIGH missions 
		const OFFENSIVE_MISSION_TYPES = [MISSION_TYPE.CAS_STRIKE, MISSION_TYPE.AIR_RAID, MISSION_TYPE.DAS_STRIKE];
		let activeMissions = this.toc.getActiveAviationMissions(state).
										filter(m => OFFENSIVE_MISSION_TYPES.includes(m.missionType));

		let activeTargetIDs = [];

		/*
			Set no-fly regions; 
				0 = avoids all anti-air defences, 
				0.69 > 0.33 * 2 = allow 1 tile over from a single air defence. 
			Modify value to match "hq_toc/updateSpatialFields" filter.
		*/
		const threatThreshold = IS_OIL_DOMINANT ? 0.69 : 0;		


		const MED_PRIORITY_MISSION_TYPES = [MISSION_TYPE.AIR_RAID, MISSION_TYPE.DAS_STRIKE];
		
		for (let i=0; i<activeMissions.length; i++) {
			let c = activeMissions[i];
			activeTargetIDs.push(c.target.id);

			const currObj = getObject(c.target.type, c.target.player, c.target.id);
			if (!defined(currObj)) {
				continue;
			}

			if (prioritiseCasTargets && MED_PRIORITY_MISSION_TYPES.includes(c.missionType)) {
				// debug(`removed DAS / RAID mission to make room for CAS`);
				c.missionStatus = MISSION_STATUS.ABORT;
				continue;
			}

			if (!SATURATION_RAID) {
				const gx = Math.floor(currObj.x / cellSize); 
				const gy = Math.floor(currObj.y / cellSize);
				if (adaThreat[gx][gy] > threatThreshold) {
					// debug(`	removed ACTIVE: ${currObj.name} (${c.missionType}) @ grid (${currObj.x} ${currObj.y})`);
					c.missionStatus = MISSION_STATUS.ABORT;		
					continue;
				}
			}

			const nearPosition = (gameObj, groupPos) => {return distSq(gameObj.x, groupPos.x, gameObj.y, groupPos.y) <= this.TARGET_SEARCH_RADIUS ** 2};

			if (c.missionType === MISSION_TYPE.CAS_STRIKE) {
				if (!GROUP_POSITIONS.some(p => nearPosition(currObj, p))) {
					// debug(`aborted CAS_STRIKE: ${c.target.name} @ ${gameTime}, too far away`);
					c.missionStatus = MISSION_STATUS.ABORT;					
					continue;
				}
			}
		}
		
		// Remove already active missions (inefficient, loops through the list again)
		// Also handles stale inputs, to be integrated with another part of the code later
		let newAviationTargets = [], existingAviationTargets = [];

		for (let i=0; i<targetCandidates.length; i++) {
			const c = getObject(targetCandidates[i].type, targetCandidates[i].player, targetCandidates[i].id);
			if (!defined(c)) {
				continue;
			}

			if (!SATURATION_RAID) {
				const gx = Math.floor(c.x / cellSize); 
				const gy = Math.floor(c.y / cellSize);
				if (adaThreat[gx][gy] > threatThreshold) {
					// debug(`	removed CANDIDATE, adaThreat: ${c.name} @ grid (${c.x} ${c.y})`);
					continue;
				}
			}

			if (activeTargetIDs.includes(targetCandidates[i].id)) {
				existingAviationTargets.push(targetCandidates[i]);
			} else {
				newAviationTargets.push(targetCandidates[i]);
			}
		}

		aviationTargets.push(...newAviationTargets);
		const TOO_MANY_AIRCRAFT = newAviationTargets.length <= Math.floor(NUM_AIRCRAFT / 2);
		if (TOO_MANY_AIRCRAFT) {
			aviationTargets.push(...existingAviationTargets);
		}

		return aviationTargets;
	}

	/**
	 * 
	 * @param {worldState} state 
	 */
	runCombatOperations(state) {

		// Gather prepared information from intelligence
		const nearbyGroundTargets = state.nearbyGroundTargets;
		const forceLocations = state.forceLocations;

		const raidTargets = state.aviationTargets['raidTargets'];
		const productionTargets = state.aviationTargets['productionTargets'];
		const adaTargets = state.aviationTargets['adaTargets'];
		const indirectFireTargets = state.aviationTargets['indirectFireTargets'];
		const defensiveStructureTargets = state.aviationTargets['defensiveStructureTargets'];

		const campaignStatus = this.#getCampaignStatus();
		const readyToAttack = campaignStatus === CAMPAIGN_STATUS.MAIN_ASSAULT || campaignStatus === CAMPAIGN_STATUS.STAGING;

		let casTargets = [];
		let numTargetsInImmediateRadius = 0;

		if (readyToAttack) {
			// Prioritise & assign targets
			this.BRIGADE_DESIGNATIONS.forEach((brigadeID, i) => {
				const brigadeTargets = nearbyGroundTargets[i]['targets'];
				const brigadeLocation = forceLocations[i]['location'];

				const groundTargets = this.#prioritiseLandForceTargets(brigadeTargets, brigadeLocation);
				// hackMarkTiles();
				
				// TODO: use mission management system once this mission can be conducted independently on brigade-level
				moveBrigadeToAttack(
					state, 
					brigadeID, 
					brigadeLocation,
					groundTargets["directFireTarget"], 
					groundTargets["fireSupportTarget"], 
					groundTargets["adaTarget"]
				);

				// Extract further information for aviation missions
				casTargets.push(...groundTargets["casTargets"]);

				// Temporary: get max targets to decide if CAS should be prioritised for all brigades
				numTargetsInImmediateRadius = Math.max(groundTargets["targetsInImmediateRadius"], numTargetsInImmediateRadius);
					
			});
		}

		const aviationTargets = this.#prioritiseAviationTargets(state, 
			forceLocations, 
			numTargetsInImmediateRadius, 
			raidTargets, 
			casTargets, 
			productionTargets,
			adaTargets,
			indirectFireTargets,
			defensiveStructureTargets,
		);

		this.toc.assignAviationMissions(state, aviationTargets);					
	}

	/////////////////////////////////////////////////// G4: LOGISTICS ///////////////////////////////////////////////////
	/**
	 * 
	 * @param {worldState} state 
	 * @param {Array} activeRemoteMissions
	 */
	#abortDangerousConstructionTasks(state, activeRemoteMissions) {
		const cellSize = state.grid.cellSize;

		const enemyUnitThreat = state.fields.enemyUnitThreat;

		// New mission planning system has implemented .gx, .gy grid references for all missions
		// This allows the following algorithm:
		// 	1. Check threat @ grid ref
		//	2. Check truck distances to grid ref 
		//	3. Cancel mission
		activeRemoteMissions.forEach(md => {
			// Check unit threat at grid ref
			if (enemyUnitThreat[md.gx][md.gy] === 0) {
				return;
			}
			
			// Check truck locations relative to grid ref
			const assignedTrucks = state.g.enumGroup(md.id);
			const moreThanOneCellAway = assignedTrucks.every(truck => {
				const tgx = Math.floor(truck.x / cellSize);
				const tgy = Math.floor(truck.y / cellSize);

				if (distSq(tgx, md.gx, tgy, md.gy) >= 1) {
					return true;
				} else {
					return false;
				}
			});

			if (moreThanOneCellAway) {
				// debug(`aborted (${md.id}) @ (~ tileco ${md.gx * cellSize} ${md.gy * cellSize}); high threat`);
				md.missionStatus = MISSION_STATUS.ABORT;
			}
		});
	}

	/**
	 * 
	 * @param {worldState} state 
	 */
	runConstructionLogistics(state) {

		// Command re-evaluates existing construction tasks
		const OIL_CAPTURE_MISSION_TYPES = [
			MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR, 
			MISSION_TYPE.CONSTRUCT_OIL_DERRICK
		];
		const BASE_BUILD_MISSION_TYPES = [
			MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE, 
			MISSION_TYPE.CONSTRUCT_SINGLE_MODULE
		];

		let activeOilCapTaskIDs = [];
		let activeBaseBuildTasks = []; 
		let activeDefenceBuildTaskIDs = [];
		let activeRepairCenterBuildTaskIDs = [];
		let activeRemoteMissions = [];

		this.toc.getActiveConstructionMissions(state).forEach(missionData => {
			if (OIL_CAPTURE_MISSION_TYPES.includes(missionData.missionType)) {
				activeOilCapTaskIDs.push(missionData.sectorID);	
				activeRemoteMissions.push(missionData);	
			} else if (BASE_BUILD_MISSION_TYPES.includes(missionData.missionType)) {
				activeBaseBuildTasks.push(missionData);	
			} else if (missionData.missionType === MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE) {
				activeDefenceBuildTaskIDs.push(missionData.sectorID);	
				activeRemoteMissions.push(missionData);	
			} else if (missionData.missionType === MISSION_TYPE.CONSTRUCT_REPAIR_CENTER) {
				activeRepairCenterBuildTaskIDs.push(missionData.sectorID);
				// activeRemoteMissions.push(missionData);	// building near friendly troops; don't want to be cancelled prematurely
			}
		});
		
		this.#abortDangerousConstructionTasks(state, activeRemoteMissions);

		// Command then terminates, if there are no available trucks this tick (avoids expensive planning tasks)
		const trucksUnavailable = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE).length === 0;
		if (trucksUnavailable) {
			return;
		}

		// Command tasks g4 with option & prioritises options here
		// For now, assumes that g4 does not propose duplicates - e.g. tracks & removes already assigned tasks 
		let approvedConstructionTasks = [];

		// BASE BUILD
		const MAX_BASE_BUILD_TASKS = 1;
		const baseBuildDeficit = MAX_BASE_BUILD_TASKS - activeBaseBuildTasks.length;
		if (baseBuildDeficit > 0) {
			const requestedBaseBuildTasks = engineering.requestBaseConstruction(state);
			approvedConstructionTasks.push(...requestedBaseBuildTasks.slice(0, 1));
		}

		// OIL CAP
		const MAX_OIL_CAP_TASKS = 4; 
		const oilCapDeficit = MAX_OIL_CAP_TASKS - activeOilCapTaskIDs.length;
		if (oilCapDeficit > 0) {
			const sectorOilCapTasks = engineering.generateOilCaptureOptions(state, activeOilCapTaskIDs);
			approvedConstructionTasks.push(...sectorOilCapTasks.slice(0, oilCapDeficit));
		}
	
		// DERRICK DEFENCES
		const MAX_CONCURRENT_FORTIFICATION_TASKS = (gameTime < 180000) ? 1 : 2;		// hack; tuned for Gamma
		const ACTIVE_FORTIFICATION_TASKS = activeDefenceBuildTaskIDs.length;
		const fortificationDeficit = MAX_CONCURRENT_FORTIFICATION_TASKS - ACTIVE_FORTIFICATION_TASKS;

		if (fortificationDeficit > 0) {
			const sectorDefenceTasks = engineering.generateOilDefenceConstructionOptions(state, activeDefenceBuildTaskIDs);
			const approvedSectorDefenceTasks = sectorDefenceTasks.slice(0, fortificationDeficit);
			approvedConstructionTasks.push(...approvedSectorDefenceTasks);
		}

		// LOCAL REPAIR CENTERS	
		const MAX_CONCURRENT_REPAIR_CENTER_BUILDS = 1;
		const ACTIVE_REPAIR_CENTER_TASKS = activeRepairCenterBuildTaskIDs.length;
		const repairCentersToBeConstructed = MAX_CONCURRENT_REPAIR_CENTER_BUILDS - ACTIVE_REPAIR_CENTER_TASKS;
		if (repairCentersToBeConstructed > 0) {
			const serviceCenterConstructionOptions = engineering.generateRemoteServiceCenterConstructionOptions(state);
			const approvedRepairCenterConstructionTasks = serviceCenterConstructionOptions.slice(0, repairCentersToBeConstructed);
			approvedConstructionTasks.push(...approvedRepairCenterConstructionTasks);
		}

		// Command delegates assignment 
		this.toc.assignConstructionTasks(state, approvedConstructionTasks);
	}

	#debugPrintLandVehicleCategory(categories) {
		debug(`\t${gameTime}ms: Production priority`);
		categories.forEach(c => 
			debug(`\t    ${c['category'].padEnd(20)}\t | ${String(Math.floor(c['scoreNorm'] * 1000) / 1000).padEnd(5)} \t| ${Math.floor(c['surplusNorm'] * 1000) / 1000}`));
	}

	/**
	 * 
	 * @param {worldState} state 
	 * @param {*} deficit 
	 */
    #prioritiseLandVehicleCategory(state, deficit) {
        
		const CATEGORIES = ['heavyCavalry', 'lightCavalry', 'shortRangeArtillery', 'ADA', 'sensor'];
        let vehicleCategories = [];

		let w_deficit = {
			'heavyCavalry': 1,
            'lightCavalry': 1,
            'shortRangeArtillery': 1,
            'ADA': 1,
            'sensor': 1,
		};
		let w_strategic = {
			'heavyCavalry': 1,
            'lightCavalry': 1,
            'shortRangeArtillery': 0.75,
            'ADA': 0.001,
            'sensor': 0.001,
		};

		const calculateSurplus = (category) => {return -1 * deficit[category]['norm']};
		const makeCategory = (category) => {
			return {
				'category': category, 
				'scoreNorm': 0.0, 
				'surplusNorm': calculateSurplus(category)
			};
		};

		let categoriesInSurplus = 0;

		CATEGORIES.forEach(category => {
			const c = makeCategory(category);
			vehicleCategories.push(c);
			if (c['surplusNorm'] >= 0) {
				categoriesInSurplus++;
			}
		});

		// Adjust unit strategic weights
		const SUFFICIENT_CAVALRY = deficit['heavyCavalry']['norm'] < 0.65 && deficit['lightCavalry']['norm'] < 0.65;
		if (SUFFICIENT_CAVALRY) {
			w_strategic = {
				'heavyCavalry': 1,
				'lightCavalry': 1,
				'shortRangeArtillery': 0.75,
				'ADA': 0.35,
				'sensor': 0.2,
			};
		}

		// Adjust unit deficit weights
		const BRIGADE_OVERSTRENGTH = categoriesInSurplus === CATEGORIES.length;
		if (BRIGADE_OVERSTRENGTH) {
			// All categories in surplus; use a new set of weights to deal with negative deficit. 
			// In this condition, a large deficit weight = less likely to produce.
			// This is because the algorithm greedily checks for "largest deficit". When the deficit is negative, "largest deficit" = least negative number.
			w_deficit = {
				'heavyCavalry': 1,
				'lightCavalry': 1,
				'shortRangeArtillery': 1,
				'ADA': 3,
				'sensor': 10,
			};
		}

		const calculateScore = (category) => {return w_deficit[category] * deficit[category]['norm'] * w_strategic[category];};

		vehicleCategories.forEach(c => c['scoreNorm'] = calculateScore(c.category));			

		vehicleCategories.sort((a, b) => b['scoreNorm'] - a['scoreNorm']);

		return vehicleCategories;
    }

	#printDebugResupply(state) {

		const getReserveUnitsOfType = (groupID) => state.g.enumGroup(groupID);

		const HEAVY_CAV_RESERVE = getReserveUnitsOfType(DIVISION.HEAVY_CAV_RESERVE);
		const LIGHT_CAV_RESERVE = getReserveUnitsOfType(DIVISION.LIGHT_CAV_RESERVE);
		const INFANTRY_RESERVE = getReserveUnitsOfType(DIVISION.INFANTRY_RESERVE);
		const SHORT_RANGE_FIRE_SUPPORT_RESERVE = getReserveUnitsOfType(DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE);
		const SENSOR_RESERVE = getReserveUnitsOfType(DIVISION.SENSOR_RESERVE);
		const AIR_DEFENCE_RESERVE = getReserveUnitsOfType(DIVISION.AIR_DEFENCE_RESERVE);
		
		const RETURNING_FOR_REPAIR = getReserveUnitsOfType(DIVISION.RETURNING_FOR_REPAIR);

		let printedTitle = false;

		this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
			const deficit = supply.getBrigadeSupplyStatus(state, brigadeID, this.FISHBOT_BRIGADE_COMPOSITION, this.BRIGADE_REPAIR_THRESHOLD);

			const brigadeStrength = Math.floor(deficit['totalLandUnits'] / deficit['targetTotalLandUnits'] * 100);
			const actualBrigadeUnitCount = state.g.enumGroup(brigadeID).length;
			if (brigadeStrength !== 0) {
				if (!printedTitle) {					
					debug(`==${getOrdinal(me)} DIVISION @ ${gameTime}==`);
					debug(`\tRESERVE:\t hc: ${HEAVY_CAV_RESERVE.length}, lc: ${LIGHT_CAV_RESERVE.length}, inf: ${INFANTRY_RESERVE.length}, mort: ${SHORT_RANGE_FIRE_SUPPORT_RESERVE.length}, sens: ${SENSOR_RESERVE.length}, ada: ${AIR_DEFENCE_RESERVE.length}, repair: ${RETURNING_FOR_REPAIR.length}`)
					printedTitle = true;
				}
				debug(`\tBrigade ${brigadeID}: ${brigadeStrength} % (${deficit['totalLandUnits']} / ${this.TOTAL_UNITS_PER_BRIGADE} units) (actual: ${actualBrigadeUnitCount})`);
			}
		});

	}

	#recoverRepairedUnits(state) {
		const repairedUnits = state.g.enumGroup(DIVISION.RETURNING_FOR_REPAIR);
		const REPAIRED_AT_HEALTH = 99;

		repairedUnits.forEach(droid => {
			if (droid.health < REPAIRED_AT_HEALTH) {
				return;
			}

			this.toc.setNewDroidGroup(state, droid, DIVISION.RETURNING_FOR_REPAIR); 	// this sets the new group & removes from "RETURN_FOR_REPAIR"
		})
	}

	/**
	 * This function:
	 * 	- returns repaired units to active duty 
	 * 	- assigns reserve units to active brigade combat teams
	 * @param {worldState} state 
	 */
	runResupplyLogistics(state) {

		// Return repaired units back into the reserve force
		this.#recoverRepairedUnits(state);
		
		// Assign reserves into active brigade combat teams
		const getReserveUnitsOfType = (groupID) => state.g.enumGroup(groupID);

		const RECOMBINATION_THRESHOLD = 25;
		const OVERSTRENGTH_THRESHOLD = 100;
		const brigadesForRecombination = [];
		const overstrengthBrigades = [];

		for (let i=0; i<this.BRIGADE_DESIGNATIONS.length; i++) {

			const brigadeID = this.BRIGADE_DESIGNATIONS[i];

  			const deficit = supply.getBrigadeSupplyStatus(state, brigadeID, this.FISHBOT_BRIGADE_COMPOSITION, this.BRIGADE_REPAIR_THRESHOLD);
			
			// Check brigade strength as percentage
			const brigadeStrength = Math.floor(deficit['totalLandUnits'] / deficit['targetTotalLandUnits'] * 100);

			// Earmark for dissolution if understrength
			if (brigadeStrength < RECOMBINATION_THRESHOLD) {
				brigadesForRecombination.push(brigadeID);
			}

			// Ignore if overstrength
			if (brigadeStrength > OVERSTRENGTH_THRESHOLD) {
				overstrengthBrigades.push(brigadeID);
			}	

			// Else, check reserves & assign reinforcements
			// TODO - FIND MORE EFFICIENT WAY TO RECALCULATE REMAINING RESERVE QTY
			const HEAVY_CAV_RESERVE = getReserveUnitsOfType(DIVISION.HEAVY_CAV_RESERVE);
			const LIGHT_CAV_RESERVE = getReserveUnitsOfType(DIVISION.LIGHT_CAV_RESERVE);
			const INFANTRY_RESERVE = getReserveUnitsOfType(DIVISION.INFANTRY_RESERVE);
			const SHORT_RANGE_FIRE_SUPPORT_RESERVE = getReserveUnitsOfType(DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE);
			const SENSOR_RESERVE = getReserveUnitsOfType(DIVISION.SENSOR_RESERVE);
			const AIR_DEFENCE_RESERVE = getReserveUnitsOfType(DIVISION.AIR_DEFENCE_RESERVE);

			const getReinforcementUnits = (reserveType, reserveID, reserveUnitList) => {
				return {
					'category': reserveID,
					'unitList': reserveUnitList.slice(0, deficit[reserveType]['abs'] + deficit[reserveType]['damagedUnitCount']),
					'damagedUnitList': deficit[reserveType]['damagedUnitList']
				};
			};

			const resupplyUnits = [
				getReinforcementUnits('heavyCavalry', DIVISION.HEAVY_CAV_RESERVE, HEAVY_CAV_RESERVE),
				getReinforcementUnits('lightCavalry', DIVISION.LIGHT_CAV_RESERVE, LIGHT_CAV_RESERVE),
				getReinforcementUnits('infantry', DIVISION.INFANTRY_RESERVE, INFANTRY_RESERVE),
				getReinforcementUnits('shortRangeArtillery', DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, SHORT_RANGE_FIRE_SUPPORT_RESERVE),
				getReinforcementUnits('ADA', DIVISION.AIR_DEFENCE_RESERVE, AIR_DEFENCE_RESERVE),
				getReinforcementUnits('sensor', DIVISION.SENSOR_RESERVE, SENSOR_RESERVE),
			];

			const heavyCavReinforcementCount = resupplyUnits[0]['unitList'].length;

			const NO_HEAVY_CAV_REINFORCEMENTS = heavyCavReinforcementCount === 0;
			const BRIGADE_HAS_NO_HEAVY_CAV = deficit['heavyCavalry']['abs'] === this.FISHBOT_BRIGADE_COMPOSITION.MAX_HEAVY_CAVALRY;
			const BRIGADE_IS_WEAK_AND_NOT_FIRST_BCT = brigadesForRecombination.includes(brigadeID) && brigadeID !== DIVISION.FIRST_BCT;

			
			// Check which units should be repaired
			if (brigadesForRecombination.includes(brigadeID)) {
				// do nothing
			} else {
				const unitsToBeRepaired = [];
				resupplyUnits.forEach(r => {
					unitsToBeRepaired.push(...r['damagedUnitList'].slice(r['unitList'].length))		// equal replacements
				})

				this.toc.assignUnitsForRepair(state, unitsToBeRepaired, brigadeID);
			}

			if (BRIGADE_IS_WEAK_AND_NOT_FIRST_BCT && BRIGADE_HAS_NO_HEAVY_CAV && NO_HEAVY_CAV_REINFORCEMENTS) {
				// do nothing
			} else {
				this.toc.assignUnitsToBrigade(state, resupplyUnits, brigadeID);
			}		
			
		}

		// this.#printDebugResupply(state);

	}

	runProductionLogistics(state) {
		/**
		 * Debug print of idle factories.
		 * @param {any[]} idleFactoryList 
		 * @param {string} name 
		 */
		const debugPrintIfIdle = (idleFactoryList, name) => {
			if (idleFactoryList.length > 0) {
				debug(`	${gameTime}: Idle "${name}": ${idleFactoryList.length}`);
			}
		};

		// Check factories for idle
		const factories = state.playerInfo[me]["normalFactoryFbObjects"];
		const cyborgFactories = state.playerInfo[me]["cyborgFactoryFbObjects"];
		const vtolFactories = state.playerInfo[me]["vtolFactoryFbObjects"];

		const idleFactories = getIdleStructureObjects(factories);
		const idleCyborgFactories = getIdleStructureObjects(cyborgFactories);
		const idleVtolFactories = getIdleStructureObjects(vtolFactories);

		if (false) {
			debugPrintIfIdle(idleFactories, "Factory");
			debugPrintIfIdle(idleCyborgFactories, "Cyborg Factory");
			debugPrintIfIdle(idleVtolFactories, "VTOL Factory");
		}

		if (idleFactories.length === 0 && idleCyborgFactories.length === 0 && idleVtolFactories.length === 0) {
			return;
		}

		// Define unit limits
		const TRUCK_HARD_LIMIT = getDroidLimit(me, DROID_CONSTRUCT);
		const TRUCK_SOFT_LIMIT = Math.min(TRUCK_HARD_LIMIT, this.MAX_TRUCKS);

		const COMBAT_UNIT_HARD_LIMIT = getDroidLimit(me, DROID_WEAPON) - TRUCK_SOFT_LIMIT;
		// Future: this.NUMBER_OF_BRIGADES should be matched to hard limit
		const INFANTRY_UNIT_SOFT_LIMIT = this.FISHBOT_BRIGADE_COMPOSITION['MAX_INFANTRY'] * this.NUMBER_OF_BRIGADES;
		const LAND_VEHICLE_SOFT_LIMIT = (this.TOTAL_UNITS_PER_BRIGADE - this.FISHBOT_BRIGADE_COMPOSITION['MAX_INFANTRY']) * this.NUMBER_OF_BRIGADES;
		const VTOL_UNIT_HARD_LIMIT = COMBAT_UNIT_HARD_LIMIT - LAND_VEHICLE_SOFT_LIMIT - INFANTRY_UNIT_SOFT_LIMIT;

		// Get player data
		const HQ_IS_CONSTRUCTED = state.playerInfo[me]["numConstructedHQs"] > 0;
		const CYBORG_CONSTRUCTOR_AVAILABLE = cyborgFactories.length > 0;
		const MY_TRUCK_COUNT = state.playerInfo[me]["numTrucks"];
		const MY_INFANTRY_COUNT = state.playerInfo[me]["numInfantryUnits"];
		const MY_LAND_VEHICLE_COUNT = (state.playerInfo[me]["numArmourUnits"] + state.playerInfo[me]["numADAUnits"] + 
									   state.playerInfo[me]["numShortRangeIndirectUnits"] + state.playerInfo[me]["numLongRangeIndirectUnits"]);
			// todo: add sensor to land vehicle count
		const MY_VTOL_COUNT = state.playerInfo[me]["numAirUnits"];

		// Compare to limits
		const HIT_TRUCK_LIMIT = MY_TRUCK_COUNT >= TRUCK_SOFT_LIMIT;
		const HIT_INFANTRY_LIMIT = MY_INFANTRY_COUNT >= INFANTRY_UNIT_SOFT_LIMIT;
		const HIT_LAND_VEHICLE_LIMIT = MY_LAND_VEHICLE_COUNT >= LAND_VEHICLE_SOFT_LIMIT;
		const HIT_AIR_UNIT_LIMIT = MY_VTOL_COUNT >= VTOL_UNIT_HARD_LIMIT;

		if (false) {
			debug(`==${gameTime}: (FishBot ${me}) PRODUCTION LIMITS==`);
			debug(`  HIT_TRUCK_LIMIT: ${MY_TRUCK_COUNT} >= ${TRUCK_SOFT_LIMIT}?`);
			debug(`  HIT_INFANTRY_LIMIT: ${MY_INFANTRY_COUNT} >= ${INFANTRY_UNIT_SOFT_LIMIT}?`);
			debug(`  HIT_LAND_VEHICLE_LIMIT: ${MY_LAND_VEHICLE_COUNT} >= ${LAND_VEHICLE_SOFT_LIMIT}?`);
			debug(`  HIT_AIR_UNIT_LIMIT: ${MY_VTOL_COUNT} >= ${VTOL_UNIT_HARD_LIMIT}?`);
		}
		
		// Get unit deficits
		let deficit = supply.getBrigadeSupplyStatus(state, this.BRIGADE_DESIGNATIONS[0], this.FISHBOT_BRIGADE_COMPOSITION, this.BRIGADE_REPAIR_THRESHOLD);
		for (let i=1; i<this.BRIGADE_DESIGNATIONS.length; i++) {
			// Test the previous one
			const brigadeStrength = Math.floor(deficit['totalLandUnits'] / deficit['targetTotalLandUnits'] * 100);
			if (brigadeStrength < 100) {
				break;
			}
			deficit = supply.getBrigadeSupplyStatus(state, this.BRIGADE_DESIGNATIONS[i], this.FISHBOT_BRIGADE_COMPOSITION, this.BRIGADE_REPAIR_THRESHOLD);
		}
		const combatBrigadeDeficit = deficit;

		// Decide on whether or not to produce combat units
		// Note: FishBot will not build combat vehicles before it can design them, on any difficulty.	
		const CAN_DESIGN_COMBAT_UNITS = HQ_IS_CONSTRUCTED;

		const SHOULD_PRODUCE_LAND_VEHICLES = CAN_DESIGN_COMBAT_UNITS && !HIT_LAND_VEHICLE_LIMIT;
		const SHOULD_PRODUCE_INFANTRY = !HIT_INFANTRY_LIMIT;
		const SHOULD_PRODUCE_VTOLS = CAN_DESIGN_COMBAT_UNITS && !HIT_AIR_UNIT_LIMIT;
		
		// Decide on which category of land combat vehicle to produce (basic greedy algorithm)
		let landVehicleCategory = "heavyCavalry";
		if (SHOULD_PRODUCE_LAND_VEHICLES && idleFactories.length > 0) {
			const prioritisedCategories = this.#prioritiseLandVehicleCategory(state, combatBrigadeDeficit);
			landVehicleCategory = prioritisedCategories[0].category;
			// this.#debugPrintLandVehicleCategory(prioritisedCategories);
			// debug(`${gameTime}: producing: ${landVehicleCategory}`);
		}

		// Decide on whether or not to produce trucks
		const SHOULD_PRODUCE_TRUCKS = !HIT_TRUCK_LIMIT;
		const SINGLE_TRUCK_THIS_TICK = CAN_DESIGN_COMBAT_UNITS;
		let producedTruckThisTick = false;

		// Run production
		const DEBUG_PRODUCTION = false;

		// Note: for now, we will directly call the tactical level functions
		for (let i=0; i<idleCyborgFactories.length; i++) {
			const f = idleCyborgFactories[i];

			if (SHOULD_PRODUCE_TRUCKS && CYBORG_CONSTRUCTOR_AVAILABLE && !producedTruckThisTick) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Combat Engineer`);
				produceCombatEngineer(f);
				if (SINGLE_TRUCK_THIS_TICK) {
					producedTruckThisTick = true;
				}
				continue;
			}

			if (SHOULD_PRODUCE_INFANTRY) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Infantry`);
				produceInfantry(f);
			}
		}

		for (let i=0; i<idleVtolFactories.length; i++) {
			const factory = idleVtolFactories[i];

			if (SHOULD_PRODUCE_VTOLS) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced VTOL`);
				produceCloseAirSupport(factory);
			} else {
				break;
			}
		}

		for (let i=0; i<idleFactories.length; i++) {
			const factory = idleFactories[i];

			if (SHOULD_PRODUCE_TRUCKS && !CYBORG_CONSTRUCTOR_AVAILABLE && !producedTruckThisTick) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Hover Truck`);
				produceTruck(factory);
				if (SINGLE_TRUCK_THIS_TICK) {
					producedTruckThisTick = true;
				}
				continue;
			}

			if (SHOULD_PRODUCE_LAND_VEHICLES) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Land Vehicle Template`);
				produceLandUnitCategory(landVehicleCategory, factory);
				return;		
				// occasionally 'return;' will prevent 2x sensor units from being made 
				// TODO: better system is to track active production jobs; 
				// units are usually overmanufactured as production is currently a 'negative-feedback' system
			} else {
				break;
			}
		}

	}

	/**
	 * 
	 * @param {worldState} state 
	 */
	runResearchLogistics(state) {
		const myLabs = state.playerInfo[me]["researchFacilityFbObjects"];
		const idleLabs = getIdleStructureObjects(myLabs);
		if (idleLabs.length === 0) {
			return;
		}

		/*
			v0.3.1 release -> Power upgrade, Heavy Cannon, Cannon Dmg, Research upgrade, ROF, twin aslt, vehicle metals

			Example v0.3.2 T2 research order (quite one-dimensional)
				449902: R-Wpn-Cannon-Damage06
				668902: R-Struc-Power-Upgrade01c
				690902: R-Struc-Research-Upgrade06
				814902: R-Wpn-Cannon-Damage07
				949902: R-Wpn-Cannon6TwinAslt
				950902: R-Wpn-Mortar-Damage05
				1045902: R-Wpn-Cannon-Damage08
				1058902: R-Vehicle-Metals05
				1096902: R-Wpn-Cannon-ROF03
				1187902: R-Wpn-Mortar-Damage06
				1226902: R-Struc-Research-Upgrade07
				1276902: R-Vehicle-Metals06
				1279902: R-Wpn-Cannon-Damage09
				1291902: R-Wpn-Cannon-ROF04
				1534902: R-Wpn-Cannon-Damage09
				1559902: R-Wpn-Mortar-Damage06
		*/

		const FISHBOT_T2_CANNON_RESEARCH_PRIORITIES = [
			RESEARCHES["APFSDS Cannon Rounds Mk3"].id,
			"R-Struc-Power",
			RESEARCHES["Twin Assault Cannon"].id,
			RESEARCHES["Dedicated Synaptic Link Data Analysis Mk3"].id,
			"R-Wpn-Cannon-Damage",
			"R-Wpn-Mortar-Damage", 	
			"R-Vehicle-Metals",
			"R-Wpn-Cannon-ROF", 
			RESEARCHES["Advanced Engineering"].id,
			RESEARCHES["Advanced Repair Facility"].id,
			"R-Struc-Research-Upgrade",
			"R-Cyborg-Metals",
			RESEARCHES["Heavy Body - Tiger"].id,
			"R-Struc-Factory-Upgrade",
			RESEARCHES["Twin Assault Gun"].id,
			"R-Wpn-Mortar-ROF", 
			"R-Struc-VTOLPad-Upgrade",

			// Gauss Researches added here temporarily - need to figure out how to do
			RESEARCHES["Needle Gun"].id,
			RESEARCHES["Rail Gun"].id,
			RESEARCHES["Gauss Cannon"].id,
			"R-Wpn-Rail-Damage",
			"R-Wpn-Rail-Accuracy",
			"R-Wpn-Rail-ROF", 
			
			RESEARCHES["Whirlwind AA Turret"].id,
			RESEARCHES["Heavy Cannon"].id, 
			RESEARCHES["AA Cyclone Flak Cannon"].id, 		
		];

		const FISHBOT_T2_CANNON_RESEARCH_BLACKLIST = [
			"Flame", "Rocket", "Missile", "R-Defense", "R-Sys-VTOLStrike-Turret", "R-Wpn-PlasmaCannon", 
		];

		const proposedResearches = rnd.proposeResearch(FISHBOT_T2_CANNON_RESEARCH_PRIORITIES, FISHBOT_T2_CANNON_RESEARCH_BLACKLIST);
		const researchOrder = [...proposedResearches['highPriority'], ...proposedResearches['regularPriority']];
		
		let positionInResearchOrder = 0;
		for (let i=0; i<idleLabs.length; i++) {

			for (let j=positionInResearchOrder; j<researchOrder.length; j++) {
				if (pursueResearch(idleLabs[i], researchOrder[j].id)) {
					positionInResearchOrder++;
					// debug(`${gameTime} (FishBot ${me}): ${researchOrder[j].name}`);		
					break;
				}
			}
		}

	}

	/**
	 * 
	 * @param {worldState} state 
	 */
	runMissionManager(state) {
		// Executes all bot actions which use the mission manager (e.g. aviation, construction)
		// debug(`${gameTime}:		global_missionManager`);
		this.toc.manageMissions(state);
	}

}