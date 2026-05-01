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


function precalculateWheeledReachableTiles() {
	const wheeledDroidCanReach = (x, y) => propulsionCanReach(PROPULSIONS["Wheels"].id, baseLocation.x, baseLocation.y, x, y);
	const isReachable = create2DGrid(mapWidth + 1, mapHeight + 1, wheeledDroidCanReach);

	if (false) {
		debug(`x-max?: ${mapWidth}, y-max?: ${mapHeight}`);

		// Note: `create2DGrid` uses a [x][y] construction, so each printed line (printed row) is actually a column (iterate along x, get the columns).
		// This means that the map will appear sideways in the debug view.

		isReachable.forEach(col => {
			let row = '';
			col.forEach(c => {
				if (c === true) {
					row += `1 `;
				} else {
					row += `0 `;
				}
			});
			debug(row);
		});
	}

	return isReachable;
}

const isReachable = precalculateWheeledReachableTiles();


function precalculateConstructionSearchGrid() {
	const makeItEven = (n) => {
		if (n % 2 === 0) {
			return n;
		} else {
			return n + 1;
		}
	}

	// const MAX_X = makeItEven(Math.floor(mapWidth/2));
	// const MAX_Y = makeItEven(Math.floor(mapHeight/2));
	const MAX_X = 10;
	const MAX_Y = 10;
	const HALF_MAX_X = MAX_X/2;
	const HALF_MAX_Y = MAX_Y/2;

	const csg = new fbGrid(MAX_X, MAX_Y);
	const objFunc = (grid, gx, gy) => {return [gx - HALF_MAX_X, gy - HALF_MAX_Y];};

	const standardConstructionSearchGrid = breadthFirstSearch(csg, HALF_MAX_X, HALF_MAX_Y, objFunc);
	return standardConstructionSearchGrid['ordered'];
}


const standardConstructionSearchGrid = precalculateConstructionSearchGrid();


/* 
	pickStructLocation3: Intention is that this function is a deterministic & will reliably try to pick the same location. 
	Searches nearby tiles based on Manhattan distance.
*/
function pickStructLocation3({structureID, x, y}) {

	const specifiedHeight = MapTiles[y][x].height;		// Uses this to try the match the height.
	const HEIGHT_TOLERANCE = 33;
	
	if (!isReachable[x][y]) {
		debug(` ${gameTime}: pickStructLocation3() failed: (${x} ${y}) for "${structureID}" is not reachable with wheels. Check caller function.`);
		return undefined;
	}

	for (let i=0; i<standardConstructionSearchGrid.length; i++) {
		const tX = standardConstructionSearchGrid[i][0] + x;
		const tY = standardConstructionSearchGrid[i][1] + y;

		if (Math.abs(MapTiles[tY][tX].height - specifiedHeight) > HEIGHT_TOLERANCE) {
			// debug(`	${gameTime}: psl2 rejected: (${tX}, ${tY}); height (${MapTiles[tY][tX].height} !== ${specifiedHeight})`);
			continue;
		}

		if (!isReachable[tX][tY]) {
			// debug(`	${gameTime}: psl2 rejected: (${tX}, ${tY}); not reachable`);
			continue;
		}

		if (!structureCanFit(structureID, tX, tY)) {
			continue;
		}

		const enemyUnits = enumRange(tX, tY, 1, ENEMIES, true).filter(obj => obj.type === DROID && isEnemy(obj.player));
		if (enemyUnits.length > 0) {
			continue;
		}

		return {'x': tX, 'y': tY};	
	}

	debug(` ${gameTime}: pickStructLocation3() failed: could not find appropriate (${x} ${y}) for "${structureID}"`);
	return undefined;

}

/*
	TAC SOP: HELP CONSTRUCT
*/
function helpConstructAroundBase(taskForceID) {
	// This mission should not end as it is the default construction mission.

	const trucks = state.g.enumGroup(taskForceID);
	if (trucks.length === 0) {
		return {status: MISSION_STATUS.IN_PROGRESS};
	}

	const MAX_HELP_RADIUS = Math.floor(1.42 * Math.min(mapHeight/3, mapWidth/3));		// 1.42 ~ sqrt(2)
	const baseStructuresBeingBuilt = enumStruct(me).filter(struct => struct.status === BEING_BUILT).
													filter(struct => distSq(struct.x, baseLocation.x, struct.y, baseLocation.y) < MAX_HELP_RADIUS ** 2);	

	for (let i=0; i<baseStructuresBeingBuilt.length; i++) {
		const struct = baseStructuresBeingBuilt[i];

		if (struct.stattype === RESOURCE_EXTRACTOR) {
			continue;		// don't need help constructing a derrick
		}

		// Else all trucks help build this
		trucks.forEach((truck) => orderDroidObj(truck, DORDER_HELPBUILD, struct));
		break;	
	}
	return {status: MISSION_STATUS.IN_PROGRESS};	
}

/*
	TAC SOP: BUILD BASE STRUCTURE
*/
function buildBaseStructure(taskForceID, structureID, x, y) {

	const trucks = state.g.enumGroup(taskForceID);
	if (trucks.length === 0) {
		// debug(`buildBaseStructure(): failed, no trucks`);
		return {status: MISSION_STATUS.FAILED};
	}

	// Check if the structure has been built yet
	let struct = enumRange(x, y, 3).filter(obj => {
		const lookup = STRUCTURES[obj.name];
		if (lookup !== undefined) {
			if (lookup.id === structureID && obj.x === x && obj.y === y) {
				return true;
			}
		}
		return false;	
	});

	if (struct.length >= 2) {
		debug(`buildBaseStructure(): failed, somehow there is more than one structure at ${x}, ${y}.`);
		return {status: MISSION_STATUS.FAILED};		
	}

	// Case 1: Nothing exists yet -> build
	if (struct.length === 0) {
		// debug(`buildBaseStructure(): Nothing exists at ${x}, ${y} yet; building...`);
		trucks.forEach(truck => orderDroidBuild(truck, DORDER_BUILD, structureID, x, y));
		return {status: MISSION_STATUS.IN_PROGRESS};	
	}

	// Case 2a & 2b: Something exists, check if it's under construction. If under construction, help build. Else, report finished.
	if (struct.length === 1) {
		if (struct[0].status === BUILT) {
			// debug(`buildBaseStructure(): success, ${structureID} is finished`);
			return {status: MISSION_STATUS.SUCCEEDED};
		} else {
			// debug(`buildBaseStructure(): Continuing to build the structure at ${x}, ${y}...`);
			trucks.forEach((truck) => orderDroidObj(truck, DORDER_HELPBUILD, struct[0]));
		}
	}
	return {status: MISSION_STATUS.IN_PROGRESS};
}

/*
	TAC SOP: CAPTURE SINGLE DERRICK (SIMPLER THAN MULTI-CAPTURE)
*/
function buildOilDerrick(taskForceID, structureID, derrickLocation) {

	const trucks = state.g.enumGroup(taskForceID);
	if (trucks.length === 0) {
		// debug(`buildOilDerrick(): failed, no trucks`);
		return {status: MISSION_STATUS.FAILED};
	}

	// Check if the structure has been built yet
	let struct = enumRange(derrickLocation.x, derrickLocation.y, 3, ALL_PLAYERS, false).filter(obj => {
		const lookup = STRUCTURES[obj.name];
		if (lookup !== undefined) {
			if (lookup.id === structureID && obj.x === derrickLocation.x && obj.y === derrickLocation.y) {
				return true;
			}
		}
		return false;
	});

	// Case 1: Nothing exists yet -> build
	if (struct.length === 0) {
		// debug(`buildOilDerrick(): Nothing exists at ${loc.x}, ${loc.y} yet; building...`);
		trucks.forEach(truck => orderDroidBuild(truck, DORDER_BUILD, structureID, derrickLocation.x, derrickLocation.y));
		return {status: MISSION_STATUS.IN_PROGRESS};
	}

	// Case 2a & 2b: Something exists, check if it's under construction. If under construction, help build. Else, report finished.
	if (struct.length === 1) {
		const oilDerrick = struct[0];

		if (isEnemy(oilDerrick.player)) {
			// debug(`buildOilDerrick(): failed, enemy derrick (player ${oilDerrick.player}) at ${derrickLocation.x}, ${derrickLocation.y}`);
			return {status: MISSION_STATUS.FAILED};
		}

		if (oilDerrick.status === BUILT) {
			// debug(`buildOilDerrick(): succeeded, built derrick at ${derrickLocation.x} ${derrickLocation.y}`);
			return {status: MISSION_STATUS.SUCCEEDED};
		} else {
			// debug(`buildOilDerrick(): Continuing to build the derrick at ${loc.x}, ${loc.y}...`);
			trucks.forEach((truck) => orderDroidObj(truck, DORDER_HELPBUILD, oilDerrick));
			return {status: MISSION_STATUS.IN_PROGRESS};
		}
		
	}

	debug(`Error: more than 1 struct at (${ derrickLocation.x}, ${derrickLocation.y}). Failing mission`);
	return {status: MISSION_STATUS.FAILED};		

}

/*
	TAC SOP: CAPTURE OIL IN SECTOR (BUILD MULTIPLE DERRICKS)
*/
function buildMultipleOilDerricks(taskForceID, structureID, derrickLocations) {

	const trucks = state.g.enumGroup(taskForceID);
	if (trucks.length === 0) {
		// debug(`buildMultipleOilDerricks(): failed, no trucks`);
		return {status: MISSION_STATUS.FAILED};
	}

	let totalDerrickCount = derrickLocations.length;
	let failedAttempts = 0, successfulAttempts = 0;

	for (let i=0; i<derrickLocations.length; i++) {
		const loc = derrickLocations[i];

		// Check if the structure has been built yet
		let nearbyObjects = enumRange(loc.x, loc.y, 3, ALL_PLAYERS, false);		

		let struct = nearbyObjects.filter(obj => {
			const lookup = STRUCTURES[obj.name];
			if (lookup !== undefined) {
				if (lookup.id === structureID && obj.x === loc.x && obj.y === loc.y) {
					return true;
				}
			}
			return false;
		});

		// Case 1: Nothing exists yet -> build
		if (struct.length === 0) {
			// debug(`buildMultipleOilDerricks(): Nothing exists at ${loc.x}, ${loc.y} yet; building...`);
			trucks.forEach(truck => orderDroidBuild(truck, DORDER_BUILD, structureID, loc.x, loc.y));
			break;
		}

		// Case 2a & 2b: Something exists, check if it's under construction. If under construction, help build. Else, report finished.
		if (struct.length === 1) {
			const oilDerrick = struct[0];
			
			if (oilDerrick.status === BUILT) {
				// debug(`buildMultipleOilDerricks(): Finished (${loc.x}, ${loc.y}), continuing...`);
				successfulAttempts++;
				continue;
			} else {
				if (isEnemy(oilDerrick.player)) {
					failedAttempts++;
					continue;
				} else {
					// debug(`buildMultipleOilDerricks(): Continuing to build the structure at ${loc.x}, ${loc.y}...`);
					trucks.forEach((truck) => orderDroidObj(truck, DORDER_HELPBUILD, oilDerrick));
					break;
				}
			}
		}
	}

	// debug(`buildMultipleOilDerricks(): success: ${successfulAttempts}, failure: ${failedAttempts}, totalCount: ${totalDerrickCount}`);
	if (successfulAttempts + failedAttempts === totalDerrickCount) {
		// debug(`buildMultipleOilDerricks(): succeeded at ${derrickLocations[0].x}, ${derrickLocations[0].y}`);
		return {status: MISSION_STATUS.SUCCEEDED};
	} else {
		return {status: MISSION_STATUS.IN_PROGRESS};
	}
}

/*
	TAC SOP: Builds a single module upgrade.
*/
function buildSingleModule(taskForceID, structureID, x, y, finishedNumModules) {

	const trucks = state.g.enumGroup(taskForceID);
	if (trucks.length === 0) {
		// debug(`buildSingleModule(): failed, no trucks`);
		return {status: MISSION_STATUS.FAILED};
	}

	// Identify the base structure
	let baseStructureTypeIDs = []; 
	switch(structureID) {
		case (STRUCTURES["Power Module"].id):
			baseStructureTypeIDs.push(STRUCTURES["Power Generator"].id);
			break;
		case (STRUCTURES["Factory Module"].id):
			baseStructureTypeIDs.push(STRUCTURES["Factory"].id, STRUCTURES["VTOL Factory"].id);
			break;
		case (STRUCTURES["Research Module"].id):
			baseStructureTypeIDs.push(STRUCTURES["Research Facility"].id);
			break;
		default:
			// Do nothing
	}

	if (baseStructureTypeIDs.length === 0) {
		debug(`buildSingleModule(): intended baseStructureType was undefined. 
			   Check the target base structure at ${x}, ${y} or the module ID: ${structureID}`);
		return {status: MISSION_STATUS.FAILED};
	}

	// Check if the base structure is present
	let struct = enumRange(x, y, 3).filter(obj => {
		const structureObj = STRUCTURES[obj.name];		// lookup obj.name in STRUCTURES
		if (defined(structureObj)) {
			if (baseStructureTypeIDs.includes(structureObj.id) && obj.x === x && obj.y === y) {
				return true;
			}
		}
		return false;
	});

	if (struct.length >= 2) {
		debug(`buildSingleModule(): failed, somehow there is more than one module at ${x}, ${y}.`);
		return {status: MISSION_STATUS.FAILED};	
	}

	// Case 1: base structure does not exist (terminate)
	if (struct.length === 0) {
		debug(`buildSingleModule(): baseStructureType for ${structureID} does not exist at ${x}, ${y}. Ending build task...`);
		return {status: MISSION_STATUS.FAILED};
	}

	// Case 2a & 2b: If the base structure exists, then build a module if 
	const baseStructure = struct[0];
	if (baseStructure.modules >= finishedNumModules && baseStructure.status === BUILT) {
		// occasionally a "HELPBUILD" droid will build an extra module (depending on timing) so ">=" might be necessary
		// debug(`buildSingleModule(): succeeded at ${x}, ${y}`);
		return {status: MISSION_STATUS.SUCCEEDED};
	} else if (baseStructure.modules < finishedNumModules && baseStructure.status === BUILT) {
		// debug(`buildSingleModule(): Building module ${structureID} at ${x}, ${y}... (finished modules: ${finishedNumModules}), currMods: ${baseStructure.modules}, currStatus = ${baseStructure.status}`);		
		trucks.forEach(truck => orderDroidBuild(truck, DORDER_BUILD, structureID, x, y));
	} else {
		// Help build, its under construction
		// debug(`buildSingleModule(): Continuing to build module ${structureID} at ${x}, ${y}... (finished modules: ${finishedNumModules}), currMods: ${baseStructure.modules}, currStatus = ${baseStructure.status}`);
		trucks.forEach(truck => orderDroidObj(truck, DORDER_HELPBUILD, baseStructure));
	}
	return {status: MISSION_STATUS.IN_PROGRESS};
	
}

/*
	TAC SOP: BUILD NEARBY DEFENCES
*/
function buildNearbyDefences(taskForceID, structureID, x, y) {

	const trucks = state.g.enumGroup(taskForceID);
	if (trucks.length === 0) {
		// debug(`buildNearbyDefences(): failed, no trucks`);
		return {status: MISSION_STATUS.FAILED};
	}

	// Check if similar structures have been built nearby 
	let otherStructureOnTile = false;
	let struct = enumRange(x, y, 5, ALL_PLAYERS, false).filter(obj => {		// -> 5-tile radius => within a 7x7 box with x,y at the center (radial distance of corners is 3*sqrt(2) = 4.24)
		if (obj.type !== STRUCTURE) {
			return false;
		}
		if (obj.x === x && obj.y === y && obj.player !== me) {
			otherStructureOnTile = true;		// fix for trucks freezing
			return false;			
		}
		const lookup = STRUCTURES[obj.name];
		if (lookup !== undefined) {
			if (lookup.id === structureID && obj.player === me) {		// if similar structure owned by me: help build it
				return true;
			}
		}
		return false;
	});

	// Case 1: Nothing exists yet -> build
	if (struct.length === 0) {
		// If the structure cannot be built at x,y anymore, cancel it.
		if (!structureCanFit(structureID, x, y) || otherStructureOnTile) {		// Note: structureCanFit appears to only work on .status === BUILT structures.
			// debug(`buildNearbyDefences(): failed, something on ${x}, ${y} already`);
			return {status: MISSION_STATUS.FAILED};		
		}

		const enemyUnits = enumRange(x, y, 1, ENEMIES, true).filter(obj => obj.type === DROID && isEnemy(obj.player));
		if (enemyUnits.length > 0) {
			// debug(`buildNearbyDefences(): failed, enemy unit on construction point ${x} ${y}`);
			return {status: MISSION_STATUS.FAILED};		
		}

		// debug(`buildBaseStructure(): Nothing exists at ${x}, ${y} yet; building...`);
		trucks.forEach(truck => orderDroidBuild(truck, DORDER_BUILD, structureID, x, y));
		return {status: MISSION_STATUS.IN_PROGRESS};
	}

	// Case 2a & 2b: Something exists, check if it's under construction. If under construction, help build. Else, report finished.
	if (struct.length >= 1) {
		if (struct[0].status === BUILT) {
			// debug(`buildNearbyDefences(): success, ${structureID} is finished`);
			return {status: MISSION_STATUS.SUCCEEDED};
		} else {
			// debug(`buildBaseStructure(): Continuing to build the structure at ${struct[0].x}, ${struct[0].y}...`);
			trucks.forEach((truck) => orderDroidObj(truck, DORDER_HELPBUILD, struct[0]));
		}
	}
	return {status: MISSION_STATUS.IN_PROGRESS};
}

/*
	TAC SOP: DEMOLISH STRUCTURE AT X, Y
*/
function demolishStructure(taskForceID, structureID, x, y) {

	const trucks = state.g.enumGroup(taskForceID);
	if (trucks.length === 0) {
		// debug(`demolishStructure(): failed, no trucks`);
		return {status: MISSION_STATUS.FAILED};
	}

	let otherStructureOnTile = false;
	let struct = enumRange(x, y, 2, ALL_PLAYERS, false).filter(obj => {		
		if (obj.type !== STRUCTURE) {
			return false;
		}
		if (obj.x === x && obj.y === y && obj.player !== me) {
			otherStructureOnTile = true;		// fix for trucks freezing
			return false;			
		}
		const lookup = STRUCTURES[obj.name];
		if (lookup !== undefined) {
			if (lookup.id === structureID && obj.player === me) {		
				return true;
			}
		}
		return false;
	});

	// Case 1: No structure, matching structure or other structure on the tile === SUCCEEDED.
	if (struct.length === 0 || otherStructureOnTile) {
		return {status: MISSION_STATUS.SUCCEEDED};
	}

	// Case 2: Continue to demolish.
	trucks.forEach((truck) => orderDroidObj(truck, DORDER_DEMOLISH, struct[0]));
	return {status: MISSION_STATUS.IN_PROGRESS};
}
