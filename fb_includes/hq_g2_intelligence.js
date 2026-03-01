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

	#createNewTarget({targetObject}) {
		
		let temp =  {
			'obj': undefined,
			'id': undefined,
			'name': undefined,
			'x': undefined,
			'y': undefined,

			// Target analysis
			'distanceFromBase': 0,
			'distanceFromGroundForce': 0,

			'isEnergy': false,
			'isProduction': false,
			'isUnit': false,
			'isDefence': false,

			'radiusAround': 8,
			'targetsAround': 0, 
			'enemyDerricksAround': 0,
			'airDefensesAround': 0,
			'indirectFireAround': 0,
			'otherLandDefensesAround': 0,
			'otherLandUnitsAround': 0,

			// Campaign planning
			'priority': 0.2,					
			'baseValue': 0.2,			
			'reward': 0.0,
			'cost': 0.0,
			'score': 0.0,

			// On ground targeting
			'lastScoutedTime': -1, 
			'lastTimeScoutAttempted': -2,
			'lastAttackedTime': -1,
			'lastTimeAirAttackAttempted': -2,
			'lastTimeGroundAttackAttempted': -2,
			'airStrikeMissionIDs': [],
			'groundMissionIDs': [],
		};

		temp.obj = targetObject;
		temp.id = targetObject.id;
		temp.name = targetObject.name;
		temp.x = targetObject.x;
		temp.y = targetObject.y;

		// Set base value
		if (targetObject.type === DROID) {
			if (targetObject.droidType === DROID_CONSTRUCT) {
				temp.baseValue = 1.0;
			} else if (targetObject.droidType === DROID_WEAPON) {
				temp.baseValue = 0.6;
				// Anti air & field artillery have higher value
				if (targetObject.hasIndirect || isAntiAirDefense(targetObject)) {
					temp.baseValue = 0.8;
				}
			} else if  (targetObject.droidType === DROID_PERSON || 
						targetObject.droidType === DROID_CYBORG ||
						targetObject.droidType === DROID_COMMAND) {
				temp.baseValue = 0.4;
			} else if  (targetObject.droidType === DROID_REPAIR ||
						targetObject.droidType === DROID_SENSOR ||
						targetObject.droidType === DROID_ECM) {
				temp.baseValue = 0.2;
			} else {
				temp.baseValue = 0.2;
			}

		} else if (targetObject.type === STRUCTURE) {

			if (targetObject.stattype === RESOURCE_EXTRACTOR) {
				// OIL DERRICK
				temp.baseValue = 1.0;
				temp.isEnergy = true;
			} else if  (targetObject.stattype === CYBORG_FACTORY || 
						targetObject.stattype === REPAIR_FACILITY) {
				// FACTORY/PRODUCTION (NO MODULES)
				temp.baseValue = 0.8;
				temp.isProduction = true;
			} else if  (targetObject.stattype === FACTORY || 
						targetObject.stattype === VTOL_FACTORY) {
				// FACTORY/PRODUCTION (WITH MODULES)
				if (targetObject.modules > 0) {
					temp.baseValue = 0.8;
				} else {
					temp.baseValue = 0.6;
				}
				temp.isProduction = true;
			} else if (targetObject.stattype === DEFENSE) {
				// DEFENSES: anti air & field artillery have higher value
				temp.baseValue = 0.4;
				if (targetObject.hasIndirect) {
					temp.baseValue = 0.8;
				}
				if (isAntiAirDefense(targetObject)) {
					temp.baseValue = 1.0;
				}
			} else if  (targetObject.stattype === POWER_GEN ||
						targetObject.stattype === REARM_PAD) {
				// PRODUCTION SUPPORT
				temp.baseValue = 0.4;								
			} else if  (targetObject.stattype === HQ || 
						targetObject.stattype === LASSAT ||
						targetObject.stattype === RESEARCH_LAB || 
						targetObject.stattype === SAT_UPLINK ||
						targetObject.stattype === COMMAND_CONTROL) {
				// SUPPORT BUILDINGS
				temp.baseValue = 0.2;
			} else if  (targetObject.stattype === WALL || 
						targetObject.stattype === GATE ||
						targetObject.stattype === STRUCT_GENERIC) {
					temp.baseValue = 0.2;
			} else  {
				temp.baseValue = 0.2;
			}
		} else {
			temp.baseValue = 0.2;		
		}

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
							defences.push(this.#createNewTarget({targetObject: t}));
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

	getCASTargets(location, nearbyLandTargets) {
		
		let adaFortifications = [], adaGroundUnits = [], indirectFireFortifications = [], indirectFireGroundUnits = [], regularGroundUnits = [];

		const GROUND_PROPULSION_IDS = [PROPULSIONS["Wheels"].id, PROPULSIONS["Half-tracks"].id, PROPULSIONS["Tracks"].id, PROPULSIONS["Hover"].id];

		for (let i=0; i<nearbyLandTargets.length; i++) {
			const currLandTarget = nearbyLandTargets[i];

			if (currLandTarget.type === STRUCTURE) {
				if (currLandTarget.hasIndirect === true) {
					indirectFireFortifications.push(this.#createNewTarget({targetObject: currLandTarget}));
					continue;
				}

				if (isAntiAirDefense(currLandTarget)) {
					adaFortifications.push(this.#createNewTarget({targetObject: currLandTarget}));
					continue;
				}
			} else if (currLandTarget.type === DROID) {
				if (!GROUND_PROPULSION_IDS.includes(currLandTarget.propulsion)) {
					continue;		// ignores cyborgs
				}

				if (currLandTarget.hasIndirect === true) {
					indirectFireGroundUnits.push(this.#createNewTarget({targetObject: currLandTarget}));
					continue;
				}

				if (isAntiAirDefense(currLandTarget)) {
					adaGroundUnits.push(this.#createNewTarget({targetObject: currLandTarget}));
					continue;
				}

				if (currLandTarget.droidType === DROID_WEAPON) {
					regularGroundUnits.unshift(this.#createNewTarget({targetObject: currLandTarget}));
					continue;
				}

				regularGroundUnits.push(this.#createNewTarget({targetObject: currLandTarget}));
			}
		}

		const prioritisedTargetList = [...adaGroundUnits, ...adaFortifications, ...indirectFireGroundUnits, ...regularGroundUnits, ...indirectFireFortifications];

		return prioritisedTargetList;
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
		aaGameObjects.forEach(obj => aaTargets.push(this.#createNewTarget({targetObject: obj})));

		economyGameObjects.forEach(obj => economyTargets.push(this.#createNewTarget({targetObject: obj})));

		return {"antiAirTargets": aaTargets, "economyTargets": economyTargets};
	}
	
	getLandTargetsAround({state, position, searchRadius}) {

		let targetObjects = enumRange(position.x, position.y, searchRadius, ENEMIES, false);

		const noVtolTargetList = targetObjects.filter(obj => obj.isVTOL !== true);
		if (noVtolTargetList.length > 0) {
			targetObjects = noVtolTargetList;
		}

		return targetObjects;
	}

	getAllTargets({state}) {
		// This is computationally expensive, should only be used as a fallback
		
		let landTargets = [], airTargets= [];

		const enemyPlayerList = enumLivingPlayers().filter(isEnemy); 
		enemyPlayerList.forEach(playerID => {
			const enemyUnits = enumDroid(playerID, DROID_ANY);
			
			const enemyLandUnits = enemyUnits.filter(d => !isVTOL(d));
			const enemyVTOLs = enemyUnits.filter(d => isVTOL(d));

			const enemyStructures = enumStruct(playerID);		

			landTargets.push(...enemyLandUnits, ...enemyStructures);
			airTargets.push(...enemyVTOLs);
		});

		return [...landTargets, ...airTargets];
	}

	updateCurrTargets(state) {
		// Service: This is a mutator for state.currTargets

		/*
			PRUNES MAIN TARGET LIST
		*/

		let updatedCurrTargets = [];

		for (let i=0; i<state.currTargets.length; i++) {
			let currTarget = state.currTargets[i];

			const gameObj = getObject(currTarget.obj.type, currTarget.obj.player, currTarget.obj.id);
			
			if (!defined(gameObj)) {	
				continue;
			} 

			// Else, update the game object & position
			currTarget.obj = gameObj;
			currTarget.x = gameObj.x;
			currTarget.y = gameObj.y;

			updatedCurrTargets.push(currTarget);
		}

		state.currTargets = updatedCurrTargets;
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
