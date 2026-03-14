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
*/

function arrayMean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function arrayMedian(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function arrayIQR(arr) {
	// Interquartile Range (IQR)
	const sorted = [...arr].sort((a, b) => a - b);		// make shallow copy & arrange in ascending order
	const q1 = sorted[Math.floor(sorted.length * 0.25)];
	const q3 = sorted[Math.floor(sorted.length * 0.75)];
	const iqr = q3 - q1;
	return iqr;
}

function arrayRange(arr) {
	const range = Math.max(...arr) - Math.min(...arr);
	return range;
}

// Get distance between two points
// acceptable arguments:
//		distance(obj, obj)
//		distance(x,y, obj)
//		distance(obj,x,y)
function distance (obj1, obj2, obj3, obj4) {
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
 * ## distSq(x1, x2, y1, y2)
 * More computationally efficient than distance() - use this where order matters, but magnitude does not. */
function distSq(x1, x2, y1, y2) {
	return (x1-x2)**2 + (y1-y2)**2;
}

/**
 * Converts a number `n` to its binary representation (to 20 bits).
 * @param {number} n 
 * @returns {string}
 */
function toBinary20(n) {
	return n.toString(2).padStart(20, '0');
}

function defined(variable) { 
	if (typeof variable !== "undefined") {
		if (variable !== null) {
			return true;
		}
	}
	return false;
}

/**
 * This function implements a square 2D-array.
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
			grid[x][y] = cellFactory();
		}
	}

	return grid;
}

/*
	structure enumeration helpers
*/

function getIdleStructuresOfType({structureID, playerID=me}) {
	// Default player is me
	const structuresOfType = enumStruct(playerID, structureID);
	return structuresOfType.filter(struct => (
		struct.status === BUILT && 
		structureIdle(struct)
	));
}

function isAntiAirDefense(obj) {
	if (obj.canHitAir === true && obj.canHitGround === false) {
		if (obj.droidType === DROID_WEAPON || obj.stattype === DEFENSE) {
			return true;
		}
	}
	return false;					
}

// GAME STATE
function getCurrGameTime() {
	const currGameTime = gameTime;
	return currGameTime;
}

/**
 * Generates an array of numbers starting from 0 and ending at integer stopNum (not including stopNum) 
 */ 
function generateRange(stopNum) {
	const numbers = [];
	for (let i=0; i < stopNum; i++) {
		numbers.push(i);
	}
	return numbers;
}

function isT0Start() {
	return !isStructureAvailable("A0ComDroidControl", me);
}

function myPower() {
	return playerPower(me) - queuedPower(me);
}

function hoverAvailable() {
	return HOVER_PROPULSIONS.some((hoverPropulsion) => componentAvailable(hoverPropulsion.id));
}

/*
	OTHER PLAYER INFORMATION
*/
function isEnemy(playerID) {
	if (!defined(playerID)) {
		debug("isEnemy(): playerID is undefined. Check the calling function.");
	}
	return !allianceExistsBetween(me, playerID);
}

function enumLivingPlayers() {

	let FACTORY_ID = [STRUCTURES["Factory"].id, STRUCTURES["Cyborg Factory"].id, STRUCTURES["VTOL Factory"].id];

	let livingPlayerIDs = [];

	for (let playerID=0; playerID<maxPlayers; playerID++) {

		let factoryExists = false;
		FACTORY_ID.forEach(factoryID => {
			if (countStruct(factoryID, playerID) > 0) {
				factoryExists = true;
				return;
			}
		});

		if (factoryExists) {
			livingPlayerIDs.push(playerID);
			continue;
		}

		if (countDroid(DROID_ANY, playerID) > 0) {
			livingPlayerIDs.push(playerID);
			continue;
		}
	}

	if (false) {
		debug(`livingPlayerIDs:`);
		livingPlayerIDs.forEach(p => debug(`	${p}`));
	}

	return livingPlayerIDs;
}

function gameHasEnded() {
	const myDroids = enumDroid();

	if (myDroids.length === 0) {
		const myStructures = enumStruct();
		if (myStructures.length === 0) {
			return true;
		}

		const FACTORY_TYPES = [FACTORY, VTOL_FACTORY, CYBORG_FACTORY];
		if (myStructures.filter(s => FACTORY_TYPES.includes(s.stattype)).length === 0) {
			return true;
		}
	}

	if (enumLivingPlayers().filter(isEnemy).length === 0) {
		return true;
	}
	
	return false;
}

/**
	fbGroup: FISHBOT v3 CUSTOM GROUPING SYSTEM

	Fishbot custom implementation of groups
	Fishbot requires highly-temporary, one-to-many labelling to support its ability to maneuver troops.
	As of Warzone 2100 v4.6.1, neither the built-in groups, nor labels, are suitable for temporary, one-to-many labelling.
*/

class fbGroup {

	constructor() {
		this.groupTemplate = {'groupMemberIDs': [], 'groupMembers': [], "groupSize": 0};
		this.groups = new Map();
		this.MAX_GROUP_SIZE = 256;
	}

	#lazyUpdateGroup(groupID) {
		// Lazy update, only updates if one of the functions is called & only for that group ID
		if (this.groups.has(groupID)) {
			// Update members
			let c = this.groups.get(groupID);

			// niceDebug("lazyUpdateGroup/groupMember data -- before filter", c["groupMemberIDs"], c["groupMembers"]);

			c["groupMemberIDs"] = c["groupMemberIDs"].filter((id) => getObject(DROID, me, id) !== null);

			// niceDebug("lazyUpdateGroup/groupMember data -- after filter", c["groupMemberIDs"], c["groupMembers"]);

			c["groupMembers"] = c["groupMemberIDs"].map((id) => {return getObject(DROID, me, id);});

			// niceDebug("lazyUpdateGroup/groupMember data -- after getObject map", c["groupMemberIDs"], c["groupMembers"]);

			c["groupSize"] = c["groupMembers"].length;
		}
	}

	createGroup(groupID) {
		this.groups.set(groupID, {
			...this.groupTemplate,
			'groupMemberIDs': [...this.groupTemplate.groupMemberIDs],
			'groupMembers': [...this.groupTemplate.groupMembers]
		});
	}

	deleteGroup(groupID) {
		if (this.groups.has(groupID))
			this.groups.delete(groupID);
	}

	enumGroup(groupID) {
		if (!this.groups.has(groupID)) {
			debug("no such groupID", groupID);
			return [];
		}

		// niceDebug("ids before enum group update; ", this.groups.get(groupID)["groupMemberIDs"])
		this.#lazyUpdateGroup(groupID);

		return this.groups.get(groupID)["groupMembers"];
	}
	
	groupSize(groupID) {
		if (!this.groups.has(groupID))
			return undefined;

		this.#lazyUpdateGroup(groupID);

		return this.groups.get(groupID)["groupSize"];
	}

	addDroidToGroup({groupID, droidID}) {
		if (!this.groups.has(groupID)) {
			// niceDebug("Created a new group", groupID);
			this.createGroup(groupID);
		}

		this.#lazyUpdateGroup(groupID);
		let currGroup = this.groups.get(groupID);
		
		if (currGroup["groupSize"] >= this.MAX_GROUP_SIZE) {
			debug(`addDroidToGroup failed: Cannot add more than ${this.MAX_GROUP_SIZE} members to the group.`);
			return;
		}
		
		currGroup["groupMemberIDs"] = currGroup["groupMemberIDs"].concat(droidID);
		// niceDebug("groupMemberIDs", currGroup["groupMemberIDs"]);

	}

	removeDroidFromGroup({groupID, droidID}) {
		if (!this.groups.has(groupID)) {
			return;
		}

		this.#lazyUpdateGroup(groupID);

		let c = this.groups.get(groupID)["groupMemberIDs"].concat();	// shallow copy
		this.groups.get(groupID)["groupMemberIDs"] = c.filter((id) => id !== droidID);
	}
}

