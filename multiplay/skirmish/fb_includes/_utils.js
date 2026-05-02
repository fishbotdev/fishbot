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

/*
	Math functions 

	These functions should only use the standard inbuilt JS libraries.
*/

/**
 * Calculates the median value of a numeric input array.
 * @param {number[]} arr input array (numeric)
 * @returns {number} array median
 */
function arrayMedian(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Generates an array of integers of length `stopNum`, starting with `0` and ending at integer `stopNum - 1`.
 * e.g. `generateRange(5)` produces `[0, 1, 2, 3, 4]`. 
 * @param {number} stopNum length of the array
 * @returns {number[]} array of integers starting with `0` and ending at `stopNum - 1`.
 */ 
function generateRange(stopNum) {
	let numbers = [];
	for (let i=0; i < stopNum; i++) {
		numbers.push(i);
	}
	return numbers;
}

/**
 * Get Euclidean distance between two points (copied from NullBot). Acceptable uses include:
	- distance(obj, obj)
	- distance(x,y, obj)
	- distance(obj,x,y)
	- distance(x1,y1,x2,y2)
 * @param {BaseObject | number} obj1 
 * @param {BaseObject | number} obj2 
 * @param {BaseObject | number} [obj3] optional obj3
 * @param {BaseObject | number} [obj4] optional obj4
 * @returns {number} Euclidean distance
 */
function distance(obj1, obj2, obj3, obj4) {
	let x1, x2, y1, y2;
	if (defined(obj1.x)) {
		x1 = obj1.x;
		y1 = obj1.y;
		if (defined(obj2.x)) {
			x2 = obj2.x;
			y2 = obj2.y;
		} else {
			x2 = obj2;
			y2 = obj3;
		}
	} else {
		x1 = obj1;
		y1 = obj2;
		if (defined(obj3.x)) {
			x2 = obj3.x;
			y2 = obj3.y;
		} else {
			x2 = obj3;
			y2 = obj4;
		}
	}

	return Math.sqrt((x1-x2)**2 + (y1-y2)**2);
}

/** 
 * More computationally efficient than `distance()` - use this where order matters, but magnitude does not. 
 * @param {number} x1 
 * @param {number} x2 
 * @param {number} y1 
 * @param {number} y2 
 * @returns {number}
 */
function distSq(x1, x2, y1, y2) {
	return (x1-x2)**2 + (y1-y2)**2;
}

/**
 * Converts a number `n` to its binary string representation (to 20 bits).
 * @param {number} n integer
 * @returns {string} binary string representation (to 20 bits) e.g. `"00001000010000100001"`
 */
function toBinary20(n) {
	return n.toString(2).padStart(20, '0');
}

/**
 * Converts a number into its ordinal string representation (e.g. 1 to "1st").
 *
 * @param {number} n positive integer
 * @returns {string} The number appended with the correct ordinal suffix (`st`, `nd`, `rd`, or `th`).
 * 
 * @example
 * getOrdinal(1);	// returns "1st"
 * getOrdinal(22);	// returns "22nd"
 * getOrdinal(3);	// returns "3rd"
 * getOrdinal(13);	// returns "13th"
 */
function getOrdinal(n) {
	const s = ["th", "st", "nd", "rd"];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
};


/**
 * Returns `true` if `variable` is either `null` or `undefined`, otherwise, returns `false`.
 * @param {any} variable 
 * @returns {boolean} 
 */
function defined(variable) { 
	if (typeof variable !== "undefined") {
		if (variable !== null) {
			return true;
		}
	}
	return false;
}

/**
 * This function implements a 2D-array.
 * 
 * This implementation is used to store the grid cells representation of the map because:
 *  - ease of use when searching nearby sectors (indices are already numeric)
 *  - numeric indices are more efficient than constructing a string to index a grid entry
 * @param {number} numXCells
 * @param {number} numYCells
 * @param {function} cellFactory 
 * @returns {Array[]} 2D array (integer indexed)
 */
function create2DGrid(numXCells, numYCells, cellFactory) {

	let grid = new Array(numXCells);

	for (let x=0; x<numXCells; x++) {
		grid[x] = new Array(numYCells);

		for (let y=0; y<numYCells; y++) {
			grid[x][y] = cellFactory(x, y);
		}
	}

	return grid;
}

/**
 * An objective function is evaluated on each grid coordinate (in BFS order); the result is appended to an equi-dimensional grid.
 * e.g. BFS is conducted on a 2D grid of 12 x 12; result is returned in a new 2D grid of 12 x 12.
 * @param {fbGrid} grid grid to iterate over to produce a result
 * @param {number} bgx starting grid-x coordinate
 * @param {number} bgy starting grid-y coordinate
 * @param {Function} objectiveFunc The function to be evaluated for each grid cell.
 * @returns {Object} the result of the objective function evaluated on each grid coordinate (returned as an equi-dimensioned grid)
 */
function breadthFirstSearch(grid, bgx, bgy, objectiveFunc) {
	const numXCells = grid.numXCells;
	const numYCells = grid.numYCells;
	
	const checkXInBounds = (gx) => {return (gx >= 0 && gx < numXCells)};
	const checkYInBounds = (gy) => {return (gy >= 0 && gy < numYCells)};
	
	// Initialise BFS parameters
	let iters = 0;		
	const MAX_ITERS = numXCells * numYCells; 	// failsafe
	
	let queue = [[bgx, bgy]];		// y = rows, x = cols => [row, col]
	let queuedUp = [[bgx, bgy]];

	const objFunc = (grid, gx, gy) => {return objectiveFunc(grid, gx, gy);};
	const createEmptyCell = (...args) => {return undefined;};
	let gridResult = create2DGrid(numXCells, numYCells, createEmptyCell);
	let orderedResult = [];

	const DEBUG_ON = false;

	while (queue.length > 0 && iters < MAX_ITERS) {
		if (DEBUG_ON) debug(`queue: ${queue}`);

		// Dequeue the next cell
		const next = queue.shift();

		if (DEBUG_ON) debug(`dequeued next cell: ${queue}`);

		// Process & push to result
		const gx = next[0], gy = next[1];
		const result = objFunc(grid, gx, gy);
		orderedResult.push(result);
		gridResult[gx][gy] = {'idx': iters, 'result': result};

		if (DEBUG_ON) {
			debug(`gx gy: ${gx} ${gy}`);
			debug(`result: ${orderedResult}`);
		} 

		// For each of the 4 adjacent cells, check the coordinates in bounds
		const up = [gx, gy + 1];
		const down = [gx, gy - 1];
		const left = [gx - 1, gy];
		const right = [gx + 1, gy];

		if (DEBUG_ON) debug(`up ${up} down  ${down} left ${left} right ${right}`); 

		let valid = [];
		[up, down, left, right].forEach(coord => {
			if (checkXInBounds(coord[0]) && checkYInBounds(coord[1])) {
				valid.push(coord);
			}
		});

		if (DEBUG_ON) valid.forEach(v => debug(`\tvalid: ${v}`)); 

		// Add unvisited values to the queue
		valid.forEach(v => {
			// Check if it has been visited before
			for (let i=queuedUp.length - 1; i>= 0; i--) {
				if (v[0] === queuedUp[i][0] && v[1] === queuedUp[i][1]) {
					return;		// get out of this loop, onto the next valid value
				}
			}
			// Add unvisited cell to the queue
			queue.push(v);
			// Remember newly queued values
			queuedUp.push(v);
		});			

		if (DEBUG_ON) {
			queuedUp.forEach(v => debug(`new queued: ${v}`)); 
			queue.forEach(q => debug(`\tnew queue: ${q}`)); 
		}

		iters++;
	}

	if (false) {
		debug(`BFS result:`);
		orderedResult.forEach(coord => debug(`\t${coord[0]} ${coord[1]}`));
	}

	return {'ordered': orderedResult, 'grid': gridResult};
}


/*
	WZ2100 helper functions (uses the WZ2100 JS API).

	Try to reduce the number of functions in this section.
*/

/**
 * Converts an array of structures represented as lightweight "FishBot objects" into actual game objects.
 * This is part of the algorithm to avoid the use of 'enumStruct()' to get up to date game objects. 
 * @param {*} fbStructureList 
 * @returns array containing idle `StructureObjects`.
 */
function getIdleStructureObjects(fbStructureList) {
	let idleStructList = [];
	fbStructureList.forEach(structObj => {
		if (structObj.flags & OBJ_FLAGS.IS_BUILT) {
			const s = getObject(structObj.type, structObj.player, structObj.id);
			if (defined(s)) {
				if (structureIdle(s)) {
					idleStructList.push(s);
				}
			}
		}
	});
	return idleStructList;
};

function isAntiAirDefense(obj) {
	if (obj.canHitAir === true && obj.canHitGround === false) {
		if (obj.droidType === DROID_WEAPON || obj.stattype === DEFENSE) {
			return true;
		}
	}
	return false;					
}

function getCurrGameTime() {
	// This function exists in the case I want to change the time units
	const currGameTime = gameTime;
	return currGameTime;
}

function isEnemy(playerID) {
	if (!defined(playerID)) {
		debug("isEnemy(): playerID is undefined. Check the calling function.");
	}
	return !allianceExistsBetween(me, playerID);
}
