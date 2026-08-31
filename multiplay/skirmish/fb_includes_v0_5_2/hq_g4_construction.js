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

class armyEngineering {
	constructor() {

	}

	/**
	 * Gets the number of finished power, factory or research modules.
	 * @param {string} structureID 
	 * @returns {number}
	 */
	#getNumFinishedModules(structureID) {
		let completedModuleCount = 0;
		switch (structureID) {
			case STRUCTURES["Power Module"].id:
				let numFinishedGenerators = enumStruct(me, POWER_GEN).filter(s => s.status === BUILT);
				numFinishedGenerators.forEach(g => {completedModuleCount += g.modules;});
				break;
			case STRUCTURES["Factory Module"].id:
				let numFinishedFactories = enumStruct(me, FACTORY).filter(s => s.status === BUILT);
				let numFinishedVtolFactories = enumStruct(me, VTOL_FACTORY).filter(s => s.status === BUILT);
				numFinishedFactories.push(...numFinishedVtolFactories);		// add vtol factories to the end
				numFinishedFactories.forEach(f => {completedModuleCount += f.modules;});
				break;
			case STRUCTURES["Research Module"].id:
				let numFinishedLabs = enumStruct(me, RESEARCH_LAB).filter(s => s.status === BUILT);
				numFinishedLabs.forEach(l => {completedModuleCount += l.modules;})
				break;
			default:
				debug(`#getNumFinishedModules(): Could not recognise structureID ${structureID}, returning 0 modules`);
		}

		return completedModuleCount;
	}

	/**
	 * Costs the safest route from base to every grid cell, so oil capture can price the *trip* to a derrick
	 * rather than only the derrick itself.
	 *
	 * Trucks are dispatched with `orderDroidBuild()`, which leaves the walk to the engine's own pathfinder.
	 * That pathfinder knows nothing about the enemy, so it will happily route a truck straight through a
	 * standing army. This field is the planner's own view of the trip: cells holding an enemy force (or any
	 * static defence) are not routed through at all, and cells near one cost extra, so a target is only
	 * offered if some route to it avoids the enemy's field army, and a target reachable only by a long
	 * detour sorts below one on open ground.
	 *
	 * Dijkstra over the *cell* grid rather than the tile map: one pass costs every candidate at once, and at
	 * `state.grid.cellSize` tiles per cell the grid is small enough (map size / cell size per axis) that the
	 * linear-scan minimum search is cheaper than maintaining a heap. Diagonal steps cost the same as
	 * orthogonal ones - this is a risk measure, not a movement plan.
	 *
	 * @param {worldState} state
	 * @param {ConstructionParameters} parameters
	 * @returns {number[][]} cost in cells, keyed by [gx][gy]; `Infinity` where no route avoiding the enemy exists.
	 */
	#computeOilRouteCostField(state, parameters) {
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;
		const cellSize = state.grid.cellSize;

		const enemyUnitThreat = state.fields.enemyUnitThreat;
		const enemyStaticDefenceThreat = state.fields.enemyStaticDefenceThreat;
		const cellIsTraversable = state.fields.cellIsTraversable;

		const THREAT_WEIGHT = parameters.OIL_ROUTE_THREAT_WEIGHT;
		const BLOCK_THRESHOLD = parameters.OIL_ROUTE_BLOCK_THRESHOLD;

		/**
		 * The cost of *entering* a cell. `enemyUnitThreat` is blurred by `updateSpatialFields()`, so a cell
		 * beside a force carries a fraction of it: skirting the edge of an army costs more than open ground
		 * without being forbidden outright.
		 */
		const entryCost = (gx, gy) => {
			if (!cellIsTraversable[gx][gy]) 				return Infinity;
			if (enemyStaticDefenceThreat[gx][gy] > 0) 		return Infinity;

			const threat = enemyUnitThreat[gx][gy];
			if (threat >= BLOCK_THRESHOLD) 					return Infinity;

			return 1 + (THREAT_WEIGHT * threat);
		};

		const routeCost = create2DGrid(numXCells, numYCells, () => Infinity);
		const visited = create2DGrid(numXCells, numYCells, () => false);

		// The trucks start at base, so its own cell costs nothing to be in - whatever is standing on it.
		routeCost[Math.floor(baseLocation.x / cellSize)][Math.floor(baseLocation.y / cellSize)] = 0;

		const NEIGHBOUR_OFFSETS = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

		while (true) {
			// Take the cheapest cell not yet expanded.
			let cheapestGX = -1, cheapestGY = -1, cheapestCost = Infinity;
			for (let gx=0; gx<numXCells; gx++) {
				for (let gy=0; gy<numYCells; gy++) {
					if (visited[gx][gy]) continue;
					if (routeCost[gx][gy] >= cheapestCost) continue;
					cheapestGX = gx;
					cheapestGY = gy;
					cheapestCost = routeCost[gx][gy];
				}
			}

			if (cheapestGX === -1) {
				break;			// everything reachable has been expanded
			}

			visited[cheapestGX][cheapestGY] = true;

			NEIGHBOUR_OFFSETS.forEach(o => {
				const gx = cheapestGX + o[0];
				const gy = cheapestGY + o[1];

				if (gx < 0 || gx >= numXCells || gy < 0 || gy >= numYCells) 	return;
				if (visited[gx][gy]) 											return;

				const stepCost = entryCost(gx, gy);
				if (stepCost === Infinity) 										return;

				const newCost = cheapestCost + stepCost;
				if (newCost < routeCost[gx][gy]) {
					routeCost[gx][gy] = newCost;
				}
			});
		}

		return routeCost;
	}

	/**
	 * Generates options for oil capture.
	 * @param {worldState} state 
	 * @param {(number | string)[]} activeOilCapTaskIDs 
	 * @param {ConstructionParameters} parameters
	 * @param {number} maxTasks how many tasks command can actually start this tick
	 * @returns {Array}
	 */
	generateOilCaptureOptions(state, activeOilCapTaskIDs, parameters, maxTasks) {
		/*
		Algorithm:
		Use the grid system to:
		- Find cells with unclaimed derricks											-- uses state.fields.unclaimedDerricksInCell[gx][gy]
		- Remove derricks which are already claimed									-- uses the DerrickObject's own `isClaimed`
		- Remove cells with high threat from enemy struct concentrations 				-- uses state.grid.grid[gx][gy].targetStructures 
		- Remove cells with defensive structures										-- uses state.fields.enemyStaticDefenceThreat
		- Remove cells with enemy offensive units										-- uses state.fields.enemyUnitThreat
		- Remove cells the trucks cannot reach without walking through the enemy		-- uses `#computeOilRouteCostField()`
		- Once the brigades are established, keep unsupported cells within reach of home	-- uses state.fields.friendlySupport & controlStability
		- Confirm that reach against the real walk, for the few candidates about to be committed	-- uses `findPathAstarLength()`
		- Remove cells with all derricks already being claimed in active missions		-- uses this.toc.getActiveConstructionMissions()
		
		-> if all conditions satisfied, build a task for the derrick
		
		For each surviving derrick
		1. Skip if id not found in grid entries
		2. >= 4 derricks which are close to one another (multiple in one grid); move to front of list
			2a. create new CONSTRUCT_ALL_DERRICKS_IN_SECTOR
		3. Else, continue
			3a. create new CONSTRUCT_OIL_DERRICK for single, CONSTRUCT_ALL_DERRICKS_IN_SECTOR for multiple

		Both lists are then ordered by the cost of the route to them, so the nearest oil by *safe* travel is
		taken first rather than the nearest in a straight line, with oil the army covers promoted over oil
		it does not. Only the first `maxTasks` survivors are returned, so the tile-level walk check below is
		paid for the candidates which are actually about to receive trucks and no others.
		*/
		const grid = state.grid.grid;
		const numXCells = state.grid.numXCells;
		const numYCells = state.grid.numYCells;

		const unclaimedDerricksInCell = state.fields.unclaimedDerricksInCell;
		const enemyStaticDefenceThreat = state.fields.enemyStaticDefenceThreat;
		const enemyUnitThreat = state.fields.enemyUnitThreat;
		const friendlySupport = state.fields.friendlySupport;
		const controlStability = state.fields.controlStability;
		const isReachable = state.mapData.isReachable;

		const routeCost = this.#computeOilRouteCostField(state, parameters);

		// Set once FishBot has an army of its own; see `updateStrategicParameters()` for why this is not
		// applied from the start of the game.
		const REQUIRE_SUPPORT = parameters.REQUIRE_SUPPORTED_OIL_CAPTURE;
		const SUPPORTED_WEIGHT = parameters.SUPPORTED_OIL_WEIGHT;
		const UNSUPPORTED_ROUTE_BUDGET = parameters.UNSUPPORTED_OIL_CAPTURE_RANGE / state.grid.cellSize;

		/**
		 * Whether FishBot can cover a construction site: ground the field army is on (`friendlySupport`), or
		 * ground we already hold (`controlStability`, which counts our structures *other than* derricks - so a
		 * bare unfortified derrick does not make the ground around it count as held).
		 */
		const isSupported = (gx, gy) => (friendlySupport[gx][gy] > 0) || (controlStability[gx][gy] > 0);

		const DEBUG_ON = false;
		let debugGrid = create2DGrid(numXCells, numYCells, (...args) => {return "_";});
		const normalPriorityDerricks = [];
		const highPriorityDerricks = [];

		// Iterate through the grid, find & remember valid cells
		for (let gx=0; gx<numXCells; gx++) {
			for (let gy=0; gy<numYCells; gy++) {

				// Filter out invalid / bad entries
				if (unclaimedDerricksInCell[gx][gy] === 0) continue;
				if (enemyStaticDefenceThreat[gx][gy] > 0) continue;			
				if (enemyUnitThreat[gx][gy] > 0) continue;

				// Every route to the cell runs through an enemy force, so the trip costs the trucks.
				if (routeCost[gx][gy] === Infinity) continue;

				const CELL_IS_SUPPORTED = isSupported(gx, gy);

				// Once there are armies on the map, oil the army cannot cover is only worth walking to if it is
				// close to home: the longer the walk, the longer the trucks are exposed to a force which can be
				// somewhere else entirely by the time they arrive. Supported ground carries no such limit.
				// The budget is spent on route cost rather than raw distance, so ground near the enemy - which
				// `#computeOilRouteCostField()` prices up - eats into it faster.
				if (REQUIRE_SUPPORT && !CELL_IS_SUPPORTED && routeCost[gx][gy] > UNSUPPORTED_ROUTE_BUDGET) continue;

				// Supported oil is preferred over unsupported oil at equal travel; see `SUPPORTED_OIL_WEIGHT`.
				const priorityCost = routeCost[gx][gy] * (CELL_IS_SUPPORTED ? SUPPORTED_WEIGHT : 1);

				// The cell route is measured in whole cells, which is coarse enough that a target just inside the
				// budget may be a much longer walk in practice. Those are re-checked tile by tile below.
				const NEEDS_WALK_CHECK = REQUIRE_SUPPORT && !CELL_IS_SUPPORTED;

				const derricksInCell = grid[gx][gy].derricks;
				for (let i=0; i<derricksInCell.length; i++) {
					const d = derricksInCell[i];

					if (!isReachable[d.x][d.y]) continue;
					if (d.isClaimed) continue;															// a derrick already stands here

					// Check for existing missions
					if (activeOilCapTaskIDs.indexOf(d.id) !== -1) continue; 									// found 'CONSTRUCT_OIL_DERRICK' task
					if (activeOilCapTaskIDs.indexOf(grid[gx][gy].id) !== -1) continue;							// found the same 'CONSTRUCT_ALL_DERRICKS_IN_SECTOR' task

					// if (tileIsBurning(d.x, d.y)) continue;		// seems to be worse

					if (derricksInCell.length >= 4) {
						const br = this.translateIntoBuildRequest({
							missionType: MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR, 
							structureData: STRUCTURES["Oil Derrick"],
							payload: grid[gx][gy]		// needs to have the '.derricks' property to work with the existing system
						});
						highPriorityDerricks.push({'cost': priorityCost, 'buildRequest': br, 'needsWalkCheck': NEEDS_WALK_CHECK, 'target': derricksInCell[0]});
						if (DEBUG_ON) debugGrid[gx][gy] = "X";
						break;
					} else {
						const br = this.translateIntoBuildRequest({
							missionType: MISSION_TYPE.CONSTRUCT_OIL_DERRICK, 
							structureData: STRUCTURES["Oil Derrick"],
							payload: d
						});
						normalPriorityDerricks.push({'cost': priorityCost, 'buildRequest': br, 'needsWalkCheck': NEEDS_WALK_CHECK, 'target': d});
						if (DEBUG_ON) debugGrid[gx][gy] = "X";
					}
				}
			}
		}

		if (DEBUG_ON) {
			debug(`prioritiseOilCapTasks() @ ${gameTime} ms`);

			for (let gy=0; gy<numYCells; gy++) {
				let row = "";

				for (let gx=0; gx<numXCells; gx++) {					
					row += `${debugGrid[gx][gy]} `;
				}
				debug(row);
			}
		}

		// Nearest by safe travel first, within each priority band.
		const byPriorityCost = (a, b) => a.cost - b.cost;
		highPriorityDerricks.sort(byPriorityCost);
		normalPriorityDerricks.sort(byPriorityCost);

		return this.#confirmOilCaptureTargets(state, [...highPriorityDerricks, ...normalPriorityDerricks], parameters, maxTasks);
	}

	/**
	 * Takes the best `maxTasks` candidates whose walk stands up to a tile-level check.
	 *
	 * `#computeOilRouteCostField()` works in whole grid cells, which is the right granularity for comparing
	 * every candidate cheaply but too coarse to decide whether a particular derrick is genuinely close enough
	 * to be worth sending unescorted trucks to: terrain inside those cells can turn a three-cell hop into a
	 * long walk around a cliff. So the candidates which the range budget actually governs get their walk
	 * measured properly, one at a time, in the order they would be committed - at most `maxTasks` of them,
	 * and none at all during the opening land grab or for ground the army already covers.
	 *
	 * @param {worldState} state
	 * @param {Object[]} candidates ordered best-first
	 * @param {ConstructionParameters} parameters
	 * @param {number} maxTasks
	 * @returns {Array} build requests, at most `maxTasks` of them
	 */
	#confirmOilCaptureTargets(state, candidates, parameters, maxTasks) {
		const isReachable = state.mapData.isReachable;

		// A* has to start somewhere walkable. If base is not (which would take unusual terrain under the
		// starting position), the check cannot run, and the cell-level budget already applied stands on its
		// own - so fall back to it rather than rejecting every target.
		const BASE_IS_PATHABLE = isReachable[baseLocation.x][baseLocation.y];
		const BASE_TILE = [baseLocation.x, baseLocation.y];

		const MAX_WALK = parameters.UNSUPPORTED_OIL_CAPTURE_RANGE;
		const ASTAR_BUDGET = parameters.OIL_RANGE_CHECK_ASTAR_BUDGET;

		// Terrain can produce a run of candidates which all look close by cell but are all long walks, and
		// checking every one of them is how a planning tick turns into a lag spike. The pass gets a fixed
		// number of checks; once they are spent it stops offering candidates rather than waving through ones
		// it has not confirmed. Nothing is lost by that - planning runs again on the next intelligence
		// refresh, and the trucks it would have committed are still free.
		let checksRemaining = parameters.OIL_RANGE_CHECKS_PER_PASS;

		const approved = [];

		for (let i=0; i<candidates.length && approved.length < maxTasks; i++) {
			const candidate = candidates[i];

			if (candidate.needsWalkCheck && BASE_IS_PATHABLE && defined(candidate.target)) {
				if (checksRemaining <= 0) {
					break;
				}
				checksRemaining--;

				// `Infinity` covers both "further than the budget allows" and "so obstructed that A* gave up
				// looking" - neither is somewhere to send trucks on their own.
				const walkLength = findPathAstarLength(state, BASE_TILE, [candidate.target.x, candidate.target.y], ASTAR_BUDGET);

				if (walkLength > MAX_WALK) {
					continue;
				}
			}

			approved.push(candidate.buildRequest);
		}

		return approved;
	}

	/**
	 * Generates options for constructing defenses near oil derricks.
	 * @param {worldState} state 
	 * @param {(number | string)[]} activeDefenceBuildTaskIDs 
	 * @returns {Array}
	 */
	generateOilDefenceConstructionOptions(state, activeDefenceBuildTaskIDs) {
		/*
		Algorithm:
		- For each derrick in `state.poi.derricks`
			. If grid cell previously processed, continue
			. Check static defence threat grid (continue if high threat), check unit defence threat grid (after five mins)
			. Check grid ref for friendly defences in sector (continue if done)
			. Check active missions (continue if already active)
			. Check grid ref for other derricks in sector ( -- influences how many defences)
			. Check owner ( -- influences offensive vs friendly oil; if other types of defences are needed) or if tileIsBurning 
			. Build one defence per undefended location also 
			. Handle special case of clustered derricks with unreachable enemy derricks (build hardpoint)
		*/
		const grid = state.grid.grid;
		const derricks = state.poi.derricks;
		const controlStability = state.fields.controlStability;
		const enemyUnitThreat = state.fields.enemyUnitThreat;

		// Note: tiles with Oil Resources are treated as non-walkable, so we use the 'isReachable' lookup table instead.
		const isReachable = state.mapData.isReachable;		

		const MAX_CONTROL = 5;
		const PROXIMITY_RADIUS = 9;

		const makePrimaryDefence = (derrickObj) => this.translateIntoBuildRequest({
			missionType: MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE, 
			structureData: STRUCTURES["Rotary MG Bunker"],
			payload: derrickObj
		});
		const makeSecondaryDefence = (derrickObj) => this.translateIntoBuildRequest({
			missionType: MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE, 
			structureData: STRUCTURES["Assault Gun Hardpoint"],
			payload: derrickObj
		});

		let highPrioOil = [], normalPrioOil = [];		
		let seenDerricks = [];

		const BUILT_DEFENCES = OBJ_FLAGS.DEFENSIVE_STRUCTURE | OBJ_FLAGS.IS_BUILT;

		for (let i=0; i<derricks.length; i++) {
			const d = derricks[i];

			if (!isReachable[d.x][d.y]) {		
				continue;
			}

			// the following replicates the old 'sector' system grouping of derricks
			let previouslySeen = false;
			for (let j=seenDerricks.length-1; j>=0; j--) {
				if (distSq(seenDerricks[j].x, d.x, seenDerricks[j].y, d.y) < PROXIMITY_RADIUS ** 2) {
					previouslySeen = true;
					break;
				}
			}
			if (previouslySeen) {
				// debug(`skipped ${d.id}: already seen`);
				continue;
			}

			seenDerricks.push(d);			

			if (activeDefenceBuildTaskIDs.includes(d.id)) {
				// debug(`skipped ${d.id}: activeMission`);
				continue;
			}

			if (enemyUnitThreat[d.gx][d.gy] > 0) {
				// debug(`skipped ${d.id}: unit threat`);
				continue
			};			// TODO: move this prioritisation to hq_command (decisions on options should be made in command)

			if (controlStability[d.gx][d.gy] <= -1 * MAX_CONTROL) {		// TODO: move this prioritisation to hq_command (decisions on options should be made in command)
				// debug(`skipped ${d.id}: (${d.gx}, ${d.gy}); control too large (${controlStability[d.gx][d.gy]})`);
				continue;
			}

			// Intent: enumRange is used as this offers better granularity compared to directly accessing the grid
			const nearby = state.grid.enumRangeLazy(d.x, d.y, PROXIMITY_RADIUS, true, true);
			
			let friendlyDefencesNearby = 0, friendlyDerricksNearby = 0;
			nearby['friendlyStructures'].forEach(obj => {	
				const flags = obj.flags;

				if (flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					friendlyDerricksNearby++;
					
					const friendlyDerrickID = obj.id;
					if (activeDefenceBuildTaskIDs.includes(friendlyDerrickID)) {
						previouslySeen = true;
					}
				}

				if ((flags & BUILT_DEFENCES) === BUILT_DEFENCES && !(flags & OBJ_FLAGS.ADA)) {
					friendlyDefencesNearby++;
				}
			});

			if (previouslySeen)  {
				continue;
			}

			let enemyDefencesNearby = 0, enemyDerricksNearby = 0;
			nearby['targetStructures'].forEach(obj => {	
				const flags = obj.flags;

				if (flags & OBJ_FLAGS.RESOURCE_EXTRACTOR) {
					enemyDerricksNearby++;

					const enemyDerrickID = obj.id;
					if (activeDefenceBuildTaskIDs.includes(enemyDerrickID)) {
						previouslySeen = true;
					}
				}

				if ((flags & BUILT_DEFENCES) === BUILT_DEFENCES && !(flags & OBJ_FLAGS.ADA)) {
					enemyDefencesNearby++;
				}
			});

			if (previouslySeen)  {
				continue;
			}

			if (enemyDefencesNearby > 0) {
				// debug(`skipped ${d.id}: friendlyDefencesNearby`);
				continue;
			}

			if (controlStability[d.gx][d.gy] >= 5 && enemyDerricksNearby === 0) {		// TODO: move this prioritisation to hq_command (decisions on options should be made in command)
				// debug(`skipped ${d.id}: (${d.gx}, ${d.gy}); control too large (${controlStability[d.gx][d.gy]})`);
				continue;
			}

			const isHighPriority = grid[d.gx][d.gy].derricks.length >= 4;
			if (isHighPriority) {
				// Has a special case of defences === 1 -> can build secondary defence
				if (friendlyDefencesNearby === 0) {
					highPrioOil.unshift(makePrimaryDefence(d));			// unshift -> reverses the order of `state.poi.derricks` which is ordered in ascending order from base
				} else if (friendlyDefencesNearby === 1) {
					const specialContestedDerrick = (enemyDerricksNearby > 0 && friendlyDefencesNearby === 1);
					if (specialContestedDerrick) {
						normalPrioOil.push(makeSecondaryDefence(d));
					}
				}
				continue;
			}

			if (friendlyDefencesNearby > 0) {
				// debug(`skipped ${d.id}: friendlyDefencesNearby`);
				continue;
			}
			
			const regularContestedDerrick = tileIsBurning(d.x, d.y) || (enemyDerricksNearby > 0 && friendlyDefencesNearby === 0);		
			if (regularContestedDerrick) {
				normalPrioOil.unshift(makePrimaryDefence(d));
			} else {
				normalPrioOil.push(makePrimaryDefence(d));
			}
		}

		if (false) {
			debug(`generateOilDefenceConstructionOptions() @${gameTime}`);
			debug(`	highPrio: ${highPrioOil}`);
			debug(`	normalPrio: ${normalPrioOil}`);
		}

		return [...highPrioOil, ...normalPrioOil];
	}

	/**
	 * Generates locations for construction and demolition of repair facilities.
	 * Demolition is required because there is a hard cap on the number of repair facilities you can build.
	 * @param {worldState} state
	 * @param {FbObject[]} myRepairFacilities
	 * @param {PositionInfo[]} forceLocations
	 * @param {boolean} demolitionRequired 
	 * @returns
	 */
	generateRemoteServiceCenterConstructionOptions(state, myRepairFacilities, forceLocations, demolitionRequired) {

		const enemyUnitThreat = state.fields.enemyUnitThreat;
		const cellSize = state.grid.cellSize;
		const isChokepoint = state.mapData.isChokepoint;

		const potentialRepairCenterLocations = [];
		const potentialDemolitionLocations = [];

		const options = {
			'newFacilityLocations': potentialRepairCenterLocations,
			'demolitionLocations': potentialDemolitionLocations
		}

		const REPAIR_CENTER_SEARCH_RADIUS = 14;

		// PART 1: FIND DEMOLITION LOCATIONS
		if (demolitionRequired) {
			myRepairFacilities.forEach(f => {
				const gx = Math.floor(f.x / cellSize);
				const gy = Math.floor(f.y / cellSize);

				if (enemyUnitThreat[gx][gy] !== 0) {
					return;
				}

				const repairFacility = getObject(f.type, f.player, f.id);
				if (repairFacility == null) {
					return;
				}

				const FACILITY_INSIDE_BASE_RADIUS = distSq(repairFacility.x, baseLocation.x, repairFacility.y, baseLocation.y) <= REPAIR_CENTER_SEARCH_RADIUS ** 2;
				if (FACILITY_INSIDE_BASE_RADIUS) {
					// debug(`${gameTime}: repair facility @ ${repairFacility.x}, ${repairFacility.y} - ignored`);
					return;
				}

				const FACILITY_NEAR_SOME_GROUP = forceLocations.some(brigadeLoc => {
					if (distSq(brigadeLoc.x, repairFacility.x, brigadeLoc.y, repairFacility.y) <= REPAIR_CENTER_SEARCH_RADIUS ** 2) {
						return true;
					}
					return false;
				});
				if (FACILITY_NEAR_SOME_GROUP) {
					return;
				}

				const buildRequest = this.translateIntoBuildRequest({
					missionType: MISSION_TYPE.DEMOLISH_REPAIR_CENTER,
					structureData: STRUCTURES["Repair Facility"],
					payload: repairFacility
				});

				potentialDemolitionLocations.push(buildRequest);
			});

			// Sort closest to furthest from base (simplistic assumption). Intent: want to find the least useful repair facility
			potentialDemolitionLocations.sort((a,b) =>
				distSq(a.payload.x, baseLocation.x, a.payload.y, baseLocation.y) - distSq(b.payload.x, baseLocation.x, b.payload.y, baseLocation.y));
		}

		// PART 2: FIND CONSTRUCTION LOCATIONS
		// Note: `pickStructLocation3()` is expensive so it should be run only after all possible cheap tests are passed.
		forceLocations.forEach(LOCATION => {
			const x = LOCATION.x, y = LOCATION.y;

			const TOO_CLOSE_TO_BASE = distSq(baseLocation.x, x, baseLocation.y, y) < REPAIR_CENTER_SEARCH_RADIUS ** 2;
			if (TOO_CLOSE_TO_BASE) {
				return;
			}

			const gx = Math.floor(x / cellSize);
			const gy = Math.floor(y / cellSize);
			if (enemyUnitThreat[gx][gy] !== 0) {
				return;
			}

			const nearby = state.grid.enumRangeLazy(x, y, REPAIR_CENTER_SEARCH_RADIUS, false, true);

			const NEARBY_REPAIR_FACILITY = nearby['friendlyStructures'].some(s => s.flags & OBJ_FLAGS.REPAIR);
			if (NEARBY_REPAIR_FACILITY) {
				return;
			}

			const MIN_NEARBY_FRIENDLY_UNITS = 4;
			let nearbyFriendlyUnits = 0;
			for (let i=0; i<nearby['friendlyUnits'].length; i++) {
				const unit = nearby['friendlyUnits'][i];
				if (unit.flags & (OBJ_FLAGS.ARMOUR | OBJ_FLAGS.INFANTRY)) {
					nearbyFriendlyUnits++;
				}

				if (nearbyFriendlyUnits >= MIN_NEARBY_FRIENDLY_UNITS) {
					break;
				}
			}
			if (nearbyFriendlyUnits < MIN_NEARBY_FRIENDLY_UNITS) {
				return;
			}

			const potentialLocation = pickStructLocation3(STRUCTURES["Repair Facility"].id, x, y);
			if (potentialLocation == undefined) {
				return;
			}

			if (isChokepoint[potentialLocation.x][potentialLocation.y]) {
				return;
			}

			const buildRequest = this.translateIntoBuildRequest({
				missionType: MISSION_TYPE.CONSTRUCT_REPAIR_CENTER,
				structureData: STRUCTURES["Repair Facility"],
				payload: potentialLocation
			});

			potentialRepairCenterLocations.push(buildRequest);
		});

		return options;
	}

	/**
	 * Yields the next base structure to be constructed.
	 * @param {worldState} state
	 * @param {ConstructionParameters} parameters
	 * @returns 
	 */
	requestBaseConstruction(state, parameters) {

		const MODULES_PER_FACTORY = 2;
				
		const baseBuildOrder_T2NoBase = [
			STRUCTURES["Factory"],
			STRUCTURES["Factory"],
			STRUCTURES["Command Center"],
			STRUCTURES["Power Generator"],	
			STRUCTURES["Power Generator"],	
			STRUCTURES["Power Generator"],		
			STRUCTURES["Power Module"],		// The script will automatically find a place to put this module.
			STRUCTURES["Power Generator"],
			STRUCTURES["Cyborg Factory"],		
			STRUCTURES["Repair Facility"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Power Module"],			
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["Power Module"],
			STRUCTURES["VTOL Factory"],
			STRUCTURES["Power Module"],	
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Cyborg Factory"],
			
			STRUCTURES["Power Generator"],		// inserting here in the case that more power than expected is captured
				STRUCTURES["Power Module"],
			
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],

			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],

			STRUCTURES["Power Generator"],		// inserting here in the case that more power than expected is captured
				STRUCTURES["Power Module"],

			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Factory Module"],

			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Cyborg Factory"],
			
			STRUCTURES["Power Generator"],		// inserting these here in the case that more power than expected is captured
				STRUCTURES["Power Module"],
			STRUCTURES["Power Generator"],		
				STRUCTURES["Power Module"],

			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["Factory"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],

			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["Factory"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],

			STRUCTURES["Cyborg Factory"],

			STRUCTURES["Power Generator"],		// inserting these here in the case that more power than expected is captured
				STRUCTURES["Power Module"],
			STRUCTURES["Power Generator"],		
				STRUCTURES["Power Module"],

			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["Cyborg Factory"],
		];

		// Put each task into an appropriate format for approval ("buildTask", which is internal to g4_construction)
		let buildTasks = [];

		// Create structure information
		const structureCounts = new Map();
		let count;
		baseBuildOrder_T2NoBase.forEach(structInfo => {
			if (structureCounts.get(structInfo) != null) {
				return;		// skip because it exists already
			}
			if (["Research Module", "Power Module", "Factory Module"].includes(structInfo.name)) {
				count = this.#getNumFinishedModules(structInfo.id);
			} else {
				count = enumStruct(me, structInfo.id).length;	// `enumStruct` returns both 'BUILT' & 'BEING_BUILT'	
			}	
			structureCounts.set(structInfo, {'target': 0, 'count': count});
		});

		for (let i=0; i<baseBuildOrder_T2NoBase.length; i++) {
			const currStructureData = baseBuildOrder_T2NoBase[i];
			const STRUCTURE_NAME = currStructureData.name;

			const counts = structureCounts.get(currStructureData);
			const structCount = counts['count'];
			
			// Implement construction adaptations
			// 0. Implement custom structure limits set in skirmish settings
			if (structCount >= state.getMaxStructureCount(STRUCTURE_NAME)) {
				continue;
			}
			// 1. Adapt power generators to number of derricks
			if (["Power Generator", "Power Module"].includes(STRUCTURE_NAME)) {
				if (structCount >= parameters.MAX_GENERATORS_AND_POWER_MODULES) {
					continue;
				}	
			}
			// 2. Remove VTOLs if unused
			if (["VTOL Factory", "VTOL Rearming Pad"].includes(STRUCTURE_NAME)) {
				if (!parameters.SHOULD_BUILD_VTOLS) {	
					continue;
				}
			}
			// 3. Remove extra factory modules (e.g. as a result of VTOL Factory removal).
			if (["Factory Module"].includes(STRUCTURE_NAME)) {
				if (!parameters.SHOULD_USE_FACTORY_MODULES) {
					continue;
				}
				const factoryCount = structureCounts.get(STRUCTURES["Factory"])['count'];
				const vtolFactoryCount = structureCounts.get(STRUCTURES["VTOL Factory"])['count'];
				const factoryModuleCount = structureCounts.get(STRUCTURES["Factory Module"])['count'];

				const MAXIMUM_FACTORY_MODULES_REACHED = (factoryModuleCount >= (factoryCount + vtolFactoryCount) * MODULES_PER_FACTORY);
				if (MAXIMUM_FACTORY_MODULES_REACHED) {		
					continue;
				}
			}
			// 4. Match rearming pads to the number of VTOLs
			if (["VTOL Rearming Pad"].includes(STRUCTURE_NAME)) {
				if (structCount >= parameters.MAX_VTOL_REARMING_PADS) {
					continue;
				}
			}

			// Add to running tally & continue if the current disposition exceeds the new target
			counts['target'] += 1;
			if (structCount >= counts['target']) {
				continue;
			}

			// Else, schedule a new task
			// debug(`(FishBot ${me}) ${gameTime}: building ${STRUCTURE_NAME}`);
			const buildRequest = this.translateIntoBuildRequest({
				missionType: MISSION_TYPE.CONSTRUCT_AUTO_DETECT_BY_STRUCTURE, 
				structureData: currStructureData,
				payload: undefined
			});
			buildTasks.push(buildRequest);
			break;		// Note: this means that only the first available will be selected.
		}
		
		return buildTasks;
	}

	/*
		MISSION CREATION
	*/

	#createBuildRequest({missionType, structureData, payload}) {
		return {
			missionType: missionType,
			structureID: structureData.id,
			payload: payload,
		};
	}

	translateIntoBuildRequest({missionType, structureData, payload}) {
		let buildRequest = undefined;

		switch (missionType) {
			case MISSION_TYPE.CONSTRUCT_AUTO_DETECT_BY_STRUCTURE:
				let mt = undefined;
				switch(structureData.id) {
					case STRUCTURES["Research Module"].id:	
					case STRUCTURES["Power Module"].id:
					case STRUCTURES["Factory Module"].id:		// these three have the same handler
						mt = MISSION_TYPE.CONSTRUCT_SINGLE_MODULE;	
						break;
					default:
						mt = MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE;
				}
				buildRequest = this.#createBuildRequest({missionType: mt, structureData: structureData, payload: payload});
				break;
			case MISSION_TYPE.CONSTRUCT_OIL_DERRICK:
			case MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR:
			case MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE:
			case MISSION_TYPE.CONSTRUCT_REPAIR_CENTER:
			case MISSION_TYPE.DEMOLISH_REPAIR_CENTER:
				buildRequest = this.#createBuildRequest({missionType: missionType, structureData: structureData, payload: payload});
				break;
			default:
				warn(`hq_g4_construction / translateIntoBuildRequest(): Unrecognised missionType: ${missionType}`);
				// do nothing for now
		}

		return buildRequest;
	}

	/**
	 * Factory function for `ConstructionMissionData`.
	 * @param {number} missionType
	 * @param {number | string} id
	 * @param {number | string} groupID
	 * @param {string} sectorID
	 * @param {number} gx
	 * @param {number} gy
	 * @returns {ConstructionMissionData}
	 */
	#createMissionOrders(missionType, id, groupID, sectorID, gx, gy) {
		return {
			'id': id, 
			'missionType': missionType, 
			'missionStatus': MISSION_STATUS.FAILED_CREATION, 
			'priority': MISSION_PRIORITY.LOW, 
			'taskForceID': groupID, 
			'orders': () => {}, 
			'ceaseOrders': () => {},
			'timeStarted': -2,
			'timeCompleted': -1,
			'sectorID': sectorID,	// v0.3.0 sector system	
			'gx': gx,				// v0.4.0 grid system
			'gy': gy,				// v0.4.0 grid system
		};
	}

	/**
	 * Mission cleanup function (releases units back to the reserves).
	 * @param {ConstructionMissionData} md 
	 * @param {number | string} reserveID Construction uses both `BASE_BUILDER` and `ENGINEERING_RESERVE` as two separate reserves.
	 * @returns {void} Writes `timeCompleted` to missionData.
	 */
	#finaliseConstruction(md, reserveID) {
		const taskForceUnits = state.g.enumGroup(md.taskForceID);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: reserveID, droidID: droid.id});
			orderDroidLoc(droid, DORDER_MOVE, baseLocation.x, baseLocation.y);
		});	
		// if (taskForceUnits.length === 0)	debug(`Terminated mission: taskForceID ${md.taskForceID} are all dead.`);
		
		state.g.deleteGroup(md.taskForceID);
		md.timeCompleted = gameTime;
	}
	
	/**
	 * Defines the default behaviour of all trucks in `ENGINEERING_RESERVE`.
	 * @param {Object} missionConfig
	 * @param {number} missionConfig.missionType
	 * @returns {ConstructionMissionData} Returns `missionData` which is used by the mission manager to continuously execute the default mission.
	*/
	createHelpConstructTask({missionType}) {
		const sectorID = "THESE_THREE_PARAMETERS_ARE_UNUSED", gx = -1, gy = -1;
		
		const md = this.#createMissionOrders(missionType, "HELP_CONSTRUCT", ENGINEERING.ENGINEERING_RESERVE, sectorID, gx, gy);
		md.orders = () => helpConstructAroundBase(md.taskForceID);		
		md.ceaseOrders = () => {};	
		
		return md;
	}

	/**
	 * @typedef {Object} MissionParams
	 * @property {number} missionType
	 * @property {Object} buildTask Build task details (standard format generated by `translateIntoBuildRequest()`).
	 * @property {number} tickUID Number used by mission planning to differentiate tasks assigned in the same decision tick.
	 */
	
	/**
	 * Creates a task to build a single base structure.
	 * @param {MissionParams} params 
	 * @returns {ConstructionMissionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildBaseStructureTask({missionType, buildTask, tickUID}) {
		const cellSize = state.grid.cellSize;
		
		let reserveID = ENGINEERING.BASE_BUILDER;
		let taskForceUnits = state.g.enumGroup(reserveID);
		
		if (taskForceUnits.length === 0) {
			// warn(`createBuildBaseStructureTask(): Falling back to ENGINEERING.ENGINEERING_RESERVE.`);
			reserveID = ENGINEERING.ENGINEERING_RESERVE;
			taskForceUnits = state.g.enumGroup(reserveID);
			if (taskForceUnits.length === 0) {
				warn(`createBuildBaseStructureTask(): No trucks available to construct ${buildTask.structureID}.`);
				return undefined;
			}
		}

		if (!isStructureAvailable(buildTask.structureID, me)) {
			warn(`createBuildBaseStructureTask(): Structure not available: ${buildTask.structureID}.`);
			return undefined;
		}

		const loc = pickBaseStructLocation(buildTask.structureID);		
		if (loc == undefined) {
			warn(`createBuildBaseStructureTask() / pickBaseStructLocation(): couldn't find a good location for ${buildTask.structureID}.`);
			return undefined;
		}

		// Create mission details
		const id = gameTime + "_CONSTRUCT_BASE_STRUCTURE_" + tickUID;
		const gx = Math.floor(loc.x / cellSize);
		const gy = Math.floor(loc.y / cellSize);
		
		const md = this.#createMissionOrders(missionType, id, id, "SECTOR_ID_UNUSED", gx, gy);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: reserveID, droidID: droid.id});
		});		
		md.orders = () => buildBaseStructure(md.taskForceID, buildTask.structureID, loc.x, loc.y);		
		md.ceaseOrders = () => this.#finaliseConstruction(md, ENGINEERING.BASE_BUILDER);		

		return md;
	}

	/**
	 * Creates a task to build a single derrick.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.x` and `.y` properties.
	 * @returns {ConstructionMissionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildDerrickTask({missionType, buildTask, tickUID}) {		
		const cellSize = state.grid.cellSize;
		const derrick = buildTask.payload;

		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {
			return undefined;
		}
		
		let MAX_TRUCKS = 1;
		
		// Select closest trucks to sector
		engineeringReserve.sort((a,b) => distSq(a.x, buildTask.x, a.y, buildTask.y) - distSq(b.x, buildTask.x, b.y, buildTask.y));
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS);

		if (!isStructureAvailable(buildTask.structureID, me)) {
			warn(`createBuildDerrickTask(): Structure not available: "${buildTask.structureID}" - were oil derricks disabled?`);
			return undefined;
		}

		// Create mission details
		const id = gameTime + "_CONSTRUCT_OIL_DERRICK_" + tickUID;
		const sectorID = buildTask.payload.id;			// this is used for this function as it is used to avoid doubling up
		const gx = Math.floor(derrick.x / cellSize);
		const gy = Math.floor(derrick.y / cellSize);

		const md = this.#createMissionOrders(missionType, id, id, sectorID, gx, gy);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		
		md.orders = () => buildOilDerrick(md.taskForceID, buildTask.structureID, derrick);		
		md.ceaseOrders = () => this.#finaliseConstruction(md, ENGINEERING.ENGINEERING_RESERVE);

		return md;
	}

	/**
	 * Creates a task to build all derricks in a grid cell.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.derricks` property (e.g. `gridCell` contains `.derricks`).
	 * @returns {ConstructionMissionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildAllDerricksInSectorTask({missionType, buildTask, tickUID}) {				
		const sector = buildTask.payload;
		const sectorDerricks = buildTask.payload.derricks;

		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {
			return undefined;
		}
		
		let MAX_TRUCKS = 1;
		
		// Select closest trucks to sector
		engineeringReserve.sort((a,b) => distSq(a.x, buildTask.x, a.y, buildTask.y) - distSq(b.x, buildTask.x, b.y, buildTask.y));	
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS);

		if (!isStructureAvailable(buildTask.structureID, me)) {
			warn(`createBuildAllDerricksInSectorTask(): Structure not available: "${buildTask.structureID}" - were oil derricks disabled?`);
			return undefined;
		}

		// Create mission details
		const id = gameTime + "_CONSTRUCT_SECTOR_DERRICKS_" + tickUID;
		const sectorID = sector.id;				// this is used for this function as it is used to avoid doubling up
		const gx = sector.gx;
		const gy = sector.gy;
		
		const md = this.#createMissionOrders(missionType, id, id, sectorID, gx, gy);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		
		md.orders = () => buildMultipleOilDerricks(md.taskForceID, buildTask.structureID, sectorDerricks);		
		md.ceaseOrders = () => this.#finaliseConstruction(md, ENGINEERING.ENGINEERING_RESERVE);

		return md;
	}

	/**
	 * Creates a task to build *one* additional module extension on an upgradeable structure.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` is not required (only `buildTask.structureID`).
	 * @returns {ConstructionMissionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildSingleModuleTask({missionType, buildTask, tickUID}) {

		const cellSize = state.grid.cellSize;

		let reserveID = ENGINEERING.BASE_BUILDER;
		let taskForceUnits = state.g.enumGroup(reserveID);

		if (taskForceUnits.length === 0) {
			// warn(`createBuildSingleModuleTask(): Falling back to ENGINEERING.ENGINEERING_RESERVE.`);
			reserveID = ENGINEERING.ENGINEERING_RESERVE;
			taskForceUnits = state.g.enumGroup(reserveID);
			if (taskForceUnits.length === 0) {
				warn(`createBuildSingleModuleTask(): No trucks available to construct "${buildTask.structureID}".`);
				return undefined;
			}
		}

		if (!isStructureAvailable(buildTask.structureID, me)) {
			warn(`createBuildSingleModuleTask(): Structure not available: "${buildTask.structureID}".`);
			return undefined;
		}
		
		const MAX_POWER_MODULES = 1;
		const MAX_FACTORY_MODULES = 2;
		const MAX_RESEARCH_MODULES = 1;

		let baseStructures = [];
		switch(buildTask.structureID) {
			case (STRUCTURES["Power Module"].id):
				let generators = enumStruct(me, POWER_GEN).filter(gen => gen.modules < MAX_POWER_MODULES);
				baseStructures.push(...generators);
				break;
			case (STRUCTURES["Factory Module"].id):
				let factories = enumStruct(me, FACTORY).filter(factory => factory.modules < MAX_FACTORY_MODULES);
				let vtolFactories = enumStruct(me, VTOL_FACTORY).filter(factory => factory.modules < MAX_FACTORY_MODULES);
				baseStructures.push(...factories, ...vtolFactories);
				break;
			case (STRUCTURES["Research Module"].id):
				let labs = enumStruct(me, RESEARCH_LAB).filter(lab => lab.modules < MAX_RESEARCH_MODULES);
				baseStructures.push(...labs);
				break;
			default:
				// Do nothing
		}

		if (baseStructures.length === 0) {
			warn(`createBuildSingleModuleTask(): no available structures to place: "${buildTask.structureID}"`);
			return undefined;
		}

		const x = baseStructures[0].x; 
		const y = baseStructures[0].y;
		const numFinishedModules = baseStructures[0].modules + 1;

		// Create mission details
		const id = gameTime + "_CONSTRUCT_SINGLE_MODULE_" + tickUID;
		const gx = Math.floor(x / cellSize);
		const gy = Math.floor(y / cellSize);

		const md = this.#createMissionOrders(missionType, id, id, "SECTOR_ID_UNUSED", gx, gy);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: reserveID, droidID: droid.id});
		});		
		md.orders = () => buildSingleModule(md.taskForceID, buildTask.structureID, x, y, numFinishedModules);
		md.ceaseOrders = () => this.#finaliseConstruction(md, ENGINEERING.BASE_BUILDER);		// puts the reserve back in BASE_BUILDER

		return md;
	}

	/**
	 * Creates a task to build one defensive structure near a specified location.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.x` and `.y` properties.
	 * @returns {ConstructionMissionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildNearbyDefenceTask({missionType, buildTask, tickUID}) {
		const cellSize = state.grid.cellSize;

		const currDerrick = buildTask.payload;
		const derrickID = currDerrick.id;
		const x = currDerrick.x;
		const y = currDerrick.y;

		const MINIMUM_TRUCKS = 2;
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length < MINIMUM_TRUCKS) {
			return undefined;
		}

		// Select closest trucks to new location
		engineeringReserve.sort((a,b) => distSq(a.x, x, a.y, y) - distSq(b.x, x, b.y, y));
		const taskForceUnits = engineeringReserve.slice(0, MINIMUM_TRUCKS); 

		if (!isStructureAvailable(buildTask.structureID, me)) {
			warn(`createBuildNearbyDefenceTask(): Structure not available: "${buildTask.structureID}"`);
			return undefined;
		}

		let preferredLoc = pickStructLocation3(buildTask.structureID, x, y);
		if (preferredLoc === undefined) {
			warn(`createBuildNearbyDefenceTask / pickStructLocation3(): could not find a valid location near (${x}, ${y}).`);
			return undefined;
		}

		// Create mission details
		const id = gameTime + "_CONSTRUCT_NEARBY_DEFENCE_" + tickUID;
		const sectorID = derrickID;			
		const gx = Math.floor(preferredLoc.x / cellSize);
		const gy = Math.floor(preferredLoc.y / cellSize);
		
		const md = this.#createMissionOrders(missionType, id, id, sectorID, gx, gy);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		
		md.orders = () => buildSingleStructure(md.taskForceID, buildTask.structureID, preferredLoc.x, preferredLoc.y);		
		md.ceaseOrders = () => this.#finaliseConstruction(md, ENGINEERING.ENGINEERING_RESERVE);

		return md;
	}

	/**
	 * Creates a task to build one repair facility near a specified location.
	 * Note: the specified location is already validated by pickStructLocation3 (incl. chokepoint check), so it should not be re-evaluated here.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.x` and `.y` properties.
	 * @returns {ConstructionMissionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createBuildRepairCenterTask({missionType, buildTask, tickUID}) {
		const cellSize = state.grid.cellSize;

		const MINIMUM_TRUCKS = 2;
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length < MINIMUM_TRUCKS) {
			return undefined;
		}

		// Select closest trucks to new location
		const loc = buildTask.payload;
		engineeringReserve.sort((a,b) => distSq(a.x, loc.x, a.y, loc.y) - distSq(b.x, loc.x, b.y, loc.y));
		const taskForceUnits = engineeringReserve.slice(0, MINIMUM_TRUCKS); 

		if (!isStructureAvailable(buildTask.structureID, me)) {
			warn(`createBuildRepairCenterTask(): Structure not available: "${buildTask.structureID}"`);
			return undefined;
		}

		// Create mission details
		const id = gameTime + "_CONSTRUCT_REPAIR_CENTER_" + tickUID;
		const sectorID = loc.id;			
		const gx = Math.floor(loc.x / cellSize);
		const gy = Math.floor(loc.y / cellSize);
		
		const md = this.#createMissionOrders(missionType, id, id, sectorID, gx, gy);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		
		md.orders = () => buildSingleStructure(md.taskForceID, buildTask.structureID, loc.x, loc.y);		
		md.ceaseOrders = () => this.#finaliseConstruction(md, ENGINEERING.ENGINEERING_RESERVE);

		return md;
	}

	/**
	 * Creates a task to demolish one repair facility at a specified location.
	 * @param {MissionParams} params Build information. Note: `buildTask.payload` requires the `.x` and `.y` properties.
	 * @returns {ConstructionMissionData | undefined} Returns `missionData` if mission was successfully created (all conditions satisfied), else `undefined`.
	 */
	createDemolishRepairCenterTask({missionType, buildTask, tickUID}) {
		const cellSize = state.grid.cellSize;

		const MINIMUM_TRUCKS = 1;
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length < MINIMUM_TRUCKS) {
			// debug(`#createBuildRepairCenterTask(): No trucks available.`);
			return undefined;
		}

		// Select closest trucks to new location
		const loc = buildTask.payload;
		engineeringReserve.sort((a,b) => distSq(a.x, loc.x, a.y, loc.y) - distSq(b.x, loc.x, b.y, loc.y));
		const taskForceUnits = engineeringReserve.slice(0, MINIMUM_TRUCKS); 

		// Create mission details
		const id = gameTime + "_DEMOLISH_REPAIR_CENTER_" + tickUID;
		const sectorID = loc.id;			
		const gx = Math.floor(loc.x / cellSize);
		const gy = Math.floor(loc.y / cellSize);
		
		const md = this.#createMissionOrders(missionType, id, id, sectorID, gx, gy);
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		
		md.orders = () => demolishStructure(md.taskForceID, buildTask.structureID, loc.x, loc.y);		
		md.ceaseOrders = () => this.#finaliseConstruction(md, ENGINEERING.ENGINEERING_RESERVE);

		// deb(`Mission creation for: DEMOLISH_REPAIR_CENTER -> (${loc.x}, ${loc.y}) `);		

		return md;
	}
}