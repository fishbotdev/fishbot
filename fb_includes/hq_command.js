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

class CommandCenter {

	constructor() {

		this.toc = new TacticalOperationsCenter();

		this.campaignStatus = CAMPAIGN_STATUS.BUILDUP;	

		/*
			This constructor is intended to contain *all* FishBot parameters which change how it behaves.
		*/

		this.OIL_DOMINANCE_PERCENTAGE = 55;

		// Put high requests at the start
		this.REQUESTS_PER_MINUTE = {
			'global_missionManager': 60,
			'combat_runC2': 60,
			'runLogistics': 60,
			'intel_manageMissions': 60,
			'intel_sectorUpdate': 30,			
			'intel_checkTargetsNearby': 15,
			'intel_checkCampaignStatus': 15,
			'intel_checkOilDominance': 2,

		};

		this.approvedIntelTasks = [];
	}

	/////////////////////////////////////////////////// STATE INITIALISATION ///////////////////////////////////////////////////

	setDefaultSectorParameters(state) {
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
		// Aviation - rearming
		const md1 = this.toc.createNewMission({missionType: MISSION_TYPE.VTOL_STAGING_MISSION, priority: MISSION_PRIORITY.LOW});		

		// Construction - helping construct around base
		const md2 = this.toc.createNewMission({missionType: MISSION_TYPE.HELP_CONSTRUCT, priority: MISSION_PRIORITY.LOW});

		state.activeMissions.push(md1, md2);
	}

	setSchedulerParameters(state) {

		const r = generateRange(state.INTERVALS_PER_MIN);		
		let usedTimeBlocks = [];
		let lastUsedMod = -1;
		let currMod = 0;

		for (const [key, value] of Object.entries(this.REQUESTS_PER_MINUTE)) {

			state.WORKER_IDS[key] = [];		// make a new list

			const requestInterval = Math.floor(state.INTERVALS_PER_MIN / this.REQUESTS_PER_MINUTE[key]);

			if (requestInterval >= lastUsedMod) {
				lastUsedMod++;	
				currMod = lastUsedMod;
			} else {
				currMod = 0;
			}

			// Creating long arrays of true & false allows for simple lookup using the time index rather than using .includes()
			for (let i=0; i<r.length; i++) {
				if (r[i] % requestInterval !== currMod) {
					state.WORKER_IDS[key].push(false);			
				} else {
					state.WORKER_IDS[key].push(true);
					usedTimeBlocks.push(i);		// for debugging
				}
			}
		}

		if (false) {
			usedTimeBlocks.sort((a,b) => a - b);
			debug(`used timeslots: ${usedTimeBlocks}`);
		}
	}

	/////////////////////////////////////////////////// "CAMPAIGN STATUS" ///////////////////////////////////////////////////
	getCampaignStatus() {
		return this.campaignStatus;
	}

	updateCampaignStatus(event) {
		const currState = this.getCampaignStatus();

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
		output["directFireTarget"] = targetInfo["closestObject"];

		// CAS
		output["casTargets"] = [...targetInfo["enemyArmor"], ...targetInfo["enemyADA"], ...targetInfo["enemyIndirectFire"]];

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

		if (!defined(output["fireSupportTarget"])) {
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
		
		output["targetsInImmediateRadius"] = targetInfo["targetsInImmediateRadius"];

		return output;
	}

	prioritiseAviationTargets(state, groupPosition, nearbyTargetCount, airRaidTargets, casTargets) {
		
		let targetCandidates = [];

		let industrialTargets = []; // temp until implemented

		// TEMPORARY -> Will be replaced by intelligent merge sort based on weighted priority
		const prioritiseCasTargets = nearbyTargetCount >= 3;
		const prioritiseRaidTargets = !state.oilDominance;
		const prioritiseIndustrialTargets = state.oilDominance;

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

		if (prioritiseCasTargets) {
			targetCandidates = [...casTargets, ...airRaidTargets];
		} else if (prioritiseRaidTargets) {
			targetCandidates = [...airRaidTargets, ...casTargets, ...industrialTargets];
		} else {
			targetCandidates = [...industrialTargets, ...casTargets, ...airRaidTargets];
		}

		// Terminate current missions which are TWO PRIORITY LEVELS below e.g.
		// If new URGENT task -> cancel HIGH missions 
		const OFFENSIVE_MISSION_TYPES = [MISSION_TYPE.CAS_STRIKE, MISSION_TYPE.AIR_RAID, MISSION_TYPE.DAS_STRIKE];
		let activeMissions = this.toc.getActiveAviationMissions(state).
										filter(m => OFFENSIVE_MISSION_TYPES.includes(m.missionType));

		let activeTargetIDs = [];
		const CAS_RADIUS = 18;

		for (let i=0; i<activeMissions.length; i++) {
			let c = activeMissions[i];
			activeTargetIDs.push(c.id);

			if (c.priority <= highestNewTargetPriority - 2) {
				// debug(`aborted ${c.missionType}: ${c.target.name} @ ${gameTime}, higher priorities`);
				c.missionStatus = MISSION_STATUS.ABORT;
				continue;
			}
			
			if (c.missionType === MISSION_TYPE.CAS_STRIKE) {
				const currObj = getObject(c.target.type, c.target.player, c.target.id);
				if (!defined(currObj) || !defined(groupPosition)) {
					continue;
				}
				if (distSq(currObj.x, groupPosition.x, currObj.y, groupPosition.y) >= CAS_RADIUS ** 2) {
					// debug(`aborted CAS_STRIKE: ${c.target.name} @ ${gameTime}, too far away`);
					c.missionStatus = MISSION_STATUS.ABORT;					
					continue;
				}
			}

		}

		// Remove already active missions (inefficient, loops through the list again)
		let newAviationTargets = [], existingAviationTargets = [];

		for (let i=0; i<targetCandidates.length; i++) {
			if (!activeTargetIDs.includes(targetCandidates[i].id)) {
				newAviationTargets.push(targetCandidates[i]);
			} else {
				existingAviationTargets.push(targetCandidates[i]);
			}
		}

		return [...newAviationTargets, ...existingAviationTargets];
	}

	runCombatOperations(state) {

		const campaignStatus = this.getCampaignStatus();

		// GROUND FORCES

		const readyToAttack = campaignStatus === CAMPAIGN_STATUS.MAIN_ASSAULT || campaignStatus === CAMPAIGN_STATUS.STAGING;

		let casTargets = [];
		let numTargetsInImmediateRadius = 0;

		if (readyToAttack) {
			// Prioritise & assign targets
			const groundTargets = this.prioritiseLandForceTargets(state.nearbyGroundTargets, state.forceLocation);

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

		let airRaidTargets = intelligence.getAirRaidTargets(state);	

		const aviationTargets = this.prioritiseAviationTargets(state, state.forceLocation, numTargetsInImmediateRadius, airRaidTargets, casTargets);
		// debug(`avTarg ${aviationTargets.length} = cas ${casTargets.length} + raid ${airRaidTargets.length}, ${numTargetsInImmediateRadius}`);
		this.toc.assignAviationMissions(state, aviationTargets);					
	}

	/////////////////////////////////////////////////// INTELLIGENCE ///////////////////////////////////////////////////

	runIntelligence(state) {

		const SHOW_SCHEDULED = false;

		// Execute tasks based on schedule
		if (state.WORKER_IDS['intel_manageMissions'][state.currWorkerID]) {
			if (SHOW_SCHEDULED) debug(`${gameTime}:		intel_manageMissions`);

			if (this.approvedIntelTasks.length > 0) {
				this.toc.assignIntelMissions({intelTasks: this.approvedIntelTasks, state: state});					// hq/toc: this translates orders (previous step) into missions
				const observations = this.toc.getCompletedIntelMissionReports();				// hq/toc: gets completed data (intelligence reports)
				this.toc.compileSectorIntelIntoCOP(observations, state);								// hq/toc: processes intelligence reports & updates state ("Common Operational Picture")

				this.toc.updateHighRiskSectors(state);
			}

			this.approvedIntelTasks = [];		// clear list
		}

		if (state.WORKER_IDS['intel_sectorUpdate'][state.currWorkerID]) { 
			if (SHOW_SCHEDULED) debug(`${gameTime}:		intel_sectorUpdate`);

			state.sectors.forEach(s => 
				this.approvedIntelTasks.push(intelligence.createIntelRequest({missionType: MISSION_TYPE.SECTOR_RECON_ENGINE, payload: s}))
			);
		}

		if (state.WORKER_IDS['intel_checkOilDominance'][state.currWorkerID]) {
			if (SHOW_SCHEDULED) debug(`${gameTime}:		intel_checkOilDominance`);
			this.approvedIntelTasks.push(intelligence.createIntelRequest({missionType: MISSION_TYPE.CHECK_OIL_DOMINANCE, payload: this.OIL_DOMINANCE_PERCENTAGE}));	
		}

		if (state.WORKER_IDS['intel_checkTargetsNearby'][state.currWorkerID]) {
			// HACK: writes state directly; needs to be changed

			// Update location(s) & composition(s) of active combat force(s) -- TEMPORARY IMPLEMENTATION
			const mainForceLocation = groundForces.getForceMedianLocation(0);
			state.forceLocation = mainForceLocation;

			if (defined(state.forceLocation)) {
				state.nearbyGroundTargets = intelligence.proposeTargetsInRadius({state: state, loc: state.forceLocation, searchRadius: 25, immediateRadius: 10});		
				if (SHOW_SCHEDULED) debug(`${gameTime}:		intel_checkTargetsNearby; updated targets + force loc`);
			} else {
				if (SHOW_SCHEDULED) debug(`${gameTime}:		intel_checkTargetsNearby; updated force loc only`);
			}
		}

		if (state.WORKER_IDS['intel_checkCampaignStatus'][state.currWorkerID]) {
			if (SHOW_SCHEDULED) debug(`${gameTime}:		intel_checkCampaignStatus`);
			// hack: writes to state (campaignStatus) directly
			
			// ADVANCE CAMPAIGN BASED ON GAME STATE
			let event = undefined;
			if (groundForces.completedForceBuildup()) {
				event = 'CompletedBuildup';
			}
			if (groundForces.completedStagingForAttack()) {
				event = 'CompletedStaging';
			}
			if (defined(event)) {
				const currCampaignStatus = this.getCampaignStatus();
				this.updateCampaignStatus(event);
				const newCampaignStatus = this.getCampaignStatus();
				if (newCampaignStatus !== currCampaignStatus) {
					debug(`Campaign event detected: ${event}, campaign status updated to: ${this.getCampaignStatus()}`);
				}	
				
				if (newCampaignStatus === CAMPAIGN_STATUS.MAIN_ASSAULT) {
					// then cancel all raid missions
				}
			}
		}
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
		if (approvedSectorOilCapTasks.length >= 1) {
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
			if (assignedTrucks.every(truck => distance(truck, dangerousSector) > 10)) {
				// debug(`Cancelling mission ${currMission.id} in sector ${currMission.sectorID} due to high threat`);
				currMission.missionStatus = MISSION_STATUS.ABORT;
			}
		}
	}

	runConstructionTasks(state) {

		// Sector oil
		const sectorOilCaptureBuildTasks = engineering.requestOilCapture(state);
		const baseBuildTasks = engineering.requestBaseConstruction(state);
		const sectorDefenceBuildTasks = engineering.requestSectorDefenceConstruction(state);	

		const approvedTasks = this.prioritiseConstructionTasks(sectorOilCaptureBuildTasks, baseBuildTasks, sectorDefenceBuildTasks, undefined, state);
		this.toc.assignConstructionTasks({approvedTasks: approvedTasks, state: state});
	
		this.abortDangerousConstructionTasks(state);
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