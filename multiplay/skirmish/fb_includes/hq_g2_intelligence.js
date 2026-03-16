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

	createIntelRequest({missionType, payload, priority=MISSION_PRIORITY.LOW}) {
		return {
			'missionType': missionType,
			'payload': payload,
			'priority': priority
		};
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

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(getSectorIntelFromGameEngine, sectorInfo, missionType);		
		md.ceaseOrders = () => this.#mcb(this.#finaliseEngineCall, md);

		return md;
	}

	/*
		REAL-TIME TARGETING
	*/
	
	#classifyObject(obj) {

		let flags = 0;

		// Object-type agnostic capability
		if (isAntiAirDefense(obj)) {
			flags |= OBJ_FLAGS.ADA;
		}

		if (obj.hasIndirect === true) {
			flags |= OBJ_FLAGS.INDIRECT_FIRE;
		}

		if (obj.type === DROID) {

			switch (obj.propulsion) {
				case PROPULSIONS["Cyborg Propulsion"].id: 
					flags |= OBJ_FLAGS.CYBORG_PROPULSION;
					break;
				case PROPULSIONS["Wheels"].id:
					flags |= OBJ_FLAGS.WHEELED_PROPULSION;
					break;
				case PROPULSIONS["Half-tracks"].id:
					flags |= OBJ_FLAGS.HALF_TRACKED_PROPULSION;
					break;
				case PROPULSIONS["Tracks"].id:
					flags |= OBJ_FLAGS.TRACKED_PROPULSION;
					break;
				case PROPULSIONS["Hover"].id:
					flags |= OBJ_FLAGS.HOVER_PROPULSION;
					break;
				case PROPULSIONS["VTOL"].id:
					flags |= OBJ_FLAGS.VTOL_PROPULSION;
					break;

				default:
					flags |= OBJ_FLAGS.TRACKED_PROPULSION;
					debug(`WARNING	intelligence/#classifyObject(): obj.propulsion was not understood: ${obj.propulsion}`);
			}

			// Droid-specific capability
			if (obj.droidType === DROID_CONSTRUCT) {
				flags |= OBJ_FLAGS.CONSTRUCTOR;
				return flags;
			}
			
			if (obj.droidType === DROID_REPAIR) {
				flags |= OBJ_FLAGS.REPAIR;
				return flags;
			}

			const ARMOUR_MASK = OBJ_FLAGS.HALF_TRACKED_PROPULSION | OBJ_FLAGS.TRACKED_PROPULSION | OBJ_FLAGS.WHEELED_PROPULSION | OBJ_FLAGS.HOVER_PROPULSION;
			if (obj.droidType === DROID_WEAPON || obj.droidType === DROID_CYBORG) {
				if (flags & ARMOUR_MASK) {
					flags |= OBJ_FLAGS.ARMOUR;
				} else if (flags & OBJ_FLAGS.VTOL_PROPULSION) {
					flags |= OBJ_FLAGS.AVIATION;
				}
			}

			if (obj.droidType === DROID_CYBORG) {
				flags |= OBJ_FLAGS.INFANTRY;
			}

			return flags;
		}


		if (obj.type === STRUCTURE) {
			if (obj.stattype === DEFENSE) {
				flags |= OBJ_FLAGS.DEFENSIVE_STRUCTURE;
				return flags;
			}

			const INDUSTRIAL_TARGETS = [FACTORY, CYBORG_FACTORY, VTOL_FACTORY];	
			if (INDUSTRIAL_TARGETS.includes(obj.stattype)) {
				flags |= OBJ_FLAGS.PRODUCTION;
				return flags;					
			}

			if (obj.stattype === RESOURCE_EXTRACTOR) {
				flags |= OBJ_FLAGS.RESOURCE_EXTRACTOR;
				return flags;
			}

			if (obj.stattype === REPAIR_FACILITY) {
				flags |= OBJ_FLAGS.REPAIR;
				return flags;
			}
		}
		
		return flags;
	}

	#createNewTarget(targetObject, flags=0, gx=0, gy=0) {
		return {
			'name': targetObject.name,

			// These 3 parameters allow 'getObject' to be used at a later point to retrieve up-to-date object information
			'type': targetObject.type,
			'player': targetObject.player,
			'id': targetObject.id,

			'flags': flags,
			'gx': gx,
			'gy': gy,

			// This is used by the mission management system to store the priority at the time of assignment
			'priority': MISSION_PRIORITY.LOW,
		};
	}

	/**
	`getAllObjects()`

	This function performs multiple functions:
	1. Gets all droids & structures on the map (like taking a satellite image of the whole map)
	2. Classifies all droids & structures, populating a new `playerInfo` and a new `grid` 
	 */
	getAllObjects(state) {

		// Note: trying a new pattern; extract all relevant parameters from state at the start
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;
		const cellSize = state.grid.cellSize;
		const createNewFbGridCell = (...args) => state.grid.createNewFbGridCell(...args); 
		const createPlayerInfoEntry = (...args) => state.createPlayerInfoEntry(...args);
		
		let grid = create2DGrid(numXCells, numYCells, createNewFbGridCell);

		let objectsByPlayer = getDroidsAndStructsByPlayer();		// this information is fresh

		let result = {
			'playerInfo': [],
			'allTargets': [],
			'grid': grid
		}

		for (let i=0; i<objectsByPlayer.length; i++) {
			const currPlayerEntry = objectsByPlayer[i];

			let p = createPlayerInfoEntry(currPlayerEntry['playerID']);

			// Collate droid information
			const IS_TARGET = !p['isFriendly'];

			for (let j=0; j<currPlayerEntry['droids'].length; j++) {
				const obj = currPlayerEntry['droids'][j];
				const flags = this.#classifyObject(obj);

				// Update player information
				p['numTotalUnits']++;

				const ARMOUR_FORBIDDEN_FLAGS = (OBJ_FLAGS.ADA | OBJ_FLAGS.INDIRECT_FIRE);
				const INDIRECT_FIRE_FORBIDDEN_FLAGS = (OBJ_FLAGS.AVIATION | OBJ_FLAGS.INFANTRY);

				if (flags & OBJ_FLAGS.ARMOUR && !(flags & ARMOUR_FORBIDDEN_FLAGS)) {
					p['numArmourUnits']++;
				} 

				if (flags & OBJ_FLAGS.INDIRECT_FIRE && !(flags & INDIRECT_FIRE_FORBIDDEN_FLAGS)) {
					p['numIndirectUnits']++;
				}

				if (flags & OBJ_FLAGS.INFANTRY) {
					p['numInfantryUnits']++;
				}

				if (flags & OBJ_FLAGS.AVIATION) {
					p['numAirUnits']++;
				}

				if (flags & OBJ_FLAGS.ADA) {
					p['numADA']++;
				}
				
				// Update target list
				const gx = Math.floor(obj.x / cellSize), gy = Math.floor(obj.y / cellSize);		// cellSize is used for computing grid coords
				const newObj = this.#createNewTarget(obj, flags, gx, gy);

				if (IS_TARGET) {
					grid[gx][gy]['targetUnits'].push(newObj);
					if (flags & OBJ_FLAGS.ADA) {
						grid[gx][gy]['adaCount']++;
					}
					result.allTargets.push(newObj);		
				} else {
					grid[gx][gy]['friendlyUnits'].push(newObj);
				}
			}	

			// Collate structure information
			for (let j=0; j<currPlayerEntry['structs'].length; j++) {
				const obj = currPlayerEntry['structs'][j];
				const flags = this.#classifyObject(obj);

				// Update player information
				p['numStructs'] += 1;

				if (flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					p['numDerricks']++;
				}

				if (flags & OBJ_FLAGS.PRODUCTION) {
					p['numFactories']++;
				}

				// Update target list
				const gx = Math.floor(obj.x / cellSize), gy = Math.floor(obj.y / cellSize);		// cellSize is used for computing grid coords
				const newObj = this.#createNewTarget(obj, flags, gx, gy);

				// Update target list
				if (IS_TARGET) {
					grid[gx][gy]['targetStructures'].push(newObj);
					if (flags & OBJ_FLAGS.ADA) {
						grid[gx][gy]['adaCount']++;
					}
					result.allTargets.push(newObj);		
				} else {
					grid[gx][gy]['friendlyStructures'].push(newObj);
				}
			}

			result.playerInfo.push(p);
		}

		return result;

	}

	getDefencesNearDerricks(state) {

		// Note: trying a new pattern; extract all relevant parameters from state at the start
		const grid = state.grid.grid;
		const gridEnumRange = (...args) => state.grid.enumRange(...args);
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;

		const SEARCH_RADIUS = 8;
		let lowPriorityTargets = [], medPriorityTargets = [], highPriorityTargets = [];

		// Here we use the grid definition of derricks; it includes the pre-computed spatial clustering
		// This spatial clustering allows us to skip over multiple derricks
		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {

				const nearbyDerricks = grid[gx][gy]['derricks'];
				
				for (let i=0; i<nearbyDerricks.length; i++) {
					const d = nearbyDerricks[i];
					const t = gridEnumRange(d.x, d.y, SEARCH_RADIUS);
					if (t['structs'].length > 0) {
						// debug(`t['structs'].length ${t['structs'].length}`);
					}
					
					if (t['structs'].length - nearbyDerricks.length >= 5) {
						// debug(`		skipped sector with derrick (near ${d.x} ${d.y})`);
						break;		// intent: handle the case of old "dangerous sectors"
					}

					let defences = [], trucks = [];

					t['structs'].forEach(target => {
						if (target.flags & OBJ_FLAGS.DEFENSIVE_STRUCTURE) {
							// debug(`		added ${target.name} (${target.id}) near ${d.x} ${d.y}`);
							defences.push(target);
						}
					});

					t['droids'].forEach(target => {
						if (target.flags & OBJ_FLAGS.CONSTRUCTOR) {
							trucks.push(target);
						}
					})

					if (nearbyDerricks.length >= 4) {
						highPriorityTargets.push(...defences, ...trucks);
						break;			// intent: handle the case of multiple derricks next to each other
					} else if (nearbyDerricks.length >= defences.length) {
						medPriorityTargets.push(...trucks, ...defences);
					} else {
						lowPriorityTargets.push(...trucks, ...defences);
					}
				}
			}
		}

		return [...highPriorityTargets, ...medPriorityTargets, ...lowPriorityTargets];
	}

	getBaseTargets(state) {
		// Note: trying a new pattern; extract all relevant parameters from state at the start
		const gridEnumBoundingBox = (...args) => state.grid.enumBoundingBox(...args);
		const bases = state.poi.bases;

		let result = {
			'productionTargets': [],
			'adaTargets': [],
		}

		const enemyPlayerIDs = state.enumLivingPlayers().filter(isEnemy); 
		if (enemyPlayerIDs.length === 0) {
			return result;
		}

		const SEARCH_RADIUS = 30;
		for (let i=0; i<bases.length; i++) {
			if (!enemyPlayerIDs.includes(i)) {
				continue;
			}

			// this is a version of grid.enumRange where positional accuracy is not critical
			const t = gridEnumBoundingBox(bases[i].x, bases[i].y, SEARCH_RADIUS);		

			for (let j=0; j<t['structs'].length; j++) {
				if (t['structs'][j].flags & OBJ_FLAGS.ADA) {
					result.adaTargets.push(t['structs'][j]);
					continue;
				}
				if (t['structs'][j].flags & OBJ_FLAGS.PRODUCTION) {
					result.productionTargets.push(t['structs'][j]);
					continue;
				}
				if (t['structs'][j].flags & OBJ_FLAGS.REPAIR) {
					result.productionTargets.unshift(t['structs'][j]);
					continue;
				}
			}

			for (let j=0; j<t['droids'].length; j++) {
				if (t['droids'][j].flags & OBJ_FLAGS.ADA) {
					result.adaTargets.push(t['droids'][j]);
				}
				if (t['droids'][j].flags & OBJ_FLAGS.CONSTRUCTOR) {
					result.productionTargets.push(t['droids'][j]);
				}

			}
		}	

		return result;
	}
	
	/** 
	 * This function performs these roles:
	 *		- finding the closest droid
	 *		- calculating how many targets are in the immediate radius
	 *		- classifying each object into different, useful categories
	 *		- compressing each gameObject for efficient storage & use
	 * with O(N) algorithmic complexity. 
	 */
	proposeTargetsInRadius2({state, loc, searchRadius=20, immediateRadius=10}) {

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
			'closestObjects': [],				// a temporary cache so this function can be executed less
			'targetsInImmediateRadius': 0
		};		

		if (!defined(loc)) {
			debug(`WARNING:	proposeTargetsInRadius2(): 'loc' was undefined.`);
			return proposedTargets;
		}

		const t = state.grid.enumRange(loc.x, loc.y, searchRadius); 

		let targetList = [...t['droids'], ...t['structs']];
		// debug(`t ${targetList.length} (d ${t['droids'].length}, s ${t['structs'].length}), allT ${state.allTargets.length}`);

		if (targetList.length === 0) {
			targetList = state.allTargets;			
		}

		if (targetList.length === 0) {
			return proposedTargets;
		}

		let closestObject = undefined;
		let closestDistSq = 0;

		let enemyVtols = [];

		for (let i=0; i<targetList.length; i++) {
			const t = targetList[i];
			const obj = getObject(t.type, t.player, t.id);
			if (!defined(obj)) {
				// The target could come from a stale database e.g. allTargets
				continue;
			}

			// Update closestDroid (excludes VTOLs)
			if (!(t.flags & OBJ_FLAGS.AVIATION)) {

				const distSquaredToLoc = distSq(obj.x, loc.x, obj.y, loc.y);

				// Add closestObjects (should be called closestTargets)
				if (distSquaredToLoc <= immediateRadius ** 2) {
					proposedTargets["closestObjects"].push(t);
					proposedTargets["targetsInImmediateRadius"] += 1;
				}

				// Update closestObject (should be called closestTarget)
				if (!defined(closestObject)) {
					closestObject = t;
					closestDistSq = distSq(obj.x, loc.x, obj.y, loc.y);
				} else {
					if (distSquaredToLoc < closestDistSq) {
						closestObject = t;
						closestDistSq = distSquaredToLoc;
					}
				}
			} else {
				enemyVtols.push(t);
			}

			// Classify the object
			if (t.flags & OBJ_FLAGS.ADA) {
				proposedTargets["enemyADA"].push(t);
				continue;
			}

			if (obj.type === DROID) {
				if (t.flags & OBJ_FLAGS.CONSTRUCTOR) {
					proposedTargets["enemyConstructor"].push(t);
					continue;
				} 

				if (t.flags & OBJ_FLAGS.INFANTRY) {
					proposedTargets["enemyInfantry"].push(t);		
					continue;
				}

				if (t.flags & OBJ_FLAGS.AVIATION) {
					proposedTargets["enemyAviation"].push(t);
					continue;
				}

				if (t.flags & OBJ_FLAGS.INDIRECT_FIRE) {
					// cyborg indirect (e.g. grenadier) & VTOL indirect (e.g. bombs) were filtered out earlier
					proposedTargets["enemyIndirectFire"].push(t);
					continue;
				}

				// This leaves only direct fire land vehicles & other utility vehicles e.g. sensors / commanders
				if (t.flags & OBJ_FLAGS.ARMOUR) {
					proposedTargets["enemyArmor"].push(t);
					continue;		
				}

				proposedTargets["enemyUtility"].push(t);
				continue;
			}

			if (obj.type === STRUCTURE) {
				if (t.flags & OBJ_FLAGS.INDIRECT_FIRE) {
					proposedTargets["enemyIndirectFire"].push(t);
					continue;
				}
				
				if (t.flags & OBJ_FLAGS.DEFENSIVE_STRUCTURE) {
					proposedTargets["enemyDefenses"].push(t);
					continue;
				}

				if (t.flags & OBJ_FLAGS.PRODUCTION) {
					proposedTargets["enemyIndustrial"].push(t);
					continue;					
				}

				proposedTargets["enemyUtility"].push(t);
				continue;
			}
		}

		if (defined(closestObject)) {
			proposedTargets["closestObject"] = closestObject;
		} else {
			// VTOLs are only directly targeted if no other targets exist
			proposedTargets["closestObject"] = enemyVtols[0];
		}

		return proposedTargets;

	}
	
}
