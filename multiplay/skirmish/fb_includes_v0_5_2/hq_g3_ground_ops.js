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


class armyGroundOperations {

	constructor() {
		
	}

	/**
	 * Factory function for `CombatMissionData`.
	 * @param {number} missionType
	 * @param {number | string} id
	 * @param {number | string} groupID
	 * @param {DroidObject | StructureObject | undefined} target
	 * @returns {CombatMissionData}
	 */
	#createMissionOrders(missionType, id, groupID, target) {
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
			'target': target,
		};
	}
	/**
	 * This is the default behaviour of all RETURN_FOR_REPAIR vehicles.
	 * Units are moved out of the 'repair' group by resupplyLogisitics. This will move the droid into its appropriate reserve group.
	 * @param {Object} missionConfig
	 * @param {number} missionConfig.missionType
	 * @returns {CombatMissionData}
	 */
	createReturnForRepairMission({missionType}) {
		const target = undefined;
		const md =  this.#createMissionOrders(missionType, "RETURN_FOR_REPAIR", DIVISION.RETURNING_FOR_REPAIR, target);

		md.orders = () => returnForRepair(md.taskForceID);	
		md.ceaseOrders = () => {};
		return md;
	}

	/**
	 * Returns if FishBot is ready to send its initial units out of base.
	 * @param {worldState} state 
	 * @returns {boolean}
	 */
	isReadyToAttack(state) {

		const myPlayerInfo = state.playerInfo[me];
		if (myPlayerInfo['numArmourUnits'] >= 1) {
			return true;
		} else {
			return false;
		}

	}

	/**
	 * Approximates where the group currently is by averaging all direct-fire units' positions,
	 * then snapping to the direct-fire unit closest to that average so the returned location is
	 * always a tile a unit actually occupies (and therefore reachable).
	 * Mortar units are excluded because their long attack range means they can sit far from the
	 * rest of the group, which would skew the estimate of where the group actually is.
	 *
	 * Returns `baseLocation` if no units are found.
	 * @param {number} brigadeID
	 * @returns {PositionInfo} the location of the unit nearest the group's average (if units exist); else `baseLocation`.
	 */
	getForceCenterLoc(brigadeID) {
		const heightMap = state.mapData.heightMap;

		const brigadeUnits = state.g.enumGroup(brigadeID);

		const baseX = baseLocation.x;
		const baseY = baseLocation.y;
		const baseZ = heightMap[baseX][baseY];
		const basePosition = {'x': baseX, 'y': baseY, 'z': baseZ};

		const directFireUnits = brigadeUnits.filter((droid) => !droid.hasIndirect);
		if (directFireUnits.length === 0) {
			return basePosition;
		}

		let sumX = 0;
		let sumY = 0;
		directFireUnits.forEach((droid) => {
			sumX += droid.x;
			sumY += droid.y;
		});
		const averageX = Math.floor(sumX / directFireUnits.length);
		const averageY = Math.floor(sumY / directFireUnits.length);

		// Snap the average to the nearest direct-fire unit
		let nearestUnit = directFireUnits[0];
		let nearestDistSq = Infinity;
		directFireUnits.forEach((droid) => {
			const dx = droid.x - averageX;
			const dy = droid.y - averageY;
			const distSq = (dx * dx) + (dy * dy);
			if (distSq < nearestDistSq) {
				nearestDistSq = distSq;
				nearestUnit = droid;
			}
		});

		return {"x": nearestUnit.x, "y": nearestUnit.y, "z": heightMap[nearestUnit.x][nearestUnit.y]};
	}

}