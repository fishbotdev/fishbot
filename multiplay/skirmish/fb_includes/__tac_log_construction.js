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

const constructionSearchPattern = [
	// Distance 0
	[0, 0],
	// Distance 1
	[-1, 0], [0, -1], [0, 1], [1, 0],
	// Distance 2
	[-2, 0], [-1, -1], [-1, 1], [0, -2], [0, 2], [1, -1], [1, 1], [2, 0],
	// Distance 3
	[-3, 0], [-2, -1], [-2, 1], [-1, -2], [-1, 2], [0, -3], [0, 3], [1, -2], [1, 2], [2, -1], [2, 1], [3, 0],
	// Distance 4
	[-4, 0], [-3, -1], [-3, 1], [-2, -2], [-2, 2], [-1, -3], [-1, 3], [0, -4], [0, 4], [1, -3], [1, 3], [2, -2], [2, 2], [3, -1], [3, 1], [4, 0],
	// Distance 5
	[-5, 0], [-4, -1], [-4, 1], [-3, -2], [-3, 2], [-2, -3], [-2, 3], [-1, -4], [-1, 4], [0, -5], [0, 5], [1, -4], [1, 4], [2, -3], [2, 3], [3, -2], [3, 2], [4, -1], [4, 1], [5, 0]
];

const walkableTiles = getWalkableTiles();
const isWalkable = create2DGrid(mapWidth, mapHeight, () => {return false;});
walkableTiles.forEach(b => {
	const x = b[0];
	const y = b[1];
	isWalkable[x][y] = true;
});


/**
 * Iterates through ranged walkable tiles from the player's base to determine the position.
 * Unlike `pickStructLoc`, it takes into account obstacles.
 * @param {string} structureID 
 * @returns 
 */
function pickBaseStructLocation(structureID) {

	const BBOX_CORNERS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
	let boundingBoxRadius = 0;

	const BBOX_3x3_STRUCTURES = [STRUCTURES["Factory"].id, STRUCTURES["VTOL Factory"].id, STRUCTURES["Laser Satellite Command Post"].id, STRUCTURES["Satellite Uplink Center"].id];
	const BBOX_2x2_STRUCTURES = [STRUCTURES["Command Center"].id, STRUCTURES["Command Relay Center"].id, STRUCTURES["Power Generator"].id, STRUCTURES["Research Facility"].id];

	if (BBOX_3x3_STRUCTURES.includes(structureID)) {
		boundingBoxRadius = 2;		// coordinate for a 3x3 structure is the center of the structure
	} else if (BBOX_2x2_STRUCTURES.includes(structureID)) {
		boundingBoxRadius = 1;		// coordinate for a 2x2 structure is the bottom right of the structure ((7, 16) center = (7, 15), (6, 15), (6, 16))
	} else {
		boundingBoxRadius = 1;
	}
	
	for (let i=0; i<walkableTiles.length; i++) {
		
		const loc = walkableTiles[i];
		const x = loc[0], y = loc[1];

		if (!structureCanFit(structureID, x, y)) {
			continue;
		}

		// Check a bounding box around the structure is in the walkable tiles list
		let boundingBoxTestFailed = false;
		for (let j=0; j<BBOX_CORNERS.length; j++) {
			const c = BBOX_CORNERS[j];
			const x1 = x + boundingBoxRadius * c[0]; 
			const y1 = y + boundingBoxRadius * c[1];

			if (!isWalkable[x1][y1]) {
				boundingBoxTestFailed = true;
				break;
			}
		}
		if (boundingBoxTestFailed) {
			continue;
		}

		// debug(`${structureID} success @ ${x}, ${y}`);
		return {'x': x, 'y': y};
	}

	return undefined;
}

/* 
	pickStructLocation3: Intention is that this function is a deterministic & will reliably try to pick the same location. 
	Searches nearby tiles based on Manhattan distance.
*/
function pickStructLocation3({structureID, x, y}) {

	const specifiedHeight = MapTiles[y][x].height;		// Uses this to try the match the height.
	const HEIGHT_TOLERANCE = 33;
	
	if (!isWalkable[x][y]) {
		// debug(` ${gameTime}: pickStructLocation3() failed: (${x} ${y}) for "${structureID}" is not reachable with wheels. Check caller function.`);
		return undefined;
	}

	const outsideOfHeightTolerance = [];

	for (let i=0; i<constructionSearchPattern.length; i++) {
		const tX = constructionSearchPattern[i][0] + x;
		const tY = constructionSearchPattern[i][1] + y;

		if (!isWalkable[tX][tY]) {
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

		const loc = {'x': tX, 'y': tY};

		if (Math.abs(MapTiles[tY][tX].height - specifiedHeight) > HEIGHT_TOLERANCE) {
			// debug(`	${gameTime}: psl2 rejected: (${tX}, ${tY}); height (${MapTiles[tY][tX].height} !== ${specifiedHeight})`);
			outsideOfHeightTolerance.push(loc);
			continue;
		}

		return loc;	
	}

	for (let i=0; i<outsideOfHeightTolerance.length; i++) {
		// For loop is used to ignore the cases in which the array is empty
		return outsideOfHeightTolerance[i];		
	}

	// debug(` ${gameTime}: pickStructLocation3() failed: could not find appropriate (${x} ${y}) for "${structureID}"`);
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
			// debug(`	${obj.name}: (${obj.x}, ${obj.y}) - ${obj.player} ${obj.born}, built: ${obj.status}`);
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
		if (otherStructureOnTile) {		// Note: `!structureCanFit(structureID, x, y)` occasionally conflicts with enumRange so it has been removed.
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
