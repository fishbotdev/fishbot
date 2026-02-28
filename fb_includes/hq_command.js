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
		// Campaign
		this.campaignStatus = CAMPAIGN_STATUS.BUILDUP;	
		
		this.toc = new TacticalOperationsCenter();

		this.oilDominance = false;
		this.OIL_DOMINANCE_PERCENTAGE = 55;

		this.RECON_COOLDOWN_TIME = 1900;		// this number depends on FishBot's ticks, FishBot need to perform a full number of cycles
		this.lastConductedRecon = -2 * this.RECON_COOLDOWN_TIME;
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
	prioritiseGroundTargets(state, objectList, groupPosition) {

		if (objectList.length === 0) {
			return [];
		}

		let groundTargetObjects = [];

		const NEARBY_RANGE = 10;
		let nearbyObjects = objectList.filter(obj => distSq(obj.x, groupPosition.x, obj.y, groupPosition.y) <= NEARBY_RANGE ** 2);

		// Sort nearest objects by closest to furthest
		nearbyObjects.sort((a, b) => distSq(a.x, groupPosition.x, a.y, groupPosition.y) - distSq(b.x, groupPosition.x, b.y, groupPosition.y));

		groundTargetObjects.push(...nearbyObjects);

		// FIRE SUPPORT TARGETS
		const nearbyCyborgs = nearbyObjects.filter(o => o.droidType === DROID_CYBORG);
		const nearbyIndirectFires = nearbyObjects.filter(o => o.hasIndirect === true);
		const nearbyAirDefences = nearbyObjects.filter(o => isAntiAirDefense(o));
		const nearbyStaticDefences = nearbyObjects.filter(o => 
			o.stattype === DEFENSE && 
			!nearbyAirDefences.includes(o) && 
			!nearbyIndirectFires.includes(o));

		const ECONOMY_STRUCTURES = [FACTORY, VTOL_FACTORY, CYBORG_FACTORY, RESOURCE_EXTRACTOR];	
		const economyTargets = nearbyObjects.filter(o => ECONOMY_STRUCTURES.includes(o.stattype));

		const fireSupportTargets = [...nearbyCyborgs, ...nearbyIndirectFires, ...nearbyAirDefences, ...nearbyStaticDefences, economyTargets];

		// Lazily evaluate far objects
		if (nearbyObjects.length <= 3) {
			let farObjects = objectList.filter(obj => !nearbyObjects.includes(obj));
			farObjects.sort((a, b) => distSq(a.x, groupPosition.x, a.y, groupPosition.y) - distSq(b.x, groupPosition.x, b.y, groupPosition.y));	
			groundTargetObjects.push(...farObjects);
		}

		if (false) { 
			debug(``);
			const nearestTargets = objectList.slice(0, 3);
			nearestTargets.forEach(t => debug(`	target: ${t.obj.name} - ${t.obj.x} ${t.obj.y}`));
		}
		
		return {"fireSupportTargets": fireSupportTargets, "directFireTargets": groundTargetObjects, "nearbyEnemyUnitCount": nearbyObjects.length};
	}

	abortDangerousVTOLMissions(state, mainForceLocation, antiAirDefences) {

		const activeMissions = this.toc.getActiveAviationMissions(state);

		for (let i=0; i<activeMissions.length; i++) {
			let currMission = activeMissions[i];

			if (!defined(currMission.obj)) {
				continue;
			}

			// Note: the game object "currMission.obj" does not have an updated x, y, so we update it here 
			// (TEMPORARY, WILL BE MOVED TO OTHER FUNCTION WHICH UPDATES GAME OBJECTS IN GENERAL ONCE TARGET LISTS ARE UNIFIED)
			const updatedGameObj = getObject(currMission.obj.type, currMission.obj.player, currMission.obj.id);
			currMission.obj = updatedGameObj;
			if (!defined(updatedGameObj)) {
				continue;		// mission management will terminate the mission naturally if the game object no longer exists
			}

			const RISK_RADIUS_SQ = 14 ** 2;
			if (distSq(currMission.obj.x, mainForceLocation.x, currMission.obj.y, mainForceLocation.y) > RISK_RADIUS_SQ) {

				const nearHighRiskArea = antiAirDefences.some(t => 
					distSq(t.x, currMission.obj.x, t.y, currMission.obj.y) <= RISK_RADIUS_SQ);

				if (nearHighRiskArea) {
					// debug(`cancelling airstrike - obj: ${currMission.obj.name} @ ${currMission.obj.x} ${currMission.obj.y}`);
					currMission.missionStatus = MISSION_STATUS.ABORT;
				}
			}

		}
	}

	prioritiseAviationTargets(state, nearbyEnemyUnitCount, airRaidTargets, casTargets, enemyBaseTargets) {
		let aviationTargets = [...airRaidTargets];

		if (!this.oilDominance || enemyBaseTargets["antiAirTargets"].length >= 4) {
			if (airRaidTargets.length === 0 || nearbyEnemyUnitCount >= 2) {
				aviationTargets = [...casTargets, ...airRaidTargets];
			}
		} else {
			if (enemyBaseTargets["antiAirTargets"].length >= 2) {
				aviationTargets = [...enemyBaseTargets["antiAirTargets"], ...casTargets, ...enemyBaseTargets["economyTargets"], ...airRaidTargets];
			} else {
				aviationTargets = [...casTargets, ...enemyBaseTargets["economyTargets"], ...enemyBaseTargets["antiAirTargets"],  ...airRaidTargets];
			}
		}

		return aviationTargets;
	}
	
	runCombatOperations(state) {

		if (!this.oilDominance) {
			this.oilDominance = intelligence.getOilDominanceStatus(state, this.OIL_DOMINANCE_PERCENTAGE);
			if (this.oilDominance) {
				debug(`oil dominance at: ${getCurrGameTime()} ms.`)
			}
		}

		const campaignStatus = this.getCampaignStatus();

		intelligence.updateCurrTargets(state);

		// GROUND FORCES
		const mainForceLocation = groundForces.getForceMedianLocation();
		let nearbyLandTargets = [];

		const readyToAttack = campaignStatus === CAMPAIGN_STATUS.MAIN_ASSAULT || campaignStatus === CAMPAIGN_STATUS.STAGING;

		let casTargets = [];
		let nearbyEnemyUnitCount = 0;

		if (readyToAttack) {

			// Get targets efficiently
			nearbyLandTargets = intelligence.getLandTargetsAround({state: state, position: mainForceLocation, searchRadius: 15});
			if (nearbyLandTargets.length === 0) {
				// debug(`runCombatOperations(): used expensive getAllTargets @ ${getCurrGameTime()}`);
				nearbyLandTargets = intelligence.getAllTargets({state: state}) 	
			}

			const groundTargets = this.prioritiseGroundTargets(state, nearbyLandTargets, mainForceLocation);

			// Ground attack; HACK: directly calls tactical level function
			groundForceAttack({state: state, groundTargets: groundTargets["directFireTargets"], fireSupportTargets: groundTargets["fireSupportTargets"]});		

			nearbyEnemyUnitCount = groundTargets["nearbyEnemyUnitCount"];
		}

		// AVIATION
		let airRaidTargets = intelligence.getAirRaidTargets(state);
		casTargets = intelligence.getCASTargets(mainForceLocation, nearbyLandTargets);

		let enemyBaseTargets = {"antiAirTargets": [], "economyTargets": []};
		if (casTargets.length === 0 && airRaidTargets.length === 0 && readyToAttack) {
			// debug(`runCombatOperations(): used expensive getAllEnemyBaseTargets @ ${getCurrGameTime()}`);
			// enemyBaseTargets = intelligence.getAllEnemyBaseTargets(state);		
		}		
		
		const aviationTargets = this.prioritiseAviationTargets(state, nearbyEnemyUnitCount, airRaidTargets, casTargets, enemyBaseTargets);

		const attackInGroup = true;
		this.toc.assignAviationTargets(aviationTargets, attackInGroup, state);					

		if (!this.oilDominance || enemyBaseTargets["antiAirTargets"].length >= 5) {
			this.abortDangerousVTOLMissions(state, mainForceLocation, enemyBaseTargets["antiAirTargets"]);
		}
	}


	/////////////////////////////////////////////////// INTELLIGENCE ///////////////////////////////////////////////////

	issueIntelTasking(intelTasks) {
		const currTime = getCurrGameTime();
		if (currTime - this.lastConductedRecon > this.RECON_COOLDOWN_TIME) {
			if (false) debug(`issueIntelTasking(): scheduling recon -> ${currTime}`);
			this.lastConductedRecon = currTime;

			// automatic approval of intel tasks
			return intelTasks;
		} else {
			return [];
		}
	}

	runSectorIntel(state) {
		const intelTasks = intelligence.requestCollection(state);						// g2-intelligence: this proposes targets to recon
		const approvedIntelTasks = this.issueIntelTasking(intelTasks);			// hq: this selects targets from that list to recon

		if (approvedIntelTasks.length > 0) {
			this.toc.assignReconMissions({reconTasks: approvedIntelTasks, state: state});					// hq/toc: this translates orders (previous step) into missions
			const observations = this.toc.getCompletedIntelMissionReports();				// hq/toc: gets completed data (intelligence reports)
			this.toc.compileIntelIntoCOP(observations, state);								// hq/toc: processes intelligence reports & updates state ("Common Operational Picture")

			this.toc.updateHighRiskSectors(state);
		}
	}


	/////////////////////////////////////////////////// CONSTRUCTION ///////////////////////////////////////////////////

	/**
	 * Approves requested tasks based on game state & generates approved buildTasks for TOC execution 
	 * @param {*} requestedSectorOilCapTasks 
	 * @param {*} requestedBaseBuildTasks 
	 * @param {*} requestedSectorDefenceBuildTasks 
	 * @param {*} sectorIndirectFireBuildTasks 
	 * @param {*} state 
	 * @returns 
	 */
	issueConstructionTasking(requestedSectorOilCapTasks, requestedBaseBuildTasks, requestedSectorDefenceBuildTasks, sectorIndirectFireBuildTasks, state) {

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


		/////// OFFENSIVE STRUCTURE CONSTRUCTION ///////
		// sectorIndirectFireBuildTasks.forEach(l => debug(`requesting building mortar / sensor around ${l.payload.x}, ${l.payload.y}`));
		// approvedConstructionTasks.push(...sectorIndirectFireBuildTasks.slice(0, 2));
		
		return approvedConstructionTasks;
	}

	/**
	 * Cancel tasks where the area is now dangerous but the units are far away (> 10 tiles away).
	 * @param {Object} state - Game state (from FishBot's perspective).
	 * @returns {void}
	 */
	abortDangerousConstructionTasks(state) {
		
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

	runConstructionTasks() {

		// Sector oil
		const sectorOilCaptureBuildTasks = engineering.requestOilCapture(state);
		const baseBuildTasks = engineering.requestBaseConstruction(state);
		const sectorDefenceBuildTasks = engineering.requestSectorDefenceConstruction(state);	

		const approvedTasks = this.issueConstructionTasking(sectorOilCaptureBuildTasks, baseBuildTasks, sectorDefenceBuildTasks, undefined, state);
		this.toc.assignConstructionTasks({approvedTasks: approvedTasks, state: state});
	
		this.abortDangerousConstructionTasks(state);
	}

	runIntel() {
		/*
			INTELLIGENCE OPERATIONS
		*/
		this.runSectorIntel(state);		
	}

	runCombat() {
		/*
			COMBAT OPERATIONS
		*/
		this.runCombatOperations(state);
	}

	runSustainment() {
		/*
			COMBAT SUSTAINMENT
		*/

		if (gameHasEnded()) {
			return;		// STOP ALL OTHER FUNCTIONS IF GAME IS ENDED
		}

		// Production
		supply.manageProduction();
		// Research
		research.manageResearch();
		// Construction
		this.runConstructionTasks();


		// Executes all bot actions
		this.toc.manageMissions(state);														


		/*
			ADVANCE CAMPAIGN BASED ON GAME STATE
		*/

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