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

	/*
		MISSION CREATION
	*/
	createIntelRequest({missionType, payload, priority=MISSION_PRIORITY.LOW}) {
		return {
			'missionType': missionType,
			'payload': payload,
			'priority': priority
		};
	}

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

	#finaliseIntelMission(md) {
		// Mission completed
		md.timeCompleted = getCurrGameTime();
	}

	/*
		REAL-TIME TARGETING
	*/
	
	#classifyObject(obj) {

		let flags = 0;

		// Object-type agnostic capability
		if (isAntiAirDefense(obj)) {
			flags |= OBJ_FLAGS.ADA;

			if (obj.type === DROID) {
				if (obj.weapons.length > 0) {
					const weapon = obj.weapons[0];
					if (AA_DIRECT_FIRE_WEAPONS.includes(weapon)) {
						// Includes AA lasers & AA cannons
						flags |= OBJ_FLAGS.AA_DIRECT_FIRE_WEAPON;	
					} else if (AA_ROCKET_WEAPONS.includes(weapon)) {
						flags |= OBJ_FLAGS.AA_ROCKET_WEAPON;
					} else {
						flags |= OBJ_FLAGS.UNCLASSIFIED_WEAPON_TYPE;
					}
				}
			}			
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
			if (obj.droidType === DROID_WEAPON) {
				if (flags & ARMOUR_MASK) {
					flags |= OBJ_FLAGS.ARMOUR;
				} else if (flags & OBJ_FLAGS.VTOL_PROPULSION) {
					flags |= OBJ_FLAGS.AVIATION;
				}
			}

			if (obj.droidType === DROID_CYBORG) {
				flags |= OBJ_FLAGS.INFANTRY;
			}

			if (obj.weapons.length > 0) {
				const weapon = obj.weapons[0];		// ignoring special case of dual weapon body

				if (CANNON_WEAPONS.some(w => w.id === weapon.id)) {
					flags |= OBJ_FLAGS.CANNON_WEAPON;
				} else if (AT_ROCKET_WEAPONS.some(w => w.id === weapon.id)) {
					flags | OBJ_FLAGS.AT_ROCKET_WEAPON;
				} else if (MACHINEGUN_WEAPONS.some(w => w.id === weapon.id)) {
					flags |= OBJ_FLAGS.MACHINEGUN_WEAPON;
				} else if (SHORT_RANGE_ARTILLERY_WEAPONS.some(w => w.id === weapon.id)) {
					flags |= OBJ_FLAGS.SHORT_RANGE_ARTILLERY_WEP;
				} else if (LONG_RANGE_ARTILLERY_WEAPONS.some(w => w.id === weapon.id)) {
					flags |= OBJ_FLAGS.LONG_RANGE_ARTILLERY_WEP;
				} else if (VTOL_ARTILLERY_WEAPONS.some(w => w.id === weapon.id)) {
					flags |= OBJ_FLAGS.VTOL_ARTILLERY_WEAPON;
				} else if (AA_DIRECT_FIRE_WEAPONS.some(w => w.id === weapon.id)) {
					flags |= OBJ_FLAGS.AA_DIRECT_FIRE_WEAPON;
				} else if (AA_ROCKET_WEAPONS.some(w => w.id === weapon.id)) {
					flags |= OBJ_FLAGS.AA_ROCKET_WEAPON;
				} else if (LASER_WEAPONS.some(w => w.id === weapon.id)) {
					flags |= OBJ_FLAGS.LASER_WEAPON;
				} else if (FLAMER_WEAPONS.some(w => w.id === weapon.id)) {
					flags | OBJ_FLAGS.FLAMER_WEAPON;
				} else {
					flags |= OBJ_FLAGS.UNCLASSIFIED_WEAPON_TYPE;
				}
			} else {
				flags |= OBJ_FLAGS.UNCLASSIFIED_WEAPON_TYPE;
			}

			return flags;
		}

		if (obj.type === STRUCTURE) {
			if (obj.status === BUILT) {
				flags |= OBJ_FLAGS.IS_BUILT;
			}

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
	 * Prints `playerInfo` to the console.
	 * @param {*} p 
	 */
	#debugPrintPlayerInfo(p) {
		
		if (false) {
			debug(`== ${p.playerID} UNIT STATS ==`);

			// Print Unit stats
			debug(`\nnumTotalUnits: ${p['numTotalUnits']}`); 
			debug(`\tnumInfantryUnits: ${p['numInfantryUnits']}`); 
			debug(`\tnumArmourUnits: ${p['numArmourUnits']}`); 
            debug(`\tnumAirUnits: ${p['numAirUnits']}`);      
			debug(``);
            debug(`\tnumRocketUnits: ${p['numRocketUnits']}`);        
            debug(`\tnumCannonUnits: ${p['numCannonUnits']}`);      
            debug(`\tnumMGUnits: ${p['numMGUnits']}`);
            debug(`\tnumShortRangeIndirectUnits: ${p['numShortRangeIndirectUnits']}`);
            debug(`\tnumLongRangeIndirectUnits: ${p['numLongRangeIndirectUnits']}`);
            debug(`\tnumVTOLBombUnits: ${p['numVTOLBombUnits']}`);
            debug(`\tnumADAUnits: ${p['numADAUnits']}`); 
            debug(`\tnumLaserUnits: ${p['numLaserUnits']}`);
            debug(`\tnumFlamerUnits: ${p['numFlamerUnits']}`);
		}
	}

	/**
	`getAllObjects()`

	This function performs multiple functions:
	1. Gets all droids & structures on the map (like taking a satellite image of the whole map)
	2. Classifies all droids & structures, populating a new `playerInfo` and a new `grid` 

	@param {worldState} state
	@returns {Object}
	 */
	getAllObjects(state) {
		const numXCells = state.grid.numXCells;		// cellSize is used for computing grid coords
		const numYCells = state.grid.numYCells;
		const cellSize = state.grid.cellSize;
		const createExpandedFbGridCell = (gx, gy) => {
			let cell = state.grid.createNewFbGridCell(gx, gy);
			// Add custom parameters
			cell['adaCount'] = 0;					// for adaThreat      
			cell['fixedDefenceCount'] = 0; 			// for enemyStaticDefences
			cell['claimedDerricks'] = [];			// for updating of derrick information
			cell['enemyDirectFireUnitCount'] = 0;	// for direct fire unit threat
			return cell;
		};
		let grid = create2DGrid(numXCells, numYCells, createExpandedFbGridCell);

		// Reduced version of the version in worldStateBuilder
		const createNewClaimedDerrick = (x, y, playerID) => {       
			return {
				'id': `DERRICK_${x}_${y}`,				
				'playerID': playerID,
			}
		};
		const createPlayerInfoEntry = (...args) => state.createPlayerInfoEntry(...args);

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
				const gx = Math.floor(obj.x / cellSize), gy = Math.floor(obj.y / cellSize);		

				// Update player information
				p['numTotalUnits']++;

				// UNIT "BODY" (ARMOUR, CYBORGS, VTOLS)
				const ARMOUR_FORBIDDEN_FLAGS = (OBJ_FLAGS.ADA | OBJ_FLAGS.INDIRECT_FIRE);

				if (flags & OBJ_FLAGS.ARMOUR && !(flags & ARMOUR_FORBIDDEN_FLAGS)) {
					p['numArmourUnits']++;
				} else if (flags & OBJ_FLAGS.INFANTRY) {
					p['numInfantryUnits']++;
				} else if (flags & OBJ_FLAGS.AVIATION) {
					p['numAirUnits']++;
				}
			
				// UNIT "WEAPON"
				if (flags & OBJ_FLAGS.CANNON_WEAPON) {
					p['numCannonUnits']++;
				} else if (flags & OBJ_FLAGS.AT_ROCKET_WEAPON) {
					p['numRocketUnits']++;
				} else if (flags & OBJ_FLAGS.MACHINEGUN_WEAPON) {
					p['numMGUnits']++;
				} else if (flags & OBJ_FLAGS.SHORT_RANGE_ARTILLERY_WEP) {
					p['numShortRangeIndirectUnits']++;
				} else if (flags & OBJ_FLAGS.LONG_RANGE_ARTILLERY_WEP) {
					p['numLongRangeIndirectUnits']++;
				} else if (flags & OBJ_FLAGS.VTOL_ARTILLERY_WEAPON) {
					p['numVTOLBombUnits']++;
				} else if (flags & (OBJ_FLAGS.AA_DIRECT_FIRE_WEAPON | OBJ_FLAGS.AA_ROCKET_WEAPON)) {
					p['numADAUnits']++;
				} else if (flags & OBJ_FLAGS.LASER_WEAPON) {
					p['numLaserUnits']++;
				} else if (flags & OBJ_FLAGS.FLAMER_WEAPON) {
					p['numFlamerUnits']++;
				} else if (flags & OBJ_FLAGS.CONSTRUCTOR) {
					p['numTrucks']++;
				}

				// Update target list
				const newObj = this.#createNewTarget(obj, flags, gx, gy);
				if (IS_TARGET) {
					result.allTargets.push(newObj);		
					grid[gx][gy]['targetUnits'].push(newObj);

					// Further classification (TODO: consider splitting into separate function)
					if (flags & OBJ_FLAGS.ADA) {
						grid[gx][gy]['adaCount']++;
					}

					const DIRECT_FIRE_UNITS = OBJ_FLAGS.ARMOUR | OBJ_FLAGS.INDIRECT_FIRE | OBJ_FLAGS.INFANTRY;
					if (flags & DIRECT_FIRE_UNITS) {
						grid[gx][gy]['enemyDirectFireUnitCount']++;
					}

				} else {
					grid[gx][gy]['friendlyUnits'].push(newObj);
				}
			}	

			// Collate structure information
			for (let j=0; j<currPlayerEntry['structs'].length; j++) {
				const obj = currPlayerEntry['structs'][j];
				
				const flags = this.#classifyObject(obj);
				const gx = Math.floor(obj.x / cellSize), gy = Math.floor(obj.y / cellSize);		

				// Update player information
				p['numStructs'] += 1;

				if (flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					p['numDerricks']++;
					grid[gx][gy]['claimedDerricks'].push(createNewClaimedDerrick(obj.x, obj.y, obj.player));	
				}

				if (flags & OBJ_FLAGS.PRODUCTION) {
					p['numFactories']++;
				}

				// Update target list
				const newObj = this.#createNewTarget(obj, flags, gx, gy);

				if (IS_TARGET) {
					result.allTargets.push(newObj);		
					grid[gx][gy]['targetStructures'].push(newObj);
					
					// ADA defences
					if (flags & OBJ_FLAGS.ADA) {
						grid[gx][gy]['adaCount']++;
					}

					// Ground defences
					const BUILT_DEFENCE = OBJ_FLAGS.DEFENSIVE_STRUCTURE | OBJ_FLAGS.IS_BUILT;
					if ((flags & BUILT_DEFENCE) === BUILT_DEFENCE && !(flags & OBJ_FLAGS.ADA)) {
						grid[gx][gy]['fixedDefenceCount']++;
					}
				} else {
					grid[gx][gy]['friendlyStructures'].push(newObj);
				}
			}

			this.#debugPrintPlayerInfo(p);
			result.playerInfo.push(p);
		}

		return result;

	}

	/**
	 * 
	 * @param {worldState} state 
	 * @returns 
	 */
	getTargetsNearDerricks(state) {

		const grid = state.grid.grid;
		const cellSize = state.grid.cellSize;

		const SEARCH_RADIUS = cellSize;
		let targetsNearDerricks = [];

		let seenGridCoord = [];
		for (let i=0; i<state.poi.derricks.length; i++) {
			const d = state.poi.derricks[i];
			
			let seen = false;
			for (let j=0; j<seenGridCoord.length; j++) {
				if (seenGridCoord[j].gx === d.gx && seenGridCoord[j].gy === d.gy) {
					seen = true;
					break;
				}
			}
			if (seen) {
				continue;
			}

			const t = state.grid.enumRange(d.x, d.y, SEARCH_RADIUS);

			let defences = [], trucks = [], derricks = [];

			t['targetStructures'].forEach(target => {
				if (target.flags & OBJ_FLAGS.DEFENSIVE_STRUCTURE) {
					if (target.flags & OBJ_FLAGS.INDIRECT_FIRE) {
						defences.unshift(target);
					} else {
						defences.push(target);
					}
				}
				if (target.flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					derricks.push(target);
				}
			});

			t['targetUnits'].forEach(target => {
				if (target.flags & OBJ_FLAGS.CONSTRUCTOR) {
					trucks.push(target);
				}
			});

			targetsNearDerricks.push(...trucks, ...defences, ...derricks);

			seenGridCoord.push({'gx': d.gx, 'gy': d.gy});
		}

		return targetsNearDerricks;

	}

	/**
	 * 
	 * @param {worldState} state 
	 * @returns 
	 */
	getBaseTargets(state) {
		// Note: trying a new pattern; extract all relevant parameters from state at the start
		const bases = state.poi.bases;
		const enemyPlayerIDs = state.enumLivingPlayers().filter(isEnemy); 

		let result = {
			'productionTargets': [],
			'adaTargets': [],
		}

		if (enemyPlayerIDs.length === 0) {
			return result;
		}

		const SEARCH_RADIUS = 30;
		for (let i=0; i<bases.length; i++) {
			if (!enemyPlayerIDs.includes(i)) {
				continue;
			}

			const t = state.grid.enumRange(bases[i].x, bases[i].y, SEARCH_RADIUS);		

			for (let j=0; j<t['targetStructures'].length; j++) {
				if (t['targetStructures'][j].flags & OBJ_FLAGS.ADA) {
					result.adaTargets.push(t['targetStructures'][j]);
					continue;
				}
				if (t['targetStructures'][j].flags & OBJ_FLAGS.PRODUCTION) {
					result.productionTargets.push(t['targetStructures'][j]);
					continue;
				}
				if (t['targetStructures'][j].flags & OBJ_FLAGS.REPAIR) {
					result.productionTargets.unshift(t['targetStructures'][j]);
					continue;
				}
			}

			for (let j=0; j<t['targetUnits'].length; j++) {
				if (t['targetUnits'][j].flags & OBJ_FLAGS.ADA) {
					result.adaTargets.push(t['targetUnits'][j]);
				}
				if (t['targetUnits'][j].flags & OBJ_FLAGS.CONSTRUCTOR) {
					result.productionTargets.push(t['targetUnits'][j]);
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
	 * 
	 * @param {worldState} state
	 * @param {BaseObject} loc
	 * @param {number} searchRadius
	 * @param {number} immediateRadius
	 * @returns {Object}
	 */
	proposeTargetsInRadius2(state, loc, searchRadius, immediateRadius) {

		const allTargets = state.allTargets;

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

		let targetList = [...t['targetUnits'], ...t['targetStructures']];
		// debug(`t ${targetList.length} (d ${t['droids'].length}, s ${t['structs'].length}), allT ${allTargets.length}`);

		if (targetList.length === 0) {
			targetList = allTargets;			
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
