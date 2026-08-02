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

class armyAviation {
	constructor() {

	}

	#createAirStrikeRequest({missionType, target, priority, numAircraft}) {
		return {
			missionType: missionType,
			target: target,
			priority: priority,
			numAircraft: numAircraft,
		};
	}

	/**
	 * Creates a request for a CAS mission from a provided `targetObject`.
	 * @param {DroidObject | StructureObject | FeatureObject} targetObject 
	 * @returns {AirStrikeMissionRequest}
	 */
	translateIntoCASRequest(targetObject, priority) {
		return this.#createAirStrikeRequest({
			'missionType': MISSION_TYPE.CAS_STRIKE, 
			'target': targetObject,
			'priority': priority,
			'numAircraft': 2		
		});
	}
	
	/**
	 * Creates a request for an air raid mission from a provided `targetObject`.
	 * @param {DroidObject | StructureObject | FeatureObject} targetObject 
	 * @returns {AirStrikeMissionRequest}
	 */
	translateIntoRaidRequest(targetObject, priority) {
		return this.#createAirStrikeRequest({
			'missionType': MISSION_TYPE.AIR_RAID, 
			'target': targetObject,
			'priority': priority,
			'numAircraft': 2		
		});
	}

	/**
	 * Creates a request for an air raid mission from a provided `targetObject`.
	 * @param {DroidObject | StructureObject | FeatureObject} targetObject 
	 * @returns {AirStrikeMissionRequest}
	 */
	translateIntoDASRequest(targetObject, priority) {
		return this.#createAirStrikeRequest({
			'missionType': MISSION_TYPE.DAS_STRIKE, 
			'target': targetObject,
			'priority': priority,
			'numAircraft': 2		
		});
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
	 * Mission cleanup function (releases units back to the reserves).
	 * @param {CombatMissionData} md 
	 * @returns {void} Writes `timeCompleted` to missionData.
	 */
	#finaliseVtolMission(md) {
		const taskForceUnits = state.g.enumGroup(md.taskForceID);
		taskForceUnits.forEach(droid => state.g.addDroidToGroup({groupID: DIVISION.AIR_RESERVE, droidID: droid.id}));
		
		state.g.deleteGroup(md.taskForceID);
		md.timeCompleted = gameTime;
	}

	/**
	 * This is the default behaviour of all AIR_RESERVE aircraft. `groupID` should be `DIVISION.AIR_RESERVE`.
	 * @param {Object} missionConfig
	 * @param {number} missionConfig.missionType
	 * @returns {CombatMissionData}
	 */
	createVtolStagingMission({missionType}) {
		const target = undefined;
		const md =  this.#createMissionOrders(missionType, "VTOL_STAGING_MISSION", DIVISION.AIR_RESERVE, target);

		md.orders = () => rearmVtolGroup(md.taskForceID);		
		md.ceaseOrders = () => {};
		return md;
	}
	
	/**
	 * Creates an "Air Strike" mission for execution in the mission manager system.
	 * @param {Object} missionConfig
	 * @param {number} missionConfig.missionType
	 * @param {DroidObject | StructureObject} missionConfig.target game object
	 * @param {number} missionConfig.numRaidAircraft the number of aircraft assigned
	 * @param {number} missionConfig.tickUID uid to distinguish between missions scheduled in the same tick
	 * @param {string} missionConfig.type user-label for the mission (to help during debugging)
	 * @returns {CombatMissionData | undefined} Returns undefined if the mission was not able to be created.
	 */
	createAirStrikeMission({missionType, target, numRaidAircraft, tickUID, type}) {
		
		const airReserve = state.g.enumGroup(DIVISION.AIR_RESERVE);
		if (airReserve.length < numRaidAircraft) {
			return undefined;
		}

		const id = gameTime + `_${type}_` + tickUID;

		// Select ready units
		const readyUnits = [], notReadyUnits = [];
		for (let i=0; i<airReserve.length; i++) {
			const aircraft = airReserve[i];	
			if (!vtolArmed(aircraft, 85)) {
				notReadyUnits.push(aircraft);
				continue;
			}
			readyUnits.push(aircraft);
			if (readyUnits.length >= numRaidAircraft) {
				break;
			}	
		}
		const taskForceUnits = readyUnits;
		const deficit = numRaidAircraft - taskForceUnits.length;
		if (deficit > 0) {
			taskForceUnits.push(...notReadyUnits.slice(0, deficit));
		}

		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: id, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: DIVISION.AIR_RESERVE, droidID: droid.id});
		});

		const md = this.#createMissionOrders(missionType, id, id, target);

		md.orders = () => doAirStrike(target, id);		
		md.ceaseOrders = () => this.#finaliseVtolMission(md);
		return md;
	}

}