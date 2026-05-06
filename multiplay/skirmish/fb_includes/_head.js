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
 * This file contains important type definitions & constants that are used throughout the code.
 * As it uses `baseLocation`, it should be included after `__wz_head.js`, but it precede inclusion of all other files.
 */


/*
	TYPE DEFINITIONS
*/

/**
 * @typedef {Object} TargetObject
 * `TargetObject` is FishBot's implementation of a generic game object (naming could be better).
 * @property {string} name
 * @property {number} type
 * @property {number} player
 * @property {number} id
 * @property {number} flags
 * @property {number} gx
 * @property {number} gy
 * @property {number} priority
 */

/**
 * @typedef {Object} PositionInfo
 * Generic FishBot 'Position' object.
 * @property {number} x 
 * @property {number} y
 * @property {number} z map height at (x,y), obtained from `MapTiles[y][x].height`.
 */

/**
 * Type definitions for `worldState.poi.derricks`.
 * @typedef {Object} DerrickObject
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} gx
 * @property {number} gy
 * @property {boolean} isClaimed
 * @property {number | undefined} playerID
 */

/**
 * Type definitions for `worldState.poi.bases`.
 * @typedef {Object} PlayerHomeBaseObject
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} gx
 * @property {number} gy
 * @property {boolean} isEnemy
 * @property {number | undefined} playerID
 */

/**
 * Type definition for `worldState.playerInfo`.
 * @typedef {Object} PlayerStatsObject
 * @property {number} playerID
 * @property {boolean} isFriendly
 * 
 * // Unit types
 * @property {number} numTotalUnits
 * @property {number} numInfantryUnits
 * @property {number} numArmourUnits
 * @property {number} numAirUnits air units (e.g. VTOL)
 * 
 * // Weapons
 * @property {number} numRocketUnits anti-personnel units (e.g. MG)
 * @property {number} numCannonUnits general-purpose (e.g. cannon)
 * @property {number} numMGUnits
 * @property {number} numShortRangeIndirectUnits short range indirect fires (e.g. mortar)
 * @property {number} numLongRangeIndirectUnits
 * @property {number} numVTOLBombUnits 
 * @property {number} numADAUnits air-defence-artillery units (e.g. flak cannon)
 * @property {number} numLaserUnits
 * @property {number} numFlamerUnits
 * 
 * // Statistics
 * @property {number} numTrucks
 * @property {number} numStructs
 * @property {number} numFactories
 * @property {number} numDerricks
 * @property {number} numConstructedHQs
 * @property {number} numRepairFacilities
 * 
 * // Intended to be used for getting idle structures for Production & Research, and for demolishing Repair Facilities
 * @property {TargetObject[]} normalFactoryFbObjects
 * @property {TargetObject[]} cyborgFactoryFbObjects
 * @property {TargetObject[]} vtolFactoryFbObjects
 * @property {TargetObject[]} researchFacilityFbObjects
 * @property {TargetObject[]} repairFacilityFbObjects
 * 
 */

/**
 * Type definitions for `worldState.brigades`.
 * @typedef {number} BrigadeIDType
 * 
 * @typedef {Object} TargetInfoSOA
 * @property {string[]} name
 * @property {Uint32Array} type
 * @property {Uint8Array} player
 * @property {Uint32Array} id
 * @property {Uint32Array} flags
 * @property {Uint32Array} gx
 * @property {Uint32Array} gy
 * @property {Uint8Array} priority
 * 
 * @typedef {Object} BrigadeInfo
 * @property {number} id brigade ID
 * @property {PositionInfo} position  
 * @property {TargetInfoSOA} nearbyTargets
 */

/*
    FISHBOT PARAMETERS
*/

const CAMPAIGN_STATUS = {
	DEFENCE: 1,
	COUNTERATTACK: 2,
    BUILDUP: 3,
	MANEUVER: 4,
	STAGING: 5,
	MAIN_ASSAULT: 6,
	PURSUIT: 7,
};
Object.freeze(CAMPAIGN_STATUS);


const campaignTransitions = {
	// currently circular

	'CompletedDefence': {
		[CAMPAIGN_STATUS.DEFENCE]: CAMPAIGN_STATUS.COUNTERATTACK
	},
	'CompletedCounterattack': {
		[CAMPAIGN_STATUS.COUNTERATTACK]: CAMPAIGN_STATUS.BUILDUP
	},
	'CompletedBuildup': {
		[CAMPAIGN_STATUS.BUILDUP]: CAMPAIGN_STATUS.STAGING
	},
	// 'CompletedManeuver': {
	// 	[CAMPAIGN_STATUS.MANEUVER]: CAMPAIGN_STATUS.STAGING
	// },
	'CompletedStaging': {
		[CAMPAIGN_STATUS.STAGING]: CAMPAIGN_STATUS.MAIN_ASSAULT
	},
	'CompletedMainAssault': {
		[CAMPAIGN_STATUS.MAIN_ASSAULT]: CAMPAIGN_STATUS.PURSUIT
	},
	'CompletedPursuit': {
		[CAMPAIGN_STATUS.PURSUIT]: CAMPAIGN_STATUS.BUILDUP
	}

}
Object.freeze(campaignTransitions);


/*
	TOC (Tactical Operations Center) PARAMETERS
*/

const MISSION_STATUS = {
	FAILED_CREATION: 0,
	NOT_STARTED: 1,
	IN_PROGRESS: 2,
	FAILED: 3,
	SUCCEEDED: 4,
	ABORT: 5,
	FAILED_ABORTED: 6
};
Object.freeze(MISSION_STATUS);


const MISSION_PRIORITY = {
	URGENT: 5,
	VERY_HIGH: 4,
	HIGH: 3,
	MEDIUM: 2,
	LOW: 1
};
Object.freeze(MISSION_PRIORITY);


const OBJ_FLAGS = {
    // unit classes
    ARMOUR:        				1 << 0,
    INFANTRY:    				1 << 1,
    INDIRECT_FIRE:     			1 << 2,
    AVIATION:          			1 << 3,
	ADA: 						1 << 4,

	MACHINEGUN_WEAPON: 			1 << 5,
	FLAMER_WEAPON:				1 << 6,
	CANNON_WEAPON:				1 << 7,
	AT_ROCKET_WEAPON:			1 << 8,
	VTOL_ARTILLERY_WEAPON:		1 << 9,
	SHORT_RANGE_ARTILLERY_WEP:	1 << 10,		
	LONG_RANGE_ARTILLERY_WEP:	1 << 11,
    AA_DIRECT_FIRE_WEAPON:      1 << 12,
	AA_ROCKET_WEAPON:			1 << 13,
	LASER_WEAPON:				1 << 14,
	UNCLASSIFIED_WEAPON_TYPE:	1 << 15,

	// propulsion
	CYBORG_PROPULSION: 			1 << 16,
	TRACKED_PROPULSION: 		1 << 17,
	HALF_TRACKED_PROPULSION: 	1 << 18,
	HOVER_PROPULSION: 			1 << 19,
	WHEELED_PROPULSION: 		1 << 20,
	VTOL_PROPULSION: 			1 << 21,

	// capabilities
    CONSTRUCTOR:      			1 << 22,
	REPAIR:						1 << 23,

    // structures
    PRODUCTION:   				1 << 24,
	RESEARCH: 					1 << 25,
	POWER_GENERATOR:			1 << 26,
    RESOURCE_EXTRACTOR:       	1 << 27,
    DEFENSIVE_STRUCTURE:      	1 << 28,
	IS_BUILT:					1 << 29,
};
Object.freeze(OBJ_FLAGS);

const MISSION_TYPE = {
	ABORT_MISSION: 0,

	// ARMY AVIATION
	VTOL_STAGING_MISSION: 1000,
	CAS_STRIKE: 1001,
	AIR_RAID: 1002,
	DAS_STRIKE: 1003,

	CAS_PATROL: 1004,
	AIR_RECON_SILENT: 1302,
	AIR_RECON_PATROL: 1301,

	// ARMY GROUND COMMAND
	RETURN_FOR_REPAIR: 2000,
	GROUND_SECURITY: 2002,
	RAID: 2003,

	// ARMY INTELLIGENCE


	// ARMY ENGINEERING
	HELP_CONSTRUCT: 4000,
	CONSTRUCT_OIL_DERRICK: 4001,
	CONSTRUCT_BASE_STRUCTURE: 4002,
	CONSTRUCT_SINGLE_MODULE: 4003,
	CONSTRUCT_NEARBY_DEFENCE: 4004,
	CONSTRUCT_ALL_DERRICKS_IN_SECTOR: 4005,
	CONSTRUCT_AUTO_DETECT_BY_STRUCTURE: 4006,
	CONSTRUCT_REPAIR_CENTER: 4007,
	DEMOLISH_REPAIR_CENTER: 4008,
};

const CONSTRUCTION_MISSION_TYPES = [
	// For new missions; remember to change: `translateIntoBuildRequest()` in `hq_g4_construction.js`.
	MISSION_TYPE.HELP_CONSTRUCT, 
	MISSION_TYPE.CONSTRUCT_OIL_DERRICK,
	MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE,
	MISSION_TYPE.CONSTRUCT_SINGLE_MODULE,
	MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE,
	MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR,
	MISSION_TYPE.CONSTRUCT_AUTO_DETECT_BY_STRUCTURE,
	MISSION_TYPE.CONSTRUCT_REPAIR_CENTER,
	MISSION_TYPE.DEMOLISH_REPAIR_CENTER
];

const AVIATION_MISSION_TYPES = [
	MISSION_TYPE.VTOL_STAGING_MISSION,
	MISSION_TYPE.CAS_STRIKE,
	MISSION_TYPE.AIR_RAID,
	MISSION_TYPE.DAS_STRIKE,
	MISSION_TYPE.CAS_PATROL,
	MISSION_TYPE.AIR_RECON_SILENT,
	MISSION_TYPE.AIR_RECON_PATROL
];

Object.freeze(MISSION_TYPE);
Object.freeze(CONSTRUCTION_MISSION_TYPES);
Object.freeze(AVIATION_MISSION_TYPES);

/*
    COMBAT FORCE PARAMETERS
*/
const DIVISION = {
	AIR_RESERVE: 1000,

    GENERAL_RESERVE: 2001,
    HEAVY_CAV_RESERVE: 2002,
    LIGHT_CAV_RESERVE: 2003,
	INFANTRY_RESERVE: 2004,
	SHORT_RANGE_FIRE_SUPPORT_RESERVE: 2005,
    LONG_RANGE_FIRE_SUPPORT_RESERVE: 2006,
    AIR_DEFENCE_RESERVE: 2007,
	SENSOR_RESERVE: 2008,
	
    FIRST_BCT: 3011,                 // this is a combined arms team; each brigade with ~26 units
    SECOND_BCT: 3012,
    THIRD_BCT: 3013,
    FOURTH_BCT: 3014,
	FIFTH_BCT: 3015,

	RETURNING_FOR_REPAIR: 4000,
};
Object.freeze(DIVISION);

/*
    LOGISTICS PARAMETERS
*/
const ENGINEERING = {
    ENGINEERING_RESERVE: 5000,
}
Object.freeze(ENGINEERING);
