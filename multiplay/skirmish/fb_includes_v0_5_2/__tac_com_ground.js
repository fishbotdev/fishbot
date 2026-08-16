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

/**
 * Driver for using a repair facility.
 * @param {string | number} taskForceID 
 */
function returnForRepair(taskForceID) {

	const unitsToRepair = state.g.enumGroup(taskForceID);
	
	const HAVE_REPAIR = state.playerInfo[me]["numRepairFacilities"] > 0;

	unitsToRepair.forEach(droid => {
		if (HAVE_REPAIR) {
			orderDroid(droid, DORDER_RTR);
		} else {
			orderDroid(droid, DORDER_RTB);		// assuming mobile repair units will be at base
		}
	});
	
	return {status: MISSION_STATUS.IN_PROGRESS};		// Note: this is a default behaviour; another function will remove these units from the group.
}

/*
	Driver for attacking
*/
function attackTarget(droid, target) {
	if (!defined(target) || !defined(droid)) {
		return;
	}

	// Switch based on type of target
	switch (target.type) {
		case DROID:
			if (droid.droidType === DROID_SENSOR)
				orderDroidObj(droid, DORDER_OBSERVE, target);
			else if (droid.canHitGround === true && !isVTOL(target)) {
					orderDroidObj(droid, DORDER_ATTACK, target);	
			} else if ((droid.canHitAir === true && droid.canHitGround === false) && isVTOL(target))
				// added 'canHitGround' === false so dedicated ground units do not attack VTOLs for now
				orderDroidObj(droid, DORDER_ATTACK, target);
			else
				orderDroidLoc(droid, DORDER_SCOUT, target.x, target.y);
			break;
		case FEATURE:
			orderDroidObj(droid, DORDER_RECOVER, target);
			break;
		case STRUCTURE:
			if (droid.droidType !== DROID_SENSOR)
				// orderDroidLoc(droid, DORDER_SCOUT, target.x, target.y);
				orderDroidObj(droid, DORDER_ATTACK, target);
			else
				orderDroidObj(droid, DORDER_OBSERVE, target);
			break;
		default:
			orderDroidObj(droid, DORDER_ATTACK, target);
			break;
	}
}

/**
 * 
 * @param {number[]} reserveGroupIDs 
 * @param {number} x 
 * @param {number} y 
 */
function moveReservesToShadow(reserveGroupIDs, x, y) {

	const isTooFarAway = (droid) => distSq(droid.x, x, droid.y, y) > 8 ** 2;

	const maintainPositionBehind = (droid) => {
		if (isTooFarAway(droid)) {
			orderDroidLoc(droid, DORDER_MOVE, x, y);
		} else {
			orderDroidLoc(droid, DORDER_SCOUT, droid.x, droid.y);
		}
	};

	reserveGroupIDs.forEach(id => {
		const reserveUnits = state.g.enumGroup(id);
		reserveUnits.forEach(maintainPositionBehind);		
	});

}

/**
 * TAC SOP: MOVE A BRIGADE COMBAT TEAM (BCT) TO A LOCATION
 * @param {worldState} state 
 * @param {number} brigadeID 
 * @param {number} targetX 
 * @param {number} targetY 
 */
function moveBrigadeToLocation(state, brigadeID, targetX, targetY) {

	const isWalkable = state.mapData.isWalkable;

	const COLUMN_FORMATION_OFFSETS = new Map([
		// Note: this is matched to the v0.5.2 brigade composition
		[DIVISION.INFANTRY_RESERVE, [[4, 1], [4, -1], [5, 1], [6, 0], [5, -1], [6, 1], [6, -1], [-1, 0]]],
		[DIVISION.HEAVY_CAV_RESERVE, [[3, 1], [3, 0], [3, -1]]],
		[DIVISION.LIGHT_CAV_RESERVE, [[2, 1], [2, -1], [5, 0]]],
		[DIVISION.AIR_DEFENCE_RESERVE, [[1, 0], [2, 0]]],
		[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, [[0, 1], [0, -1], [1, 1], [1, -1]]],
		[DIVISION.MAINTENANCE_RESERVE, [[4, 0]]],
		[DIVISION.SENSOR_RESERVE, [[0, 0]]],
	]);

	const currentIdx = new Map([
		[DIVISION.INFANTRY_RESERVE, 0],
		[DIVISION.HEAVY_CAV_RESERVE, 0],
		[DIVISION.LIGHT_CAV_RESERVE, 0],
		[DIVISION.AIR_DEFENCE_RESERVE, 0],
		[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 0],
		[DIVISION.MAINTENANCE_RESERVE, 0],
		[DIVISION.SENSOR_RESERVE, 0],
	]);

	const brigadeUnits = state.g.enumGroup(brigadeID);
	const x = state.brigades[brigadeID]['location'].x;
	const y = state.brigades[brigadeID]['location'].y;
	markTile(x, y);

	const etx = targetX - x;
	const ety = targetY - y;
	const theta = Math.atan2(ety, etx);
	const applyXRotation = (bx, by) => {return bx * Math.cos(theta) + by * -1 * Math.sin(theta)};
	const applyYRotation = (bx, by) => {return bx * Math.sin(theta) + by * Math.cos(theta)};

	brigadeUnits.forEach(droid => {
		const category = getDroidFbGroupClassification(droid);
		let currIdx = currentIdx.get(category);
		if (currIdx == undefined) {
			deb(`"${category}" is invalid`)
			return
		}

		const offsets = COLUMN_FORMATION_OFFSETS.get(category);
		if (offsets == null) {
			deb(`"${category}" is invalid`)
			return
		}

		const bx = offsets[currIdx][0];
		const by = offsets[currIdx][1];
		if (bx == null || by == null) {
			deb(`"${category}, entry number (${currIdx})" is invalid`)
			return
		}

		const ox = x + applyXRotation(bx, by);
		const oy = y + applyYRotation(bx, by);

		hackMarkTiles(ox, oy);
		currIdx += 1;

		// deb(`${ox}, ${oy}`)
		if (isWalkable[Math.floor(ox)][Math.floor(oy)]) {

			// Formation keeping
			const DISTSQ_TO_ASSIGNED_LOC = distSq(ox, droid.x, oy, droid.y); 

			if ([DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, DIVISION.SENSOR_RESERVE, DIVISION.MAINTENANCE_RESERVE, DIVISION.AIR_DEFENCE_RESERVE].includes(category)) {
				if (DISTSQ_TO_ASSIGNED_LOC > 2 ** 2) {
					orderDroidLoc(droid, DORDER_MOVE, ox, oy);
				} else {
					orderDroid(droid, DORDER_HOLD);
				}
			} else {
				if (DISTSQ_TO_ASSIGNED_LOC > 5 ** 2) {
					orderDroidLoc(droid, DORDER_MOVE, ox, oy);
				} else {
					orderDroidLoc(droid, DORDER_SCOUT, targetX, targetY);			
				}
			}
		} else {
			orderDroidLoc(droid, DORDER_SCOUT, targetX, targetY);			
		}

	});
}

/**
 * TAC SOP: MOVE A BRIGADE COMBAT TEAM (BCT) TO ATTACK A TARGET
 * @param {worldState} state 
 * @param {number} brigadeID 
 * @param {BrigadeTargets} groundTargets 
 * @returns 
 */
function moveBrigadeToAttack(state, brigadeID, groundTargets) {

	const isWalkable = state.mapData.isWalkable;

	const WEDGE_FORMATION_OFFSETS = new Map([
		// Note: this is matched to the v0.5.2 brigade composition
		[DIVISION.INFANTRY_RESERVE, [[4, 0], [4, 1], [4, -1], [4, 2], [3, 3], [3, -1]]],
		[DIVISION.HEAVY_CAV_RESERVE, [[3, 1], [3, -1], [3, 2]]],
		[DIVISION.LIGHT_CAV_RESERVE, [[3, 0], [2, -2], [2, 3]]],
		[DIVISION.AIR_DEFENCE_RESERVE, [[2, 0], [1, 1]]],
		[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, [[1, 2], [1, -1], [0, 1], [0, 0]]],
		[DIVISION.MAINTENANCE_RESERVE, [[2, 1]]],
		[DIVISION.SENSOR_RESERVE, [[1, 0]]],
	]);

	const currentIdx = new Map([
		[DIVISION.INFANTRY_RESERVE, 0],
		[DIVISION.HEAVY_CAV_RESERVE, 0],
		[DIVISION.LIGHT_CAV_RESERVE, 0],
		[DIVISION.AIR_DEFENCE_RESERVE, 0],
		[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 0],
		[DIVISION.MAINTENANCE_RESERVE, 0],
		[DIVISION.SENSOR_RESERVE, 0],
	]);

	// Note: object == `null` checks are not required because they have been integrated with the function which generates `groundTargets`.
	const directFireTargets = groundTargets["directFireTargets"];
	const fireSupportTargets = groundTargets["fireSupportTargets"];		
	const adaTargets = groundTargets["adaTargets"];

	const DIRECT_FIRE_TARGET = directFireTargets[0];
	const FIRE_SUPPORT_TARGET = fireSupportTargets[0];
	const ADA_TARGET = adaTargets[0];

	const DIRECT_FIRE_TARGET_AVAILABLE = DIRECT_FIRE_TARGET != undefined;
	const FIRE_SUPPORT_TARGET_AVAILABLE = FIRE_SUPPORT_TARGET != undefined;
	const ANTI_AIR_TARGET_AVAILABLE = ADA_TARGET != undefined;

	if (DIRECT_FIRE_TARGET == undefined) {
		return;
	}

	const x = state.brigades[brigadeID]['location'].x;
	const y = state.brigades[brigadeID]['location'].y;
	markTile(x, y);

	const targetX = DIRECT_FIRE_TARGET.x;
	const targetY = DIRECT_FIRE_TARGET.y;

	const etx = targetX - x;
	const ety = targetY - y;
	const theta = Math.atan2(ety, etx);
	const applyXRotation = (bx, by) => {return bx * Math.cos(theta) + by * -1 * Math.sin(theta)};
	const applyYRotation = (bx, by) => {return bx * Math.sin(theta) + by * Math.cos(theta)};

	/** @type {Map<number, DroidObject[]>} */
	const UNITS = new Map([
		[DIVISION.HEAVY_CAV_RESERVE, []],
		[DIVISION.LIGHT_CAV_RESERVE, []],
		[DIVISION.INFANTRY_RESERVE, []],
		[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, []],
		[DIVISION.SENSOR_RESERVE, []],
		[DIVISION.AIR_DEFENCE_RESERVE, []],
		[DIVISION.MAINTENANCE_RESERVE, []],
	]);


	const fixNearestDamaged = (droid) => {
		if (droid.order === DROID_REPAIR) {			// do not interrupt a repair in progress
			return;	
		}
		const nearby = enumRange(droid.x, droid.y, 4, ALLIES);
		for (let i=0; i<nearby.length; i++) {
			const obj = nearby[i];
			if (obj.type !== DROID) {
				continue;
			}
			if (obj.health < 99) {
				orderDroidObj(droid, DORDER_REPAIR, obj);
				return;
			}
		}
	};
	const directFireAttack = (droid) => {if (DIRECT_FIRE_TARGET_AVAILABLE) attackTarget(droid, DIRECT_FIRE_TARGET);};
	const fireSupportAttack = (droid) => {
		if (FIRE_SUPPORT_TARGET_AVAILABLE) {
			const MAX_FIRE_SUPPORT_TARGETS = 5;
			const DROID_RANGE_SQ = (droid.range / WZ2100_TILERANGE_SCALING_FACTOR) ** 2;
			for (let i=0; i<Math.min(MAX_FIRE_SUPPORT_TARGETS, fireSupportTargets.length); i++) {
				if (distSq(droid.x, fireSupportTargets[i].x, droid.y, fireSupportTargets[i].y) < DROID_RANGE_SQ) {
					attackTarget(droid, fireSupportTargets[i]);
				}
			}
		}	
	}
	const antiAirAttack = (droid) => {if (ANTI_AIR_TARGET_AVAILABLE) attackTarget(droid, ADA_TARGET);};

	/** @type {Map<number, Function>} */
	const UNIT_ATTACK_ORDERS = new Map ([
		[DIVISION.HEAVY_CAV_RESERVE, (droid) => directFireAttack(droid)],
		[DIVISION.LIGHT_CAV_RESERVE, (droid) => directFireAttack(droid)],
		[DIVISION.INFANTRY_RESERVE, (droid) => directFireAttack(droid)],
		[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, (droid) => fireSupportAttack(droid)],
		[DIVISION.SENSOR_RESERVE, (droid) => orderDroid(droid, DORDER_HOLD)],		
		[DIVISION.AIR_DEFENCE_RESERVE, (droid) => antiAirAttack(droid)],
		[DIVISION.MAINTENANCE_RESERVE, (droid) => fixNearestDamaged(droid)],
	]);

	const brigadeUnits = state.g.enumGroup(brigadeID);
	brigadeUnits.forEach(droid => {
		const category = getDroidFbGroupClassification(droid);

		const unitList = UNITS.get(category);
		if (unitList == null) {
			warn(`tac_com_ground: brigadeUnit classifier failed for "${category}" - ${droid.name} (${droid.id})`);
			return;
		}

		unitList.push(droid);

		const offsets = WEDGE_FORMATION_OFFSETS.get(category);
		if (offsets == null) {
			warn(`tac_com_ground: offsets lookup failed for "${category}" - ${droid.name} (${droid.id})`);
			return;
		}

		let currIdx = currentIdx.get(category);
		if (currIdx == null) {
			warn(`tac_com_ground: currentIdx lookup failed for "${category}" - ${droid.name} (${droid.id})`);
			return;
		}

		const bx = offsets[currIdx][0];
		const by = offsets[currIdx][1];
		const ox = x + applyXRotation(bx, by);
		const oy = y + applyYRotation(bx, by);

		currIdx += 1;		// add 1 for the next query

		hackMarkTiles(ox, oy);	

		// deb(`${ox}, ${oy}`)
		if (isWalkable[Math.floor(ox)][Math.floor(oy)]) {

			// Formation keeping
			const DISTSQ_TO_ASSIGNED_LOC = distSq(ox, droid.x, oy, droid.y); 

			if ([DIVISION.SENSOR_RESERVE, DIVISION.MAINTENANCE_RESERVE, DIVISION.AIR_DEFENCE_RESERVE].includes(category)) {
				if (DISTSQ_TO_ASSIGNED_LOC > 2 ** 2) {
					orderDroidLoc(droid, DORDER_MOVE, ox, oy);
				} else {
					const attackOrder = UNIT_ATTACK_ORDERS.get(category);
					if (attackOrder == null) {
						warn(`tac_com_ground: orders could not be resolved for "${category}"`);
						return;
					}
					attackOrder(droid);
				}
			} else {
				if (DISTSQ_TO_ASSIGNED_LOC > 5 ** 2) {
					orderDroidLoc(droid, DORDER_MOVE, ox, oy);
				} else {
					const attackOrder = UNIT_ATTACK_ORDERS.get(category);
					if (attackOrder == null) {
						warn(`tac_com_ground: orders could not be resolved for "${category}"`);
						return;
					}
					attackOrder(droid);			
				}
			}
		} else {
			
			if (![DIVISION.SENSOR_RESERVE, DIVISION.MAINTENANCE_RESERVE, DIVISION.AIR_DEFENCE_RESERVE].includes(category)) {
				orderDroidLoc(droid, DORDER_SCOUT, targetX, targetY);			
			} else {
				orderDroid(droid, DORDER_HOLD);
			}
		}

	});

	// DEBUG
	if (false) {
		hackMarkTiles();
		if (defined(DIRECT_FIRE_TARGET)) {
			addBeacon(DIRECT_FIRE_TARGET.x, DIRECT_FIRE_TARGET.y, 0);
		}
		if (defined(FIRE_SUPPORT_TARGET)) {
			const RADIUS = 1;		// creates a bounding box with dimension [2*RADIUS + 1 by 2*RADIUS+1]
			hackMarkTiles(FIRE_SUPPORT_TARGET.x - RADIUS, FIRE_SUPPORT_TARGET.y - RADIUS, FIRE_SUPPORT_TARGET.x + RADIUS, FIRE_SUPPORT_TARGET.y + RADIUS);
		}
	}
}