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
	 * Averages the units' positions. Outlier-sensitive: a straggler drags the result backwards, which
	 * pulls the brigade back with it.
	 * @param {DroidObject[]} units must not be empty
	 * @returns {{x: number, y: number}}
	 */
	#getAverageLoc(units) {
		let sumX = 0;
		let sumY = 0;
		units.forEach((droid) => {
			sumX += droid.x;
			sumY += droid.y;
		});
		return {'x': Math.floor(sumX / units.length), 'y': Math.floor(sumY / units.length)};
	}

	/**
	 * Takes the median of the units' positions in each axis. Outlier-resistant: stragglers no longer drag
	 * the result backwards, so a large brigade keeps pressing the attack.
	 * @param {DroidObject[]} units must not be empty
	 * @returns {{x: number, y: number}}
	 */
	#getMedianLoc(units) {
		const unitX = [];
		const unitY = [];
		units.forEach((droid) => {
			unitX.push(droid.x);
			unitY.push(droid.y);
		});
		return {'x': Math.floor(arrayMedian(unitX)), 'y': Math.floor(arrayMedian(unitY))};
	}

	/**
	 * Approximates where the group currently is, using whichever estimator suits the brigade's strength:
	 * a weak brigade is centred by average (which plays it safe), an established one by median (which
	 * presses the attack). `strength` is smoothed by `updateBrigadeSupplyStatus()`, so the brigade does
	 * not switch estimator every time a single unit dies and is replaced.
	 *
	 * Mortar units are excluded because their long attack range means they can sit far from the
	 * rest of the group, which would skew the estimate of where the group actually is.
	 *
	 * The result is snapped to the direct-fire unit nearest the estimate. This is required: a per-axis
	 * median is not a true 2D median, so it can land on a tile that no unit occupies and which may not
	 * even be walkable.
	 *
	 * Returns `baseLocation` if no units are found.
	 * @param {worldState} state
	 * @param {number} brigadeID
	 * @param {GroundForceParameters} parameters
	 * @returns {PositionInfo} the location of the unit nearest the group's center (if units exist); else `baseLocation`.
	 */
	getForceCenterLoc(state, brigadeID, parameters) {
		const heightMap = state.mapData.heightMap;

		const brigadeUnits = state.g.enumGroup(brigadeID);

		const baseX = baseLocation.x;
		const baseY = baseLocation.y;
		const baseZ = heightMap[baseX][baseY];
		const basePosition = {'x': baseX, 'y': baseY, 'z': baseZ};

		if (brigadeUnits.length === 0) {
			return basePosition;
		}

		const brigadeStrength = state.brigades[brigadeID].strength;
		const BRIGADE_CAN_TAKE_RISKS = brigadeStrength >= parameters.MEDIAN_CENTER_STRENGTH_THRESHOLD;
		const centerEstimate = BRIGADE_CAN_TAKE_RISKS ? this.#getMedianLoc(brigadeUnits) : this.#getAverageLoc(brigadeUnits);

		// Snap the estimate to the nearest direct-fire unit
		let nearestUnit = brigadeUnits[0];
		let nearestDistSq = Infinity;
		brigadeUnits.forEach((droid) => {
			const currDistSq = distSq(droid.x, centerEstimate.x, droid.y, centerEstimate.y);
			if (currDistSq < nearestDistSq) {
				nearestDistSq = currDistSq;
				nearestUnit = droid;
			}
		});

		return {"x": nearestUnit.x, "y": nearestUnit.y, "z": heightMap[nearestUnit.x][nearestUnit.y]};
	}

}