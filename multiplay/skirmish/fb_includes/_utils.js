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

	while (queue.length > 0 && iters < MAX_ITERS) {
		// Dequeue the next cell
		const next = queue.shift();

		// Process & push to result
		const gx = next[0], gy = next[1];
		const result = objFunc(grid, gx, gy);
		orderedResult.push(result);
		gridResult[gx][gy] = {'idx': iters, 'result': result};

		// For each of the 4 adjacent cells, check the coordinates in bounds
		const up = [gx, gy + 1];
		const down = [gx, gy - 1];
		const left = [gx - 1, gy];
		const right = [gx + 1, gy];

		let valid = [];
		[up, down, left, right].forEach(coord => {
			if (checkXInBounds(coord[0]) && checkYInBounds(coord[1])) {
				valid.push(coord);
			}
		});

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

		iters++;
	}

	if (false) {
		debug(`BFS result:`);
		orderedResult.forEach(coord => debug(`\t${coord[0]} ${coord[1]}`));
	}

	return {'ordered': orderedResult, 'grid': gridResult};
}

/**
 * Returns the BFS order of all walkable tiles from the player's base location.
 * @returns {Coordinate[]} Javascript list of tuples
 */
function getBaseStructurePositions() {
	const xMax = mapWidth;
	const yMax = mapHeight;

	/** @type {Coordinate[]} */
	const visited = [];
	const isVisited = new Array(xMax * yMax).fill(false);

	/** @type {Coordinate[]} */
	const toSearch = [[baseLocation.x, baseLocation.y]];
	const inSearchList = new Array(xMax * yMax).fill(false);	

	const MAX_ITERS = 5000;
	let iters = 0;
	
	// Formatted as [x, y, manhattanDistance]
	// const NEIGHBOUR_OFFSETS = [[-1, -1, 2], [-1, 0, 1], [-1, 1, 2], [0, 1, 1], [1, 1, 2], [1, 0, 1], [1, -1, 2], [0, -1, 1]];
	const NEIGHBOUR_OFFSETS = [[-1, 0, 1], [0, 1, 1], [1, 0, 1], [0, -1, 1]];

	while (toSearch.length != 0 && iters < MAX_ITERS) {
		const node = toSearch.shift();
		if (node == undefined) {
			break;
		}
		const x = node[0], y = node[1];

		visited.push(node);
		isVisited[y * xMax + x] = true;

		// Check neighbours
		NEIGHBOUR_OFFSETS.forEach(o => {
			const ox = o[0] + node[0];
			const oy = o[1] + node[1];
			const oIdx = oy * xMax + ox;
			// const d = o[2];

			// Check in map bounds
			if (ox < 0 || ox >= xMax) {
				return;
			}
			if (oy < 0 || oy >= yMax) {
				return;
			}

			if (isVisited[oIdx]) {
				return;
			}

			if (inSearchList[oIdx]) {
				return;
			}
			
			// Check walkable
			const terrainType = MapTiles[oy][ox].terrainType;
			if (terrainType === TER_CLIFFFACE || terrainType === TER_WATER) {
				return;
			}

			toSearch.push([ox, oy]);
			inSearchList[oIdx] = true;
		});

		iters++;
	}

	debug(`Completed BFS in ${iters} iterations (walkable tiles = ${visited.length}).`);
	// visited.forEach(v => debug(`${v[0]}, ${v[1]}`));		// prints out all of the tilecos in question

	return visited;
}


/**
 * Returns an array of [x, y] coordinates from start to goal inclusive (Bresenham's Line Algorithm).
 * Disclaimer: This function is generated by AI (ChatGPT).
 */
function drawLine(startX, startY, endX, endY) {
    const points = [];

    let x = startX;
    let y = startY;

    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);

    const sx = startX < endX ? 1 : -1;
    const sy = startY < endY ? 1 : -1;

    let err = dx - dy;

    while (true) {
        points.push({'x': x, 'y': y});

        if (x === endX && y === endY) {
            break;
        }

        const e2 = 2 * err;

        if (e2 > -dy) {
            err -= dy;
            x += sx;
        }

        if (e2 < dx) {
            err += dx;
            y += sy;
        }
    }

    return points;
}


/*
	WZ2100 helper functions (uses the WZ2100 JS API).

	Try to reduce the number of functions in this section.
*/

/**
 * Returns `true` if the game object no longer exists. 
 * For code clarity, use this function when the actual game object is not important.
 * @param {FbObject} obj
 * @returns {boolean}
 */
const gameObjectNoLongerExists = (obj) => {
	if (getObject(obj.type, obj.player, obj.id) == null) {
		return true;
	} else {
		return false;
	}
};

/**
 * Converts an array of structures represented as lightweight "FishBot objects" into actual game objects.
 * This is part of the algorithm to avoid the use of 'enumStruct()' to get up to date game objects. 
 * @param {FbObject[]} fbStructureList 
 * @returns {StructureObject[]} array containing idle `StructureObjects`.
 */
function getIdleStructureObjects(fbStructureList) {
	let idleStructList = [];
	fbStructureList.forEach(structObj => {
		if (!(structObj.flags & OBJ_FLAGS.IS_BUILT)) {
			return;
		}
		const s = getObject(structObj.type, structObj.player, structObj.id);
		if (s == null) {
			return;
		}
		if (structureIdle(s)) {
			idleStructList.push(s);
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
