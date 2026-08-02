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
		REAL-TIME TARGETING
	*/

	/**
	 * Gets targets around all derricks (including friendly derricks).
	 * @param {worldState} state 
	 * @returns {AirStrikeMissionRequest[]}
	 */
	getTargetsNearDerricks(state) {

		const allDerricks = state.poi.derricks;
		const cellSize = state.grid.cellSize;

		const SEARCH_RADIUS = cellSize;

		const targetsNearDerricks = [];
		const seenGridCoord = [];

		// Temporary buffers to store targeting data
		/** @type {AirStrikeMissionRequest[]} */
		const defences = [];
		/** @type {AirStrikeMissionRequest[]} */
		const trucks = [];
		/** @type {AirStrikeMissionRequest[]} */
		const derricks = [];

		const resetTargetBuffersInPlace = () => {
			defences.length = 0;
			trucks.length = 0;
			derricks.length = 0;
		}

		const createRaidRequest = (obj, priority) => aviation.translateIntoRaidRequest(obj, priority);

		for (let i=0; i<allDerricks.length; i++) {
			const d = allDerricks[i];
			
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

			const nearby = state.grid.enumRangeLazy(d.x, d.y, SEARCH_RADIUS, true, false);
			resetTargetBuffersInPlace();

			nearby['targetStructures'].forEach(t => {
				const flags = t.flags;
				const obj = getObject(t.type, t.player, t.id);
				if (obj == null) {
					return;
				}

				if (flags & OBJ_FLAGS.DEFENSIVE_STRUCTURE) {
					if (flags & OBJ_FLAGS.INDIRECT_FIRE) {
						defences.unshift(createRaidRequest(obj, MISSION_PRIORITY.HIGH));
					} else {
						defences.push(createRaidRequest(obj, MISSION_PRIORITY.HIGH));
					}
					return;
				}
				if (flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					derricks.push(createRaidRequest(obj, MISSION_PRIORITY.MEDIUM));
				}
			});

			nearby['targetUnits'].forEach(t => {			
				const flags = t.flags;
				const obj = getObject(t.type, t.player, t.id);
				if (obj == null) {
					return;
				}

				if (flags & OBJ_FLAGS.CONSTRUCTOR && !(flags & OBJ_FLAGS.CYBORG_PROPULSION)) {
					trucks.push(createRaidRequest(obj, MISSION_PRIORITY.LOW));
				}
			});

			targetsNearDerricks.push(...trucks, ...defences, ...derricks);

			seenGridCoord.push({'gx': d.gx, 'gy': d.gy});
		}

		return targetsNearDerricks;
	}

	/**
	 * Gets targets around all enemy bases. Currently used for VTOL targeting only (FishBot v0.4.0).
	 * @param {worldState} state 
	 */
	getBaseTargets(state) {
		const bases = state.poi.bases;
		const enemyPlayerIDs = state.enumLivingPlayers().filter(isEnemy); 

		const result = {
			/** @type {AirStrikeMissionRequest[]} */
			'productionTargets': [],
			/** @type {AirStrikeMissionRequest[]} */
			'adaTargets': [],
			/** @type {AirStrikeMissionRequest[]} */
			'indirectFireTargets': [],
			/** @type {AirStrikeMissionRequest[]} */
			'defensiveStructureTargets': [],
		};

		if (enemyPlayerIDs.length === 0) {
			return result;
		}

		const createDASRequest = (obj, priority) => aviation.translateIntoDASRequest(obj, priority);

		const SEARCH_RADIUS = 30;
		for (let i=0; i<bases.length; i++) {
			if (!enemyPlayerIDs.includes(i)) {
				continue;
			}

			const nearby = state.grid.enumRangeLazy(bases[i].x, bases[i].y, SEARCH_RADIUS, true, false);		

			nearby['targetStructures'].forEach(t => {
				const flags = t.flags;
				const obj = getObject(t.type, t.player, t.id);
				if (obj == null) {
					return;
				}

				if (flags & OBJ_FLAGS.ADA) {
					result.adaTargets.push(createDASRequest(obj, MISSION_PRIORITY.VERY_HIGH));
					return;
				}
				if (flags & OBJ_FLAGS.PRODUCTION) {
					result.productionTargets.push(createDASRequest(obj, MISSION_PRIORITY.VERY_HIGH));
					return;
				}
				if (flags & OBJ_FLAGS.INDIRECT_FIRE) {
					result.indirectFireTargets.push(createDASRequest(obj, MISSION_PRIORITY.HIGH));
					return;
				}
				if (flags & OBJ_FLAGS.DEFENSIVE_STRUCTURE) {
					result.defensiveStructureTargets.push(createDASRequest(obj, MISSION_PRIORITY.HIGH));
					return;
				}
			});

			nearby['targetUnits'].forEach(t => {
				const flags = t.flags;
				const obj = getObject(t.type, t.player, t.id);
				if (obj == null) {
					return;
				}

				if (flags & OBJ_FLAGS.ADA) {
					result.adaTargets.push(createDASRequest(obj, MISSION_PRIORITY.VERY_HIGH));
					return;
				}
				if (flags & OBJ_FLAGS.CONSTRUCTOR && !(flags & OBJ_FLAGS.CYBORG_PROPULSION)) {
					// Cyborg propulsion is omitted because FishBot 0.4.0 does not use anti-cyborg VTOL weapons
					result.productionTargets.push(createDASRequest(obj, MISSION_PRIORITY.LOW));
					return;
				}
				if (flags & OBJ_FLAGS.INDIRECT_FIRE && !(flags & OBJ_FLAGS.CYBORG_PROPULSION)) {
					// Cyborg propulsion is omitted because FishBot 0.4.0 does not use anti-cyborg VTOL weapons (e.g. will falsely attack grenadiers)
					result.indirectFireTargets.push(createDASRequest(obj, MISSION_PRIORITY.HIGH));
					return;
				}
			});
		}	

		return result;
	}
	
	/** 
	 * This function classifies each object in `searchRadius` of (`x`, `y`) into useful categories.
	 * It does not need to call `getObject` to get up-to-date position data as the caller function will now perform that role.
	 * @param {worldState} state
	 * @param {PositionInfo} loc
	 * @param {number} searchRadius
	 * @returns {Object}
	 */
	getTargetClassesInRadius(state, loc, searchRadius) {

		/** @type {NearbyTargets} */
		const proposedTargets = {
			'enemyArmor': [], 
			'enemyInfantry': [], 
			'enemyIndirectFire': [], 
			'enemyADA': [], 
			'enemyAviation': [], 
			'enemyConstructor': [], 
			'enemyIndustrial': [], 
			'enemyUtility': [], 
			'enemyDefenses': [],
		};		

		const LOC_X = loc.x;
		const LOC_Y = loc.y;
		/**
		 * Returns combined list containing `targetUnits` and `targetStructures`.
		 * @param {number} x 
		 * @param {number} y 
		 * @param {number} searchRadius 
		 * @returns {FbObject[]}
		 */
		const getTargetsNear = (x, y, searchRadius) => {
			const nearby = state.grid.enumRangeLazy(x, y, searchRadius, true, false); 
			return [...nearby['targetUnits'], ...nearby['targetStructures']];
		};

		// Search `searchRadius` first, then get all objects on the map if no targets exist. TODO: modify to sequentially double radius up to mapWidth (for large maps).
		const targetObjects = getTargetsNear(LOC_X, LOC_Y, searchRadius);

		if (targetObjects.length === 0) {
			return proposedTargets;
		}

		for (let i=0; i<targetObjects.length; i++) {
			const t = targetObjects[i];

			const flags = t.flags;
			const objectType = t.type;

			// Classify the object
			if (flags & OBJ_FLAGS.ADA) {
				proposedTargets["enemyADA"].push(t);
				continue;
			}

			if (objectType === DROID) {
				if (flags & OBJ_FLAGS.CONSTRUCTOR) {
					proposedTargets["enemyConstructor"].push(t);
					continue;
				} 

				if (flags & OBJ_FLAGS.INFANTRY) {
					proposedTargets["enemyInfantry"].push(t);		
					continue;
				}

				if (flags & OBJ_FLAGS.AVIATION) {
					proposedTargets["enemyAviation"].push(t);
					continue;
				}

				if (flags & OBJ_FLAGS.INDIRECT_FIRE) {
					// cyborg indirect (e.g. grenadier) & VTOL indirect (e.g. bombs) were filtered out earlier
					proposedTargets["enemyIndirectFire"].push(t);
					continue;
				}

				// This leaves only direct fire land vehicles & other utility vehicles e.g. sensors / commanders
				if (flags & OBJ_FLAGS.ARMOUR) {
					proposedTargets["enemyArmor"].push(t);
					continue;		
				}

				proposedTargets["enemyUtility"].push(t);
				continue;
			}

			if (objectType === STRUCTURE) {
				if (flags & OBJ_FLAGS.INDIRECT_FIRE) {
					proposedTargets["enemyIndirectFire"].push(t);
					continue;
				}
				
				if (flags & OBJ_FLAGS.DEFENSIVE_STRUCTURE) {
					proposedTargets["enemyDefenses"].push(t);
					continue;
				}

				if (flags & (OBJ_FLAGS.PRODUCTION | OBJ_FLAGS.RESOURCE_EXTRACTOR | OBJ_FLAGS.POWER_GENERATOR)) {
					proposedTargets["enemyIndustrial"].push(t);
					continue;					
				}

				proposedTargets["enemyUtility"].push(t);
				continue;
			}
		}

		return proposedTargets;

	}
	
	/**
	 * Returns location of the closest enemy base. If none exists, returns the local player's `baseLocation`.
	 * @param {worldState} state 
	 * @param {number} x 
	 * @param {number} y 
	 */
	findClosestEnemyBase(state, x, y) {
		const bases = state.poi.bases;
		const aliveEnemyPlayers = state.enumLivingPlayers().filter(isEnemy);

		/** @type {PlayerHomeBaseObject[]} */
		const enemyBases = [];
		bases.forEach(b => {
			if (b.playerID == null) 	return;
			if (b.isEnemy && aliveEnemyPlayers.includes(b.playerID)) {
				enemyBases.push(b);
			}
		});

		enemyBases.sort((a, b) => distSq(a.x, x, a.y, y) - distSq(b.x, x, b.y, y));
		
		if (enemyBases.length > 0) {
			return enemyBases[0];
		} else {
			// debug(`${gameTime}: WARNING: closestEnemyBase not found - returning player's home base location instead.`);
			return state.poi.bases[me];
		}
	}

	/**
	 * Returns location of the closest target object.
	 * @param {worldState} state 
	 * @param {number} x 
	 * @param {number} y 
	 * @return {DroidObject | StructureObject | FeatureObject | undefined}
	 */
	findClosestTarget(state, x, y) {

		const xMax = state.grid.numXCells;
		const yMax = state.grid.numYCells;
		const cellSize = state.grid.cellSize;
		const grid = state.grid.grid;

		const isReachable = state.mapData.isReachable;

		/** @type {Coordinate[]} */
		const visited = [];
		const isVisited = new Array(xMax * yMax).fill(false);

		/** @type {Coordinate[]} */
		const toSearch = [[Math.floor(x / cellSize), Math.floor(y / cellSize)]];
		const inSearchList = new Array(xMax * yMax).fill(false);	

		const MAX_MAP_DIM = 256;
		const MAX_CELLS = Math.ceil(MAX_MAP_DIM / cellSize);
		const MAX_ITERS = Math.min(xMax * yMax, MAX_CELLS * MAX_CELLS);
		let iters = 0;

		const unreachableTargets = [];
		
		// Formatted as [x, y, manhattanDistance]
		// const NEIGHBOUR_OFFSETS = [[-1, -1, 2], [-1, 0, 1], [-1, 1, 2], [0, 1, 1], [1, 1, 2], [1, 0, 1], [1, -1, 2], [0, -1, 1]];
		const NEIGHBOUR_OFFSETS = [[-1, 0, 1], [0, 1, 1], [1, 0, 1], [0, -1, 1]];

		while (toSearch.length != 0 && iters < MAX_ITERS) {
			const node = toSearch.shift();
			if (node == undefined) {
				break;
			}
			const gx = node[0], gy = node[1];

			visited.push(node);
			isVisited[gy * xMax + gx] = true;

			// Check neighbours
			for (let j=0; j<NEIGHBOUR_OFFSETS.length; j++) {
				const o = NEIGHBOUR_OFFSETS[j];
				const ox = o[0] + node[0];
				const oy = o[1] + node[1];
				const oIdx = oy * xMax + ox;
				// const d = o[2];

				// Check in map bounds
				if (ox < 0 || ox >= xMax) {
					continue;
				}
				if (oy < 0 || oy >= yMax) {
					continue;
				}

				if (isVisited[oIdx]) {
					continue;
				}

				if (inSearchList[oIdx]) {
					continue;
				}
				
				if (grid[ox][oy]['targetStructures'].length > 0 || grid[ox][oy]['targetUnits'].length > 0) {
					const potentialTargets = [...grid[ox][oy]['targetStructures'], ...grid[ox][oy]['targetUnits']];
					for (let j=0; j<potentialTargets.length; j++) {
						const t = potentialTargets[j];
						const obj = getObject(t.type, t.player, t.id);
						if (obj == null) {
							continue;
						}
						if (isReachable[obj.x][obj.y]) {		// this is here to handle targets on water terrain / islands. FishBot will ignore these for now.
							// debug(`${gameTime}: intel/findClosestTarget: BFS in ${iters} iterations (returning ${obj.name} (${obj.x}, ${obj.y})).`);
							return obj;
						} else {
							unreachableTargets.push(obj);
						}
					};
				}

				toSearch.push([ox, oy]);
				inSearchList[oIdx] = true;
			};

			iters++;
		}

		for (let i=0; i<unreachableTargets.length; i++) {
			const obj = unreachableTargets[i];
			debug(`${gameTime}\t(FishBot ${me}): findClosestTarget() returned unreachableTarget: "${obj.name}" (type: ${obj.type}, player: ${obj.player}, id: ${obj.id})`);
			return unreachableTargets[i];
		}

		// debug(`${gameTime}: intel/findClosestTarget: BFS in ${iters} iterations: no targets found.`);
		return undefined;
	}
		
}
