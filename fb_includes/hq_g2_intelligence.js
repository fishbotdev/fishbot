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
		const SEARCH_RADIUS = 8;

		let lowPriorityTargets = [];
		let medPriorityTargets = [];
		let highPriorityTargets = [];

		for (let i=0; i<state.sectors.length; i++) {
			const currSector = state.sectors[i];

			if (state.highRiskSectors.includes(currSector)) {
				continue;
			}

			let units = [], structures = [], defences = [];

			for (let i=0; i<currSector.derricks.length; i++) {

				const nearbyTargets = enumRange(currSector.derricks[i].x, currSector.derricks[i].y, SEARCH_RADIUS, ENEMIES, false);

				const nearbyUnits = nearbyTargets.filter(obj => obj.type === DROID && !isVTOL(obj));
				const nearbyStructures = nearbyTargets.filter(obj => obj.type === STRUCTURE && obj.stattype !== RESOURCE_EXTRACTOR);
				const nearbyDefences = nearbyTargets.filter(obj => (obj.type === STRUCTURE && obj.stattype === DEFENSE && obj.status === BUILT));

				units.push(...nearbyUnits);
				structures.push(...nearbyStructures);
				defences.push(...nearbyDefences);
			}

			if (currSector.derricks.length >= 4) {
				highPriorityTargets.push(...defences);
			} else if (structures.length <= currSector.derricks.length) {	// at most, on average more than 1 other structure/derrick
				medPriorityTargets.push(...defences);
			} else {
				lowPriorityTargets.push(...defences);		// removed derricks which are easily reinforced; against an insane AI it doesn't matter if the defence is continually destroyed since they have effectively infinite power
			}
		}

		medPriorityTargets.sort((a,b) => 
			distSq(a.x, baseLocation.x, a.y, baseLocation.y) - distSq(b.x, baseLocation.x, b.y, baseLocation.y));
		lowPriorityTargets.sort((a,b) => 
			distSq(a.x, baseLocation.x, a.y, baseLocation.y) - distSq(b.x, baseLocation.x, b.y, baseLocation.y));

		const targetObjectList = [...highPriorityTargets, ...medPriorityTargets, ...lowPriorityTargets];

		let airRaidTargetList = [];
		targetObjectList.forEach(obj => airRaidTargetList.push(this.#createNewTarget({targetObject: obj})));

		return airRaidTargetList;
	}

	getCASTargets(location, nearbyLandTargets) {
		
		const units = nearbyLandTargets.filter(o => o.type === DROID && o.isVTOL !== true);
		const adaFortifications = nearbyLandTargets.filter(o => o.type === STRUCTURE && isAntiAirDefense(o));

		const groundPropulsions = [PROPULSIONS["Wheels"].id, PROPULSIONS["Half-tracks"].id, PROPULSIONS["Tracks"].id, PROPULSIONS["Hover"].id];

		const groundVehicles = units.filter(droid => 
			groundPropulsions.includes(droid.propulsion)).
			sort((a, b) => distSq(a.x, location.x, a.y, location.y) - distSq(b.x, location.x, b.y, location.y));
		
		const adaGroundUnits = groundVehicles.filter(droid => isAntiAirDefense(droid));
		const indirectGroundUnits = groundVehicles.filter(droid => droid.hasIndirect === true);
		const regularGroundUnits = groundVehicles.filter(droid => !adaGroundUnits.includes(droid));

		// const otherUnits = units.filter(droid => !groundVehicles.includes(droid));

		const objList = [...adaGroundUnits, ...adaFortifications, ...indirectGroundUnits, ...regularGroundUnits];

		let overallTargetList = [];
		objList.forEach(droid => overallTargetList.push(this.#createNewTarget({targetObject: droid})));
		return overallTargetList;
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
	
	getLandTargetsAround({state, position, searchRadius=20}) {

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

		// this is expensive 
		landTargets.sort((a,b) => distSq(a.x, baseLocation.x, a.y, baseLocation.y) - distSq(b.x, baseLocation.x, b.y, baseLocation.y));		

		return [...landTargets, ...airTargets];
	}

	updateCurrTargets(state) {
		// Service: This is a mutator for state.currTargets

		/*
			PRUNES MAIN TARGET LIST
		*/

		let indicesToKeep = [];

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

			indicesToKeep.push(i);
		}

		state.currTargets = state.currTargets.filter((_, i) => indicesToKeep.includes(i));
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
