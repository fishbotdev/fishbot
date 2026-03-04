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
class armyIntelligence {

	constructor() {

	}

	requestCollection(state) {
		// System: Looks at the state & generate options for reconnaissance

		// For now, recon all sectors equally
		let sectorsToRecon = [];
		for (let i=0; i<state.sectors.length; i++) {
			const currSector = state.sectors[i];
			sectorsToRecon.push(currSector);
		}

		let intelligenceTasks = sectorsToRecon;

		return intelligenceTasks;
	}

	/*
		MISSION CREATION
	*/
	#createMissionOrders() {
		let missionDataTemplate = {
			'id': undefined, 
			'missionType': undefined, 
			'missionStatus': MISSION_STATUS.FAILED_CREATION, 
			'priority': MISSION_PRIORITY.LOW, 
			'taskForceID': undefined, 
			'orders': undefined, 
			'ceaseOrders': undefined,
			'timeStarted': -2,
			'timeCompleted': -1,

			'sectorID': undefined,	
		};

		return missionDataTemplate;
	}

	#mcb(callback, ...args) {
		// This function is here so we can schedule execution of the callback function at some later point
		return callback(...args);	//...args is important otherwise all remaining args will be interpreted as a single array of parameters
	}

	#finaliseEngineCall(md) {
		// Mission completed
		md.timeCompleted = getCurrGameTime();
	}

	createSectorReconEngineMission({sectorInfo, missionType, tickUID}) {
		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created
		
		let md = this.#createMissionOrders();

		// Create mission details
		const id = gameTime + "_SECTOR_RECON_ENGINE_" + tickUID;
		md.id = id;

		md.sectorID = sectorInfo.id;

		//md.missionType is set in the parent function (no duplication)
		md.missionStatus = MISSION_STATUS.NOT_STARTED;

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(getSectorIntelFromGameEngine, sectorInfo, missionType);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseEngineCall, md);

		return md;
	}

	/*
		REAL-TIME TARGETING
	*/
	
	#createNewTarget(targetObject) {
		
		let temp =  {
			'name': targetObject.name,

			// These 3 parameters allow 'getObject' to be used at a later point to retrieve up-to-date object information
			'type': targetObject.type,
			'player': targetObject.player,
			'id': targetObject.id,

			'priority': MISSION_PRIORITY.LOW,
		};

		return temp;
	}

	getAirRaidTargets(state) {

		const SEARCH_RADIUS = 7;

		let lowPriorityTargets = [], medPriorityTargets = [], highPriorityTargets = [];

		for (let i=0; i<state.sectors.length; i++) {
			const currSector = state.sectors[i];

			if (state.highRiskSectors.includes(currSector)) {
				continue;
			}

			// For each derrick, find all nearby targets. Skip if derricks are assumed close together
			let units = [], structures = [], defences = [];
			let NUM_SEARCH_ITERATIONS = currSector.derricks.length;
			if (NUM_SEARCH_ITERATIONS >= 4) {
				NUM_SEARCH_ITERATIONS = 1;		// usually this means the derricks are close together (to be verified)
			}
			for (let j=0; j<NUM_SEARCH_ITERATIONS; j++) {

				const nearbyTargets = enumRange(currSector.derricks[j].x, currSector.derricks[j].y, SEARCH_RADIUS, ENEMIES, false);

				for (let k=0; k<nearbyTargets.length; k++) {
					const t = nearbyTargets[k];

					// if (t.type === DROID && t.isVTOL !== true) {
						// units.push(this.#createNewTarget({targetObject: t}));
						// continue;
					// } else 
					if (t.type === STRUCTURE) {
						if (t.stattype === DEFENSE && t.status === BUILT) {
							defences.push(this.#createNewTarget(t));
							continue;
						}

						// if (t.stattype !== RESOURCE_EXTRACTOR) {
						// 	structures.push(this.#createNewTarget({targetObject: t}));
						// 	continue;
						// }
					}
				}
			}

			if (currSector.derricks.length >= 4) {
				highPriorityTargets.push(...defences);
			} else if (defences.length <= currSector.derricks.length) {	
				medPriorityTargets.push(...defences); 	// "low hanging fruit"
			} else {
				lowPriorityTargets.push(...defences);		
			}
			
		}

		const airRaidTargetList = [...highPriorityTargets, ...medPriorityTargets, ...lowPriorityTargets];

		return airRaidTargetList;
	}

	getAllEnemyBaseTargets(state) {
		const alivePlayers = enumLivingPlayers();

		let enemyBaseSectors = [];
		state.sectors.forEach(sector => {
			if (defined(sector.base)) {
				if (sector.base.isEnemy && alivePlayers.includes(sector.base.playerID)) {
					enemyBaseSectors.push(sector);
				}
			}
		});

		let aaGameObjects = [], economyGameObjects = [];

		const ECONOMY_TARGET_STRUCTURES = [VTOL_FACTORY, CYBORG_FACTORY];
		const LESS_IMPORTANT_ECONOMY_STRUCTURES = [REPAIR_FACILITY, FACTORY];

		const SEARCH_RADIUS = Math.min(
			Math.floor(mapHeight/alivePlayers.length), 
			Math.floor(mapWidth/alivePlayers.length), 
			20
		);

		for (let i=0; i<enemyBaseSectors.length; i++) {
			let objList = enumRange(enemyBaseSectors[i].x, enemyBaseSectors[i].y, SEARCH_RADIUS, ENEMIES, false);
			
			if (objList.length === 0) {
				debug(`getAllEnemyBaseTargets(): doubled search radius.`);
				objList = enumRange(enemyBaseSectors[i].x, enemyBaseSectors[i].y, SEARCH_RADIUS * 2, ENEMIES, false);
			}

			// Anti-air targets
			aaGameObjects.push(...objList.filter(o => isAntiAirDefense(o)));	

			// Economy targets
			economyGameObjects.push(...objList.filter(o => o.droidType === DROID_CONSTRUCT));
			economyGameObjects.push(...objList.filter(o => ECONOMY_TARGET_STRUCTURES.includes(o.stattype)));	
			economyGameObjects.push(...objList.filter(o => LESS_IMPORTANT_ECONOMY_STRUCTURES.includes(o.stattype)));
		}

		let aaTargets = [], economyTargets = [];
		
		aaGameObjects.sort((a,b) => 
			distSq(a.x, baseLocation.x, a.y, baseLocation.y) - distSq(b.x, baseLocation.x, b.y, baseLocation.y));
		aaGameObjects.forEach(obj => aaTargets.push(this.#createNewTarget(obj)));

		economyGameObjects.forEach(obj => economyTargets.push(this.#createNewTarget(obj)));

		return {"antiAirTargets": aaTargets, "economyTargets": economyTargets};
	}
	
	#getNearestPlayerTargets({state, loc}) {
		// Algorithm: Find the nearest alive enemy base closest to the current group location and head towards that.
		// Reason: This saves running enumDroid() and enumStruct() over all alive enemy players.

		const enemyPlayerIDs = enumLivingPlayers().filter(isEnemy); 
		if (enemyPlayerIDs.length === 0) {
			return [];
		}

		let nearestEnemyPlayer = enemyPlayerIDs[0];
		let nearestBaseDistSq = distSq(loc.x, startPositions[nearestEnemyPlayer].x, loc.y, startPositions[nearestEnemyPlayer].y);

		for (let i=1; i<enemyPlayerIDs.length; i++) {
			const enemyBasePosition = startPositions[enemyPlayerIDs[i]];
			const d = distSq(loc.x, enemyBasePosition.x, loc.y, enemyBasePosition.y);
			if (d < nearestBaseDistSq) {
				nearestBaseDistSq = d;
				nearestEnemyPlayer = i;
			}
		}
		
		const enemyUnits = enumDroid(nearestEnemyPlayer);
		const enemyStructures = enumStruct(nearestEnemyPlayer);		

		return [...enemyUnits, ...enemyStructures];
	}

	/** 
	 * This function performs these roles:
	 *		- finding the closest droid
	 *		- calculating how many targets are in the immediate radius
	 *		- classifying each object into different, useful categories
	 *		- compressing each gameObject for efficient storage & use
	 * with O(N) algorithmic complexity. 
	 */
	proposeTargetsInRadius({state, loc, searchRadius=20, immediateRadius=10}) {

		const SHOW_TARGETS = false;
		
		let proposedTargets = {
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

		const INDUSTRIAL_TARGETS = [FACTORY, CYBORG_FACTORY, VTOL_FACTORY];

		let targetObjects = enumRange(loc.x, loc.y, searchRadius, ENEMIES, false);

		if (targetObjects.length === 0) {
			// debug(`used getNearestPlayerTargets() @ ${gameTime}`);
			targetObjects = this.#getNearestPlayerTargets({state: state, loc: loc});
		}

		if (targetObjects.length === 0) {
			return proposedTargets;
		}

		if (SHOW_TARGETS) {
			hackMarkTiles();			
		}

		let closestObject = targetObjects[0];
		let closestDistSq = distSq(closestObject.x, loc.x, closestObject.y, loc.y);

		for (let i=0; i<targetObjects.length; i++) {
			const obj = targetObjects[i];
			if (SHOW_TARGETS) {
				hackMarkTiles(obj.x, obj.y);
			}

			// Update closestDroid
			const distSquaredToLoc = distSq(obj.x, loc.x, obj.y, loc.y);
			if (distSquaredToLoc < closestDistSq) {
				closestObject = obj;
				closestDistSq = distSquaredToLoc;
			}
			if (distSquaredToLoc <= immediateRadius ** 2) {
				proposedTargets["targetsInImmediateRadius"] += 1;
			}

			// Classify, then compress the game object
			if (isAntiAirDefense(obj)) {
				proposedTargets["enemyADA"].push(this.#createNewTarget(obj));
				continue;
			}

			if (obj.type === DROID) {
				if (obj.droidType === DROID_CONSTRUCT) {
					proposedTargets["enemyConstructor"].push(this.#createNewTarget(obj));
					continue;
				} 

				if (obj.propulsion === PROPULSIONS["Cyborg Propulsion"]) {
					// cyborg engineers were filtered out earlier
					proposedTargets["enemyInfantry"].push(this.#createNewTarget(obj));		
					continue;
				}

				if (obj.hasIndirect === true) {
					// cyborg indirect (e.g. grenadier) was filtered out earlier
					proposedTargets["enemyIndirectFire"].push(this.#createNewTarget(obj));
					continue;
				}

				if (obj.isVTOL === true) {
					proposedTargets["enemyAviation"].push(this.#createNewTarget(obj));
					continue;
				}

				// This leaves only direct fire land vehicles & other utility vehicles e.g. sensors / commanders
				if (obj.droidType === DROID_WEAPON) {
					proposedTargets["enemyArmor"].push(this.#createNewTarget(obj));
					continue;		
				}

				proposedTargets["enemyUtility"].push(this.#createNewTarget(obj));
				continue;
			}

			if (obj.type === STRUCTURE) {
				if (obj.hasIndirect === true) {
					proposedTargets["enemyIndirectFire"].push(this.#createNewTarget(obj));
					continue;
				}
				
				if (obj.stattype === DEFENSE) {
					proposedTargets["enemyDefenses"].push(this.#createNewTarget(obj));
					continue;
				}

				if (INDUSTRIAL_TARGETS.includes(obj.stattype)) {
					proposedTargets["enemyIndustrial"].push(this.#createNewTarget(obj));
					continue;					
				}

				proposedTargets["enemyUtility"].push(this.#createNewTarget(obj));
				continue;
			}
		}

		proposedTargets["closestObject"] = closestObject;

		return proposedTargets;

	}

	getOilDominanceStatus(state, OIL_DOMINANCE_PERCENTAGE) {
		let totalDerricks = 0, capturedDerricks = 0;

		for (let i=0; i<state.sectors.length; i++) {
			let d = state.sectors[i].derricks;
			d.forEach(derrick => {
				if (derrick.owner === REGION_OWNER.FRIENDLY) {
					capturedDerricks++;
				}
				totalDerricks++;
			})
		}
		if (Math.floor(capturedDerricks / totalDerricks * 100) > OIL_DOMINANCE_PERCENTAGE) {
			return true;
		} else {
			return false;
		}
	}

}
