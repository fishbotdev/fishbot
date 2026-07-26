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
 * This file implements FishBot's *strategic* layer.
 * 
 * All of FishBot's reasoning and decision-making functions are implemented here:
 * 	- runIntelligence (gathers information from the map & stores in `state`)
 * 	- runCombatOperations (directs combat units to move around)
 * 	- runConstructionLogistics (directs trucks to build / demolish stuff)
 * 	- runResupplyLogistics (assigns newly produced units into combat groups)
 * 	- runProductionLogistics (directs factories to build new units depending on supply requirements)
 * 	- runResearchLogistics (directs labs to research)
 * 
 * Architecture notes:
 * The functions in this class:
 * - Have the authority to write to the global state (but the state writing is delegated to `hq_toc.js`)
 * - Should make decisions on what course of action to take, but should handle no direct execution (this should be delegated to other functions)
 * - Should make decisions informed by courses of action proposed by the staff functions `hq_gX_Y`.
 * This models how a HQ at divisional level is structured in real life. Much of the terminology in this bot is borrowed from the real world.
 */
class CommandCenter {
	constructor() {

		this.toc = new TacticalOperationsCenter();

		/*
			This constructor is intended to contain *all* FishBot parameters which change how it behaves.
		*/

		// Strategic parameters
		this.OIL_DOMINANCE_PERCENTAGE = 60;
		this.TARGET_SEARCH_RADIUS = 25;

		// Production logistics parameters
		this.MAX_TRUCKS = 8;

		this.FISHBOT_BRIGADE_COMPOSITION = {
			'MAX_HEAVY_CAVALRY': 3,
			'MAX_LIGHT_CAVALRY': 3,
			'MAX_MORTAR': 4,
			'MAX_ADA': 2,
			'MAX_SENSOR': 1,
			'MAX_INFANTRY': 6,
			'MAX_REPAIR': 1,
		}
		this.TOTAL_UNITS_PER_BRIGADE = Object.values(this.FISHBOT_BRIGADE_COMPOSITION).reduce((a, b) => a + b, 0);

		this.NUMBER_OF_BRIGADES = 4;
		this.BRIGADE_DESIGNATIONS = BRIGADE_IDS.slice(0, this.NUMBER_OF_BRIGADES);

		this.FISHBOT_RESERVE_COMPOSITION = {
			// for DIVISION.BCT_RESERVE
			'MAX_HEAVY_CAVALRY': Math.ceil(this.FISHBOT_BRIGADE_COMPOSITION['MAX_HEAVY_CAVALRY'] * this.NUMBER_OF_BRIGADES / 2),
			'MAX_LIGHT_CAVALRY': Math.ceil(this.FISHBOT_BRIGADE_COMPOSITION['MAX_LIGHT_CAVALRY'] * this.NUMBER_OF_BRIGADES / 2),
			'MAX_MORTAR': 3,
			'MAX_ADA': this.FISHBOT_BRIGADE_COMPOSITION['MAX_ADA'],
			'MAX_SENSOR': 1,
			'MAX_INFANTRY': Math.ceil(this.FISHBOT_BRIGADE_COMPOSITION['MAX_INFANTRY'] * this.NUMBER_OF_BRIGADES / 2),
			'MAX_REPAIR': 1
		};
		this.TOTAL_RESERVE_UNITS = Object.values(this.FISHBOT_RESERVE_COMPOSITION).reduce((a, b) => a + b, 0);

		this.VEHICLE_REPAIR_THRESHOLD = 30;
		this.CYBORG_REPAIR_THRESHOLD = 45;
		
		// Task scheduling parameters
		// Add regular, high priority, high computational load tasks to the start of the list.
		// The naming convention is important as this allows the handlers in _run.js to run the correct function.
		// e.g. label intelligence tasks with 'intel_'.
		this.REQUESTS_PER_MINUTE = {
			'combat_runC2': 60,
			'global_missionManager': 60,
			'logistics_runConstruction': 60,
			'logistics_runResupplyLogistics': 30,
			'intel_getNearbyGroundTargets': 20,
			'logistics_runStructureLogistics': 15,
			'intel_getMapIntelligence': 12,
			'intel_getAviationTargets': 10,
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
		// i.e. tactical functions may be called directly where appropriate

		switch(taskID) {

			case 'intel_checkOilDominance':
				const isOilDominant = checkOilDominance(state, this.OIL_DOMINANCE_PERCENTAGE);
				this.toc.setOilDominanceStatus(state, isOilDominant);
				break;
			
			case 'intel_getNearbyGroundTargets':
				// Update location(s) & target(s) of active combat force(s)
				this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
					const brigadeLocation = groundForces.getForceMedianLocation(brigadeID);
					this.toc.setBrigadeLocation(state, brigadeID, brigadeLocation);

					const nearbyTargets = intelligence.getTargetClassesInRadius(state, brigadeLocation, this.TARGET_SEARCH_RADIUS);
					this.toc.addBrigadeTargets(state, brigadeID, nearbyTargets);
				});
				break;

			case 'intel_getAviationTargets':
				const raidTargets = intelligence.getTargetsNearDerricks(state);
				const baseTargets = intelligence.getBaseTargets(state);
				this.toc.setAviationTargets(
					state, 
					raidTargets, 
					baseTargets['productionTargets'], 
					baseTargets['adaTargets'],  
					baseTargets['indirectFireTargets'],  
					baseTargets['defensiveStructureTargets']
				);
				break;

			case 'intel_getMapIntelligence':
				const rawObjectData = getDroidsAndStructsByPlayer();
				this.toc.updateCoreIntel(state, rawObjectData);
				break;
				
			default:
				debug(`	WARNING / runIntelligence(): could not understand ${taskID} @ ${gameTime}`);
				return;
		}
	
	}

	/////////////////////////////////////////////////// G3: COMBAT OPERATIONS ///////////////////////////////////////////////////

	/**
	 * Returns `true` if all of the sublists of a target array are empty, else `false`.
	 * @param {BrigadeTargets | NearbyTargets} targetArray 
	 * @returns {boolean}
	 */
	#noTargetsAvailable(targetArray) {
		for (const metadata of Object.values(targetArray)) {
			if (Array.isArray(metadata)) {
				if (metadata.length !== 0) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * This function returns a list of prioritised Droid / Structure Objects (fresh data) which can be directly used in the `__tac` functions.
	 * @param {worldState} state 
	 * @param {number} brigadeID 
	 * @returns {BrigadeTargets} Intent: (DroidObject | StructureObject)[]	
	 */
	#prioritiseBrigadeTargets(state, brigadeID) {

		/** @type {BrigadeTargets} */
		const brigadeTargets = {
			"directFireTargets": [], 
			"fireSupportTargets": [],
			"adaTargets": [], 
			"casTargets": [],
		};

		const brigadeInfo = state.brigades[brigadeID]; 
		const POSITION = brigadeInfo['location'];
		const TARGETS = brigadeInfo['nearbyTargets'];		

		if (this.#noTargetsAvailable(TARGETS)) {
			return brigadeTargets;
		}

		/**
		 * Gets a fresh object list.
		 * @param {FbObject[]} targetObjectList
		 * @returns {(StructureObject | DroidObject | FeatureObject)[]}
		 */
		const getObjectList = (targetObjectList) => {
			const objectList = [];
			targetObjectList.forEach(t => {
				const obj = getObject(t.type, t.player, t.id);
				if (obj != null) {
					objectList.push(obj);
				}
			});
			return objectList;
		}

		const enemyArmor = getObjectList(TARGETS['enemyArmor']);
		const enemyInfantry = getObjectList(TARGETS['enemyInfantry']);
		const enemyIndirectFire = getObjectList(TARGETS['enemyIndirectFire']);
		const enemyADA = getObjectList(TARGETS['enemyADA']);
		const enemyConstructor = getObjectList(TARGETS['enemyConstructor']);
		const enemyIndustrial = getObjectList(TARGETS['enemyIndustrial']);
		const enemyUtility = getObjectList(TARGETS['enemyUtility']);
		const enemyDefenses = getObjectList(TARGETS['enemyDefenses']);

		const x = POSITION.x;
		const y = POSITION.y;
		
		/** @param {DroidObject | StructureObject | FeatureObject} obj */
		const outsideOfRadius = (obj, radius) => {
			const d = distSq(obj.x, x, obj.y, y);		
			if (d > radius ** 2) {		
				return true;
			} else {
				return false;
			}
		}

		// Direct Fire Targeting
		const IMMEDIATE_RADIUS = 8;

		const directFireHeuristic = (a,b) => {
			const aDist = distSq(x, a.x, y, a.y);
			const bDist = distSq(x, b.x, y, b.y);

			const MIN_DIRECT_FIRE_RANGE_SQ = 16 ** 2;
			if (aDist > MIN_DIRECT_FIRE_RANGE_SQ || bDist > MIN_DIRECT_FIRE_RANGE_SQ) {
				return aDist - bDist;
			}

			const al = drawLine(x, y, a.x, a.y);
			const bl = drawLine(x, y, b.x, b.y);

			let aDetour = 1, bDetour = 1;

			for (let i=0; i<al.length; i++) {
				const point = al[i];
				const terrainType = MapTiles[point[1]][point[0]].terrainType;
				if (terrainType	=== TER_CLIFFFACE || terrainType === TER_WATER) {
					aDetour++;
					break;
				}
			};
			
			for (let i=0; i<bl.length; i++) {
				const point = bl[i];
				const terrainType = MapTiles[point[1]][point[0]].terrainType;
				if (terrainType	=== TER_CLIFFFACE || terrainType === TER_WATER) {
					bDetour++;
					break;
				}
			};

			return aDetour * aDist - bDetour * bDist;
		}

		const primaryDroidTargets = [...enemyArmor, ...enemyInfantry, ...enemyDefenses];
		const secondaryDirectFireTargets = [...enemyIndirectFire, ...enemyADA, ...enemyIndustrial];
		const tertiaryDirectFireTargets = [...enemyConstructor, ...enemyUtility];

		const targetsOutOfRange = [];		// this will also be ordered in the priority order specified in `primaryDirectFireTargets`

		/** @param {(DroidObject | StructureObject | FeatureObject)[]} targetList */
		const addDirectFireTargetByProximity = (targetList) => {
			targetList.forEach(obj => {
				if (outsideOfRadius(obj, IMMEDIATE_RADIUS)) {
					targetsOutOfRange.push(obj);
				}
				brigadeTargets["directFireTargets"].push(obj);
			});
		};

		addDirectFireTargetByProximity(primaryDroidTargets);
		addDirectFireTargetByProximity(secondaryDirectFireTargets);
		addDirectFireTargetByProximity(tertiaryDirectFireTargets);

		brigadeTargets["directFireTargets"].sort((a,b) => directFireHeuristic(a,b));		// this ignores the primary/secondary/tertiary ordering above

		const MAX_DIRECT_FIRE_TARGETS = 8;
		const FURTHER_TARGETS_REQUIRED = MAX_DIRECT_FIRE_TARGETS - brigadeTargets['directFireTargets'].length;
		if (FURTHER_TARGETS_REQUIRED > 0) {
			brigadeTargets['directFireTargets'].push(...targetsOutOfRange.slice(FURTHER_TARGETS_REQUIRED));
		}

		if (false) {
			// Draw lines to the top 3 targets (to see what the brigade is trying to attack)
			for (let i=0; i<4; i++) {
				if (i >= brigadeTargets['directFireTargets'].length) {
					break;
				}

				const target = brigadeTargets['directFireTargets'][i];
				const lineToTarget = drawLine(x, y, target.x, target.y);

				for (let j=0; j<lineToTarget.length; j++) {
					const point = lineToTarget[j];
					// if (MapTiles[point.y][point.x].terrainType === 7 || MapTiles[point.y][point.x].terrainType === 8) {
					// 	// water or cliff; hack
					// 	break;
					// }
					hackMarkTiles(point[0], point[1]);		
				}
			}
		}

		// Fire Support Targeting
		// Intent: Suppress enemy infantry (FishBot is vulnerable to massed cyborgs) then destroy indirect fires, defences & ADA.
		const EFFECTIVE_FIRE_SUPPORT_RADIUS = 18;

		const primaryIndirectFireTargets = [...enemyInfantry, ...enemyDefenses, ...enemyIndirectFire, ...enemyADA, ...enemyIndustrial, ...enemyArmor];
		primaryIndirectFireTargets.sort((a,b) => directFireHeuristic(a,b));
		const secondaryIndirectFireTargets = [...enemyConstructor, ...enemyUtility];

		primaryIndirectFireTargets.forEach(obj => {
			if (outsideOfRadius(obj, EFFECTIVE_FIRE_SUPPORT_RADIUS)) {
				// targetsOutOfRange.push(obj);
				return;
			}
			brigadeTargets["fireSupportTargets"].push(obj);
		});

		secondaryIndirectFireTargets.forEach(obj => {
			if (outsideOfRadius(obj, EFFECTIVE_FIRE_SUPPORT_RADIUS)) {
				// targetsOutOfRange.push(obj);
				return;
			}
			brigadeTargets["fireSupportTargets"].push(obj);
		});		

		// CAS Targeting (Close Air Support)
		// Intent: `casTargets` should be a list of mission requests interpretable by a following call of `#prioritiseAviationTargets`.
		const primaryCASTargets = [...enemyIndirectFire, ...enemyADA];
		const secondaryCASTargets = [...enemyArmor, ...enemyDefenses];

		const isHealthy = (obj) => obj.health > 25;
		secondaryCASTargets.forEach(obj => {
			if (isHealthy(obj)) {
				brigadeTargets['casTargets'].unshift(aviation.translateIntoCASRequest(obj, MISSION_PRIORITY.VERY_HIGH));
			} else {
				brigadeTargets['casTargets'].push(aviation.translateIntoCASRequest(obj, MISSION_PRIORITY.HIGH));
			}			
		});

		primaryCASTargets.forEach(obj => {
			const missionRequest = aviation.translateIntoCASRequest(obj, MISSION_PRIORITY.URGENT); 
			brigadeTargets['casTargets'].unshift(missionRequest);
		});


		// ADA Targeting (Air Defense Artillery)
		// Intent: Concentrate fire on one target.
		const EFFECTIVE_ADA_RADIUS = 14;

		const enemyAircraft = getObjectList(TARGETS['enemyAviation']);		// todo: remove if no ADA available
		enemyAircraft.forEach(obj => {
			if (outsideOfRadius(obj, EFFECTIVE_ADA_RADIUS)) return;
			if (obj.isFlying !== true) return;
			brigadeTargets["adaTargets"].push(obj);
		});		
		brigadeTargets["adaTargets"].sort((a,b) => a.health - b.health);			

		return brigadeTargets;
	}

	/**
	 * This function returns a list of prioritised Droid / Structure Objects (fresh data) which can be directly used in the `__tac` functions.
	 * @param {worldState} state 
	 * @returns {(AirStrikeMissionRequest)[]}	
	 */
	#prioritiseAviationTargets(state) {

		const airRaidTargets = state.aviationTargets['raidTargets'];
		const industrialTargets = state.aviationTargets['productionTargets'];
		const adaTargets = state.aviationTargets['adaTargets'];
		const indirectFireTargets = state.aviationTargets['indirectFireTargets'];
		const defensiveStructureTargets = state.aviationTargets['defensiveStructureTargets'];

		/** @type {PositionInfo[]} */
		const GROUP_POSITIONS = [];
		/** @type {AirStrikeMissionRequest[]} */
		const CAS_MISSION_REQUESTS = [];

		let maxCasTargets = 0;

		const BRIGADES = state.brigades;
		this.BRIGADE_DESIGNATIONS.forEach(id => {
			GROUP_POSITIONS.push(BRIGADES[id]['location']);

			const casStrikeRequests = BRIGADES[id]['casStrikeRequests'];
			maxCasTargets = Math.max(maxCasTargets, casStrikeRequests.length);
			CAS_MISSION_REQUESTS.push(...casStrikeRequests);
		});

		const NUM_URGENT_CAS_MISSIONS = CAS_MISSION_REQUESTS.filter(r => r.priority === MISSION_PRIORITY.URGENT).length;
		CAS_MISSION_REQUESTS.sort((a, b) => b.priority - a.priority);

		
		const aviationTargets = [];
		let targetCandidates = [];
		
		const adaThreat = state.fields.adaThreat;
		const cellSize = state.grid.cellSize;
		const IS_OIL_DOMINANT = state.oilDominance;
		const NUM_AIRCRAFT = state.playerInfo[me].numAirUnits;	
		const AIR_UNIT_DOMINANCE = NUM_AIRCRAFT >= 10;
		// const AIR_UNIT_SHORTAGE = NUM_AIRCRAFT === 1;
		
		const prioritiseCasTargets = NUM_URGENT_CAS_MISSIONS >= 1 || maxCasTargets >= 4;
		const prioritiseRaidTargets = !IS_OIL_DOMINANT;
		const prioritiseIndustrialTargets = IS_OIL_DOMINANT;
		const SATURATION_RAID = prioritiseIndustrialTargets && AIR_UNIT_DOMINANCE;		// Saturation raid = an attack designed to overwhelm defenses

		// const minAircraft = (AIR_UNIT_SHORTAGE && !IS_OIL_DOMINANT) ? 1 : 2;

		adaTargets.forEach(t => {
			t.numAircraft = 3;
		});

		const casPriorityTargets = [...CAS_MISSION_REQUESTS, ...airRaidTargets];
		const raidPriorityTargets = [...airRaidTargets, ...CAS_MISSION_REQUESTS];

		if (prioritiseIndustrialTargets) {

			if (prioritiseCasTargets) {
				targetCandidates = [...CAS_MISSION_REQUESTS, ...adaTargets, ...indirectFireTargets, ...defensiveStructureTargets, ...industrialTargets, ...airRaidTargets];
			} else {
				// Pure industrial strike
				if (SATURATION_RAID) {
					targetCandidates = [...adaTargets, ...industrialTargets, ...indirectFireTargets, ...defensiveStructureTargets, ...casPriorityTargets];
				} else {
					targetCandidates = [...industrialTargets, ...indirectFireTargets, ...adaTargets, ...defensiveStructureTargets, ...casPriorityTargets];			
				}
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

		const activeMissions = this.toc.getActiveAviationMissions(state).filter(m => OFFENSIVE_MISSION_TYPES.includes(m.missionType));

		const activeTargetIDs = [];

		/*
			Set no-fly regions; 
				0 = avoids all anti-air defences, 
				0.69 > 0.33 * 2 = allow 1 tile over from a single air defence. 
			Modify value to match "hq_toc/updateSpatialFields" filter.
		*/
		const STANDARD_THREAT_THRESHOLD = IS_OIL_DOMINANT ? 0.69 : 0;		
		const URGENT_THREAT_THRESHOLD = 2;
		
		for (let i=0; i<activeMissions.length; i++) {
			let c = activeMissions[i];
			activeTargetIDs.push(c.target.id);

			const currObj = getObject(c.target.type, c.target.player, c.target.id);
			if (currObj == null) {
				continue;
			}

			if (prioritiseCasTargets && c.missionType !== MISSION_TYPE.CAS_STRIKE) {
				// debug(`removed DAS / RAID mission to make room for CAS`);
				c.missionStatus = MISSION_STATUS.ABORT;
				continue;
			}

			if (!SATURATION_RAID) {
				const gx = Math.floor(currObj.x / cellSize); 
				const gy = Math.floor(currObj.y / cellSize);

				const threatThreshold = (c.priority === MISSION_PRIORITY.URGENT) ? URGENT_THREAT_THRESHOLD : STANDARD_THREAT_THRESHOLD;

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
		
		// Remove already active missions
		let newAviationTargets = [], existingAviationTargets = [];

		for (let i=0; i<targetCandidates.length; i++) {
			const missionRequest = targetCandidates[i];

			const c = missionRequest.target;

			const threatThreshold = (missionRequest.priority === MISSION_PRIORITY.URGENT) ? URGENT_THREAT_THRESHOLD : STANDARD_THREAT_THRESHOLD;

			if (!SATURATION_RAID) {
				const gx = Math.floor(c.x / cellSize); 
				const gy = Math.floor(c.y / cellSize);
				if (adaThreat[gx][gy] > threatThreshold) {
					// debug(`	removed CANDIDATE, adaThreat: ${c.name} @ grid (${c.x} ${c.y})`);
					continue;
				}
			}

			if (activeTargetIDs.includes(c.id)) {
				existingAviationTargets.push(missionRequest);
			} else {
				newAviationTargets.push(missionRequest);
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
	 * Directs brigades to maneuver to and attack land targets, as well as directing aircraft to support land efforts.
	 * @param {worldState} state 
	 */
	runCombatOperations(state) {

		const READY_TO_ATTACK = groundForces.isReadyToAttack(state);

		if (READY_TO_ATTACK) {

			const brigadeLocations = [];

			// Move combat brigades
			if (DEBUG_MODE_ON) hackMarkTiles();		

			this.BRIGADE_DESIGNATIONS.forEach((brigadeID) => {

				const brigadeLocation = state.brigades[brigadeID]['location'];
				brigadeLocations.push(brigadeLocation);

				// const CLOSEST_ENEMY_BASE = intelligence.findClosestEnemyBase(state, brigadeLocation.x, brigadeLocation.y); 			

				const groundTargets = this.#prioritiseBrigadeTargets(state, brigadeID);
				this.toc.setBrigadeCASStrikeRequests(state, brigadeID, groundTargets['casTargets']);

				if (this.#noTargetsAvailable(groundTargets)) {
					const CLOSEST_TARGET = intelligence.findClosestTarget(state, brigadeLocation.x, brigadeLocation.y); 
					if (CLOSEST_TARGET == undefined) {
						moveBrigadeToLocation(state, brigadeID, brigadeLocation.x, brigadeLocation.y);
						return;
					} 
					moveBrigadeToLocation(state, brigadeID, CLOSEST_TARGET.x, CLOSEST_TARGET.y);
					return;
				}
				
				moveBrigadeToAttack(state, brigadeID, groundTargets);				
			});

			// Manage reserves
			// Temporary: Move reserves to pre-emptively reinforce BCT0
			const reserveGroupIDs = [DIVISION.HEAVY_CAV_RESERVE, DIVISION.LIGHT_CAV_RESERVE, DIVISION.INFANTRY_RESERVE, DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, DIVISION.SENSOR_RESERVE, DIVISION.AIR_DEFENCE_RESERVE, DIVISION.MAINTENANCE_RESERVE];
			const x = brigadeLocations[0].x;
			const y = brigadeLocations[0].y;
			moveReservesToShadow(reserveGroupIDs, x, y);
		}

		const aviationTargets = this.#prioritiseAviationTargets(state);

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
		let activeOilCapTaskIDs = [];
		let activeBaseBuildTasks = []; 
		let activeDefenceBuildTaskIDs = [];
		let activeRepairCenterBuildTaskIDs = [];
		let activeRemoteMissions = [];

		this.toc.getActiveConstructionMissions(state).forEach(missionData => {
			switch(missionData.missionType) {
				case MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR:
				case MISSION_TYPE.CONSTRUCT_OIL_DERRICK:
					activeOilCapTaskIDs.push(missionData.sectorID);	
					activeRemoteMissions.push(missionData);	
					break;
				case MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE:
				case MISSION_TYPE.CONSTRUCT_SINGLE_MODULE:
					activeBaseBuildTasks.push(missionData);	
					break;
				case MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE:
					activeDefenceBuildTaskIDs.push(missionData.sectorID);	
					activeRemoteMissions.push(missionData);
					break;
				case MISSION_TYPE.CONSTRUCT_REPAIR_CENTER:
				case MISSION_TYPE.DEMOLISH_REPAIR_CENTER:
					activeRepairCenterBuildTaskIDs.push(missionData.sectorID);

					// Repair center tasks should not be added to the remoteMissions list because the danger level is set within the hq_g4 function 
					// (so it should not be overwritten by the conservative danger level implemented by abort mission)
					break;
				default:
					// Do nothing / ignore missions like default mission "HELP_CONSTRUCT"
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
		const repairCenterEmptyTaskSlots = MAX_CONCURRENT_REPAIR_CENTER_BUILDS - ACTIVE_REPAIR_CENTER_TASKS;

		if (repairCenterEmptyTaskSlots > 0) {

			const myRepairFacilities = state.playerInfo[me]["repairFacilityFbObjects"];

			const GROUP_POSITIONS = [];
			this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
				GROUP_POSITIONS.push(state.brigades[brigadeID]['location']);
			});

			const options = engineering.generateRemoteServiceCenterConstructionOptions(state, myRepairFacilities, GROUP_POSITIONS);
			const newFacilityLocations = options["newFacilityLocations"];
			const demolitionLocations = options["demolitionLocations"];

			const BELOW_REPAIR_FACILITY_HARD_CAP = myRepairFacilities.length < state.REPAIR_FACILITY_HARD_CAP;

			const NEW_FACILITY_REQUESTED = newFacilityLocations.length !== 0;

			// debug(`	${gameTime}: BELOW_REPAIR_FACILITY_HARD_CAP: ${BELOW_REPAIR_FACILITY_HARD_CAP} (${myRepairFacilities.length} / ${state.REPAIR_FACILITY_HARD_CAP}), NEW_FACILITY_REQUESTED: ${NEW_FACILITY_REQUESTED}`);

			if (NEW_FACILITY_REQUESTED) {
				if (BELOW_REPAIR_FACILITY_HARD_CAP) {
					const approvedRepairCenterConstructionTasks = newFacilityLocations.slice(0, repairCenterEmptyTaskSlots);
					approvedConstructionTasks.push(...approvedRepairCenterConstructionTasks);
				} else {
					const approvedDemolitionTasks = demolitionLocations.slice(0, 1);		// Note: this only takes 1 task (1 demolition at a time)
					// debug(`Demolition approved @ ${approvedDemolitionTasks[0].payload.x} ${approvedDemolitionTasks[0].payload.y}`);
					approvedConstructionTasks.push(...approvedDemolitionTasks);
				}
			}
		}

		// Command delegates assignment 
		this.toc.assignConstructionTasks(state, approvedConstructionTasks);
	}

	/**
	 * 
	 * @param {BrigadeComposition} brigadeComposition 
	 */
	#prioritiseLandVehicleCategory2(brigadeComposition) {
		
		const getMaxUnits = (category) => {
			switch(category) {
				case DIVISION.INFANTRY_RESERVE:
					return this.FISHBOT_BRIGADE_COMPOSITION['MAX_INFANTRY']
				case DIVISION.HEAVY_CAV_RESERVE:
					return this.FISHBOT_BRIGADE_COMPOSITION['MAX_HEAVY_CAVALRY'];
				case DIVISION.LIGHT_CAV_RESERVE:
					return this.FISHBOT_BRIGADE_COMPOSITION['MAX_LIGHT_CAVALRY'];
				case DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE:
					return this.FISHBOT_BRIGADE_COMPOSITION['MAX_MORTAR'];
				case DIVISION.AIR_DEFENCE_RESERVE:
					return this.FISHBOT_BRIGADE_COMPOSITION['MAX_ADA'];
				case DIVISION.SENSOR_RESERVE:
					return this.FISHBOT_BRIGADE_COMPOSITION['MAX_SENSOR'];
				case DIVISION.MAINTENANCE_RESERVE:
					return this.FISHBOT_BRIGADE_COMPOSITION['MAX_REPAIR'];
				default:
					debug(`${gameTime}: prioritiseLandVehicleCategory2() / getMaxUnits(): failed to recognise "${category}". Returning "1".`)
					return 1;
			}
		}

		const getDeficit = (category) => {
			const battalionComposition = brigadeComposition.get(category);
			if (battalionComposition == null) {
				debug(`${gameTime}: WARNING - Attempted to get non-existent 'deficit' for category "${category}". Returning 0.`);
				return 0;
			}
			return battalionComposition["deficit"];
		}

		const getNormDeficit = (category) => getDeficit(category) / getMaxUnits(category);

		const makeCategory = (category, weight) => {
			const normDeficit = getNormDeficit(category);
			return {
				"type": category,
				"normDeficit": normDeficit,
				"w_strategic": weight,
				"score": normDeficit * weight,
			};
		};

		const CATEGORIES = [
			// Weights were tuned in FishBot v0.4.3 to produce a better mix of units.
			// makeCategory(DIVISION.INFANTRY_RESERVE, 1.0),		//
			makeCategory(DIVISION.HEAVY_CAV_RESERVE, 0.8), 
			makeCategory(DIVISION.LIGHT_CAV_RESERVE, 1.0), 
			makeCategory(DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 0.77), 
			makeCategory(DIVISION.AIR_DEFENCE_RESERVE, 0.62),
			makeCategory(DIVISION.SENSOR_RESERVE, 0.4),
			makeCategory(DIVISION.MAINTENANCE_RESERVE, 0.5),
		];

		const FORECAST_STEPS = 15;
		// debug(`Forecasting...`)

		const productionRequests = [];
		for (let i=0; i<FORECAST_STEPS; i++) {
			CATEGORIES.sort((a,b) => b["score"] - a["score"]);

			if (CATEGORIES[0].normDeficit < 1e-6) {		// must account for rounding error
				// debug(`Terminating early @ ${i} iterations`);
				break;		
			}

			productionRequests.push({...CATEGORIES[0]});									// takes a snapshot of the current score

			CATEGORIES[0].normDeficit -= 1 / getMaxUnits(CATEGORIES[0].type);				// simulates the unit being produced
			CATEGORIES[0].score = CATEGORIES[0].normDeficit * CATEGORIES[0].w_strategic;	// updates the score
		}

		if (false) {
			debug(`\t Next ${FORECAST_STEPS} ->`);
			productionRequests.forEach(r => debug(`	${r.type}`));
		}
		
		return productionRequests;
	}	

	#recoverRepairedUnits(state) {
		const repairedUnits = state.g.enumGroup(DIVISION.RETURNING_FOR_REPAIR);
		const REPAIRED_AT_HEALTH = 99;

		repairedUnits.forEach(droid => {
			if (droid.health < REPAIRED_AT_HEALTH) {
				return;
			}
			this.toc.setNewDroidGroup(state, droid, DIVISION.RETURNING_FOR_REPAIR); 	// this sets the new group & removes from "RETURN_FOR_REPAIR"
			// todo: This interface is a bit confusing.
		});
	}

	/**
	 * Gets the number of healthy combat units in a specified BCT (does not include logistic unit counts).
	 * @param {worldState} state 
	 * @param {number} brigadeID
	 * @returns {number} 
	 */
	#getBctCombatUnitCount(state, brigadeID) {
		const brigadeComposition = state.brigades[brigadeID]["composition"]; 
		let unitCount = 0;
		for (const [category, btnComposition] of brigadeComposition) {
			if ([DIVISION.AIR_DEFENCE_RESERVE, DIVISION.SENSOR_RESERVE, DIVISION.MAINTENANCE_RESERVE].includes(category)) {
				continue;
			}
			unitCount += btnComposition["count"];
		}

		return unitCount;
	}

	/**
	 * This function:
	 * - returns repaired units to active duty 
	 * - assigns reserve units to active brigade combat teams
	 * - assigns damaged units for repair (if the BCT is powerful enough)
	 * @param {worldState} state 
	 * @returns {void}
	 */
	runResupplyLogistics(state) {

		// Return repaired units back into the reserve force
		this.#recoverRepairedUnits(state);		

		// Update brigade supply status
		const brigadeUnitCount = new Map();
		this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
			this.toc.updateBrigadeSupplyStatus(state, brigadeID, this.FISHBOT_BRIGADE_COMPOSITION, this.VEHICLE_REPAIR_THRESHOLD, this.CYBORG_REPAIR_THRESHOLD);

			brigadeUnitCount.set(brigadeID, this.#getBctCombatUnitCount(state, brigadeID));
		});

		this.toc.updateBrigadeSupplyStatus(state, DIVISION.BCT_RESERVE, this.FISHBOT_RESERVE_COMPOSITION, this.VEHICLE_REPAIR_THRESHOLD, this.CYBORG_REPAIR_THRESHOLD);

		const REPAIR_FACILITY_AVAILABLE = state.playerInfo[me]["repairFacilityFbObjects"].length > 0;		// this has the potential to be stale, but it is not critical that it is up-to-date

		// Get reserve force units
		const RESERVE_GROUP_IDS = [
			DIVISION.HEAVY_CAV_RESERVE, 
			DIVISION.LIGHT_CAV_RESERVE, 
			DIVISION.INFANTRY_RESERVE, 
			DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 
			DIVISION.AIR_DEFENCE_RESERVE, 
			DIVISION.SENSOR_RESERVE,
			DIVISION.MAINTENANCE_RESERVE
		];

		/** @type {Map<number, DroidObject[]>} */
		const reserveUnits = new Map();
		RESERVE_GROUP_IDS.forEach(id => {reserveUnits.set(id, state.g.enumGroup(id))});

		if (REPAIR_FACILITY_AVAILABLE) {
			const RESERVE_REPAIR_THRESHOLD = 70;

			// In case reserve units are damaged, send these back for repair (reserves should only be engaged in light combat). 
			const unitsToBeRepaired = [];
			for (const [category, unitList] of reserveUnits) {
				if (unitList.length === 0) {
					continue;
				}

				unitsToBeRepaired.length = 0;	// reset the list
				unitList.forEach(droid => {
					if (droid.health < RESERVE_REPAIR_THRESHOLD) {
						unitsToBeRepaired.push(droid);
					}
				});
				
				this.toc.assignUnitsToBrigade(state, unitsToBeRepaired, category, DIVISION.RETURNING_FOR_REPAIR);
			}
		}

		// Decide how many BCTs should be made with the available units
		const activeBrigade = new Map([
			[DIVISION.FIRST_BCT, false], 
			[DIVISION.SECOND_BCT, false],
			[DIVISION.THIRD_BCT, false],
			[DIVISION.FOURTH_BCT, false],
			[DIVISION.FIFTH_BCT, false]
		]);

		let weakBCTCount = 0;
		for (const [brigadeID, unitCount] of brigadeUnitCount) {
			if (unitCount > this.TOTAL_UNITS_PER_BRIGADE * 1 / 2) {
				activeBrigade.set(brigadeID, true);
				continue;
			}

			weakBCTCount += 1;
			if (weakBCTCount > 1) {
				if (unitCount > 0) {
					debug(`${gameTime}: Brigade "${brigadeID}" recombined (only ${unitCount} units).`);
				}
				activeBrigade.set(brigadeID, false);	// deactivate the brigade for recombination
			} else {
				activeBrigade.set(brigadeID, true);
			}
			continue;	
			
		}

		// Reinforce & replace damaged units for existing brigades, recombining where appropriate
		for (const [brigadeID, unitCount] of brigadeUnitCount) {
			const brigadeComposition = state.brigades[brigadeID]["composition"];

			if (!activeBrigade.get(brigadeID)) {
				// Forces all brigade units to 'return for repair', which eventually returns them to the reserves 
				for (const [category, btnComposition] of brigadeComposition) {
					this.toc.assignUnitsToBrigade(state, btnComposition['healthyUnitList'], brigadeID, DIVISION.RETURNING_FOR_REPAIR);		
					this.toc.assignUnitsToBrigade(state, btnComposition['damagedUnitList'], brigadeID, DIVISION.RETURNING_FOR_REPAIR);		
				}
				continue;
			}
			
			// By battalion, 
			// 	 1. assign units to reach base / core strength, 
			//   2. then return any damaged units for repair, sending reinforcements if available
			for (const [category, btnComposition] of brigadeComposition) {

				const deficit = btnComposition['deficit'];
				const battalionReserve = reserveUnits.get(category);
				if (battalionReserve == null) {
					debug(`${gameTime}: WARNING: tried to get reserve units from non-existent category "${category}". Skipping.`);
					continue;
				}

				const reinforcements = battalionReserve.splice(0, deficit);
				this.toc.assignUnitsToBrigade(state, reinforcements, category, brigadeID);

				if (REPAIR_FACILITY_AVAILABLE) {
					const damagedUnitCount = btnComposition['damagedUnitList'].length;
					const replacements = battalionReserve.splice(0, damagedUnitCount);
					this.toc.assignUnitsToBrigade(state, replacements, category, brigadeID);
					this.toc.assignUnitsToBrigade(state, btnComposition['damagedUnitList'], brigadeID, DIVISION.RETURNING_FOR_REPAIR);		
				}
			}
		}
	}

	/**
	 * Decides which land vehicles, cyborgs & VTOLs to produce.
	 * @param {worldState} state 
	 * @returns {void}
	 */
	runProductionLogistics(state) {

		const activeProductionJobs = state.activeProductionJobs;

		// Check factories for idle
		const factories = state.playerInfo[me]["normalFactoryFbObjects"];
		const cyborgFactories = state.playerInfo[me]["cyborgFactoryFbObjects"];
		const vtolFactories = state.playerInfo[me]["vtolFactoryFbObjects"];

		const idleFactories = getIdleStructureObjects(factories);
		const idleCyborgFactories = getIdleStructureObjects(cyborgFactories);
		const idleVtolFactories = getIdleStructureObjects(vtolFactories);

		if (false) {
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

			debugPrintIfIdle(idleFactories, "Factory");
			debugPrintIfIdle(idleCyborgFactories, "Cyborg Factory");
			debugPrintIfIdle(idleVtolFactories, "VTOL Factory");
		}

		if (idleFactories.length === 0 && idleCyborgFactories.length === 0 && idleVtolFactories.length === 0) {
			// Cleanup of the activeProductionJobs list - double check all factories are represented.
			// Required in the case that a factory no longer exists.
			const factoryIdList = [];
			factories.forEach(f => factoryIdList.push(f.id));
			cyborgFactories.forEach(f => factoryIdList.push(f.id));
			vtolFactories.forEach(f => factoryIdList.push(f.id));

			activeProductionJobs.forEach(j => {
				if (factoryIdList.includes(j['factory'].id)) {
					return;
				}
				this.toc.removeFromActiveProductionJobs(state, j['factory'], j['type']);
				debug(`${gameTime}\tWARNING: removed ProductionJob "${j['factory'].id} | ${j['type']}" as Factory "${j['factory'].id}" was not found.`);
			});
			
			return;
		}

		// Define unit limits
		const TRUCK_HARD_LIMIT = getDroidLimit(me, DROID_CONSTRUCT);
		const TRUCK_SOFT_LIMIT = Math.min(TRUCK_HARD_LIMIT, this.MAX_TRUCKS);

		const COMBAT_UNIT_HARD_LIMIT = getDroidLimit(me, DROID_WEAPON) - TRUCK_SOFT_LIMIT;
		// Future: this.NUMBER_OF_BRIGADES should be matched to hard limit
		const INFANTRY_UNIT_SOFT_LIMIT = this.FISHBOT_BRIGADE_COMPOSITION['MAX_INFANTRY'] * this.NUMBER_OF_BRIGADES + this.FISHBOT_RESERVE_COMPOSITION['MAX_INFANTRY'];
		const LAND_VEHICLE_SOFT_LIMIT = (this.TOTAL_UNITS_PER_BRIGADE - this.FISHBOT_BRIGADE_COMPOSITION['MAX_INFANTRY']) * this.NUMBER_OF_BRIGADES + (this.TOTAL_RESERVE_UNITS - this.FISHBOT_RESERVE_COMPOSITION['MAX_INFANTRY']);
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
			debug(`  RESERVE SIZE: ${this.TOTAL_RESERVE_UNITS}`);
		}
		
		// Get unit deficits
		// Decide on whether or not to produce combat units
		// Note: FishBot will not build combat vehicles before it can design them, on any difficulty.	
		const CAN_DESIGN_UNITS = HQ_IS_CONSTRUCTED;

		const SHOULD_PRODUCE_LAND_VEHICLES = CAN_DESIGN_UNITS && !HIT_LAND_VEHICLE_LIMIT;
		const SHOULD_PRODUCE_INFANTRY = !HIT_INFANTRY_LIMIT;
		const SHOULD_PRODUCE_VTOLS = CAN_DESIGN_UNITS && !HIT_AIR_UNIT_LIMIT;
		
		// Decide on which category of land combat vehicle to produce (basic greedy algorithm)
		let landVehicleCategory = DIVISION.HEAVY_CAV_RESERVE;
		
		if (SHOULD_PRODUCE_LAND_VEHICLES && idleFactories.length > 0) {
			const productionRequests = [];

			const brigadeWeightingFactors = [5, 4, 3, 2, 0];	// corresponds to each of the brigades (change with `this.NUMBER_OF_BRIGADES`)
			const reserveWeightingFactor = 1; 

			this.BRIGADE_DESIGNATIONS.forEach((brigadeID, idx) => {

				const brigadeComposition = state.brigades[brigadeID]["composition"];
				const weightedRequests = this.#prioritiseLandVehicleCategory2(brigadeComposition);

				weightedRequests.forEach(request => request["score"] *= brigadeWeightingFactors[idx]);
				productionRequests.push(...weightedRequests);
			});

			// Update reserve division

			const brigadeComposition = state.brigades[DIVISION.BCT_RESERVE]["composition"];
			const weightedRequests = this.#prioritiseLandVehicleCategory2(brigadeComposition);
			weightedRequests.forEach(request => request["score"] *= reserveWeightingFactor);
			productionRequests.push(...weightedRequests);

			productionRequests.sort((a, b) => b.score - a.score);

			// Remove active jobs
			const removedRequests = [];
			activeProductionJobs.forEach(job => {
				for (let i=0; i<productionRequests.length; i++) {
					if (job.type !== productionRequests[i].type) {
						continue;
					}
					removedRequests.push(...productionRequests.splice(i, 1));
					break;
				}
			});
			
			if (productionRequests.length > 0) {
				landVehicleCategory = productionRequests[0].type;
			} else {
				debug(`${gameTime}: WARNING: landVehicleCategory defaulting to ${landVehicleCategory}`);
			}

			if (false) {
				let deletedEntries = "";
				removedRequests.forEach(r => deletedEntries += `${r.type},`)
				debug(`Cleaned Production Requests (removed ${deletedEntries})`); 
				productionRequests.forEach(r => debug(`\t-${r.type} | ${r.score}`));

				debug(`\t${gameTime}: Impl2 producing: ${landVehicleCategory}`);
			}
		}

		// Decide on whether or not to produce trucks
		const SHOULD_PRODUCE_TRUCKS = !HIT_TRUCK_LIMIT;
		const SINGLE_TRUCK_THIS_TICK = CAN_DESIGN_UNITS;
		let producedTruckThisTick = false;

		// Run production
		const DEBUG_PRODUCTION = false;

		// Note: for now, we will directly call the tactical level functions
		for (let i=0; i<idleCyborgFactories.length; i++) {
			const f = idleCyborgFactories[i];

			if (SHOULD_PRODUCE_TRUCKS && CYBORG_CONSTRUCTOR_AVAILABLE && !producedTruckThisTick) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Combat Engineer`);
				const productionStarted = produceCombatEngineer(f);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': f, 'type': ENGINEERING.ENGINEERING_RESERVE});
				}
				if (SINGLE_TRUCK_THIS_TICK) {
					producedTruckThisTick = true;
				}
				continue;
			}

			if (SHOULD_PRODUCE_INFANTRY) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Infantry`);
				const productionStarted = produceInfantry(f);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': f, 'type': DIVISION.INFANTRY_RESERVE});
				}
			}
		}

		for (let i=0; i<idleVtolFactories.length; i++) {
			const factory = idleVtolFactories[i];

			if (SHOULD_PRODUCE_VTOLS) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced VTOL`);
				const productionStarted = produceCloseAirSupport(factory);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': factory, 'type': DIVISION.AIR_RESERVE});
				}
			} else {
				break;
			}
		}

		for (let i=0; i<idleFactories.length; i++) {
			const factory = idleFactories[i];

			if (SHOULD_PRODUCE_TRUCKS && !CYBORG_CONSTRUCTOR_AVAILABLE && !producedTruckThisTick) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Truck`);
				// Note: CAN_DESIGN_UNITS prevents FishBot from producing any other trucks other than `Truck Viper Wheels` until the command center is built
				const productionStarted = produceTruck(factory, CAN_DESIGN_UNITS);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': factory, 'type': ENGINEERING.ENGINEERING_RESERVE});
				}		
				
				if (SINGLE_TRUCK_THIS_TICK) {
					producedTruckThisTick = true;
				}
				continue;
			}

			if (SHOULD_PRODUCE_LAND_VEHICLES) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Land Vehicle Template`);
				const productionStarted = produceLandUnitCategory(landVehicleCategory, factory);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': factory, 'type': landVehicleCategory});
				}
				return;		
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

			Example v0.4.1 T2 research order 
				446902   APFSDS Cannon Rounds Mk3
				678902   Dedicated Synaptic Link Data Analysis Mk3
				689902   Gas Turbine Generator Mk3
				842902   Dense Composite Alloys Mk2
				903902   Twin Assault Cannon
				1034902  HVAPFSDS Cannon Rounds
				1039902  Heavy Body - Tiger
				1074902  HEAP Mortar Shells Mk2
				1130902  Neural Synapse Research Brain
				1226902  Cannon Autoloader Mk3
				1234902  HVAPFSDS Cannon Rounds Mk2
				1266902  Dense Composite Alloys Mk3
				1282902  HEAP Mortar Shells Mk3
				1345902  Vapor Turbine Generator
				1393902  Cannon Rapid Loader
				1438902  HVAPFSDS Cannon Rounds Mk3
				1457902  Mortar Autoloader Mk3
				1481902  Superdense Composite Alloys
				1507902  Vapor Turbine Generator Mk2
				1570902  Mortar Fast Loader
				1572902  Cannon Rapid Loader Mk2
				1653902  Needle Gun
				1689902  Neural Synapse Research Brain Mk2
				1722902  Vapor Turbine Generator Mk3
				1725902  Superdense Composite Alloys Mk2
				1787902  Cannon Rapid Loader Mk3
				1904902  Advanced Engineering
				1910902  Hardened Rail Dart
		*/

		const FISHBOT_T2_CANNON_RESEARCH_PRIORITIES = [
			RESEARCHES["APFSDS Cannon Rounds Mk3"].id,
			"R-Struc-Power",
			RESEARCHES["Dedicated Synaptic Link Data Analysis Mk3"].id,

			RESEARCHES["Twin Assault Cannon"].id,
			"R-Wpn-Cannon-Damage",
			"R-Wpn-Cannon-ROF", 
			RESEARCHES["Whirlwind AA Turret"].id,
			RESEARCHES["Twin Assault Gun"].id,
			RESEARCHES["Heavy Body - Tiger"].id,

			RESEARCHES["Neural Synapse Research Brain"].id,
			RESEARCHES["Dense Composite Alloys Mk2"].id,

			// Gauss Cannon researches added here
			RESEARCHES["Needle Gun"].id,
			RESEARCHES["Rail Gun"].id,
			RESEARCHES["Gauss Cannon"].id,
			"R-Wpn-Rail-ROF", 
			"R-Wpn-Rail-Accuracy",
			"R-Wpn-Rail-Damage",

			"R-Wpn-Mortar-Damage", 	
			"R-Wpn-Mortar-ROF",
			"R-Vehicle-Metals",

			// RESEARCHES["Advanced Engineering"].id,
			// RESEARCHES["Advanced Repair Facility"].id,
			RESEARCHES["Auto-Repair"].id,
			RESEARCHES["Neural Synapse Research Brain Mk2"].id,

			// "R-Cyborg-Metals", 
			"R-Struc-VTOLPad-Upgrade",

			"R-Struc-Factory-Upgrade",
			RESEARCHES["Neural Synapse Research Brain Mk3"].id,
			
			// RESEARCHES["Howitzer"].id,
			// RESEARCHES["Heavy Cannon"].id, 
			// RESEARCHES["AA Cyclone Flak Cannon"].id, 		
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
					// debug(`  ${gameTime} (FishBot ${me}): researching ${researchOrder[j].name}`);		
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