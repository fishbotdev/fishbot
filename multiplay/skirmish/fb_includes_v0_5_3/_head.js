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
 * As it uses `baseLocation`, it should be included after `__wz_head.js`, but it should precede inclusion of all other files.
 */


/*
	TYPE DEFINITIONS
*/

/**
 * @typedef {Object} ConstructionMissionData
 * @property {number | string} id 		Unique ID to designate this particular mission
 * @property {number} missionType		Mission type (integer; defined in _head.js)
 * @property {number} missionStatus		Mission status (integer; defined in _head.js)
 * @property {number} priority			Mission priority (integer; defined in _head.js)
 * @property {number | string} taskForceID	
 * @property {Function} orders			Mission action callback
 * @property {Function} ceaseOrders		Mission cleanup callback
 * @property {number} timeStarted		= `gameTime` at mission start
 * @property {number} timeCompleted
 * @property {string} sectorID			Position parameter: (v0.3.0 sector system / object uid)
 * @property {number} gx				Position parameter: grid x coordinate (v0.4.0 sector system)
 * @property {number} gy				Position parameter: grid y coordinate (v0.4.0 sector system)
 */

/**
 * @typedef {Object} CombatMissionData
 * @property {number | string} id Unique ID to designate this particular mission
 * @property {number} missionType 
 * @property {number} missionStatus
 * @property {number} priority
 * @property {number | string} taskForceID Group ID for units assigned to this mission (typically the same as 'id')
 * @property {Function} orders
 * @property {Function} ceaseOrders
 * @property {number} timeStarted
 * @property {number} timeCompleted
 * @property {DroidObject | StructureObject | undefined} target
 */

///////////////////////////////////////////// INTELLIGENCE /////////////////////////////////////////////

/**
 * @typedef {Object} FbObject
 * `FbObject` is FishBot's lightweight implementation of a generic game object.
 * @property {number} type
 * @property {number} player
 * @property {number} id
 * @property {number} flags
 * @property {number} x (stale) x coordinate
 * @property {number} y (stale) y coordinate
 * 
 * 
 * @typedef {Object} PlayerInfoBucketObject
 * @property {number} playerID
 * @property {DroidObject[]} droids
 * @property {StructureObject[]} structs
 */

///////////////////////////////////////////// WORLD STATE /////////////////////////////////////////////

/**
 * Type definitions for `worldState.mapData`.
 * @typedef {Object} MapData
 * @property {number} HALF_MAP_WIDTH Half of the `mapWidth` (integer)
 * @property {number} HALF_MAP_HEIGHT Half of the `mapHeight` (integer)
 * @property {Coordinate[]} walkableTiles BFS order of the coordinates of all walkable tiles from the player's base location
 * @property {(boolean[])[]} isWalkable Lookup table; walkable = whether or not another object can be placed on top of that tile
 * @property {(boolean[])[]} isReachable Lookup table; reachable = whether or not an adjacent tile can be pathed to
 * @property {(boolean[])[]} isDerrickPosition Lookup table used for construction
 * @property {Coordinate[]} QUADRANT_SEARCH_PATTERN Lookup table used for construction
 * @property {(number[])[]} heightMap Height map keyed by (x, y). Usage example: `state.mapData.heightMap[x][y]`.
 * @property {(number[])[]} chokepointWidth Corridor width in tiles at (x, y); 0 for non-walkable tiles.
 * @property {(boolean[])[]} isChokepoint Lookup table; true if (x, y) is a narrow chokepoint.
 */

/**
 * Type definitions for `worldState.fields`.
 * @typedef {Object} SpatialFieldsObject
 * @property {number[][]} adaThreat
 * @property {number[][]} enemyStaticDefenceThreat
 * @property {number[][]} enemyUnitThreat
 * @property {number[][]} distanceFromMyBase
 * @property {number[][]} totalDerricksInCell
 * @property {number[][]} unclaimedDerricksInCell
 * @property {number[][]} controlStability
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
 * @typedef {Object} FbGridCell
 * FishBot grid cell definition.
 * @property {string} id
 * @property {number} gx
 * @property {number} gy
 * @property {FbObject[]} targetUnits
 * @property {FbObject[]} targetStructures
 * @property {FbObject[]} friendlyUnits
 * @property {FbObject[]} friendlyStructures
 * @property {DerrickObject[]} derricks
 * @property {PlayerHomeBaseObject[]} bases
 */

/**
 * @typedef {Object} EnumRangeLazyResult 
 * @property {FbObject[]} targetUnits
 * @property {FbObject[]} targetStructures
 * @property {FbObject[]} friendlyUnits
 * @property {FbObject[]} friendlyStructures
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
 * @property {number} numRocketUnits anti-tank units (e.g. rockets / missiles)
 * @property {number} numCannonUnits general-purpose (e.g. cannon)
 * @property {number} numMGUnits anti-personnel units (e.g. MG)
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
 * // These lists are intended to be used for getting idle structures for Production & Research, and for demolishing Repair Facilities (saves expensive `enumStruct` calls).
 * @property {FbObject[]} normalFactoryFbObjects
 * @property {FbObject[]} cyborgFactoryFbObjects
 * @property {FbObject[]} vtolFactoryFbObjects
 * @property {FbObject[]} researchFacilityFbObjects
 * @property {FbObject[]} repairFacilityFbObjects
 * 
 */

/**
 * Type definition for `worldState.activeProductionJobs`.
 * @typedef {Object} ProductionJob
 * @property {StructureObject} factory
 * @property {number} type FishBot droid type (e.g. DIVISION.HEAVY_CAV_RESERVE)
 */

/**
 * @typedef {Object} PositionInfo
 * Generic FishBot 'Position' object.
 * @property {number} x 
 * @property {number} y
 * @property {number} z Map height at (x,y), obtained from `MapTiles[y][x].height` or `state.mapData.heightMap[x][y]`.
 */

/** 
 * @typedef {[number, number]} Coordinate 
 * Raw coordinate object (x, y) where performance is critical.
 */


/**
 * @typedef {Object} NearbyTargets
 * @property {FbObject[]} enemyArmor
 * @property {FbObject[]} enemyInfantry
 * @property {FbObject[]} enemyIndirectFire
 * @property {FbObject[]} enemyADA
 * @property {FbObject[]} enemyAviation
 * @property {FbObject[]} enemyConstructor
 * @property {FbObject[]} enemyIndustrial
 * @property {FbObject[]} enemyUtility
 * @property {FbObject[]} enemyDefenses
 * 
 */

/**
 * @typedef {Object} AirStrikeMissionRequest
 * @property {number} missionType
 * @property {DroidObject | StructureObject | FeatureObject} target
 * @property {number} priority
 * @property {number} numAircraft
 * @property {string} targetClass one of `AIR_TARGET_CLASS`; selects the request's target class weight
 * @property {number} cost air tasking ranking (lower wins); written each cycle by `#scoreAirMissionRequest`
 * @property {number} demandWeight CAS only: how badly the requesting brigade needs air support (lower = more)
 */

/**
 * @typedef {Object} AirStrikeMissionRequestLazy
 * @property {number} missionType
 * @property {FbObject} target
 * @property {number} priority
 * @property {number} numAircraft
 * @property {string} targetClass one of `AIR_TARGET_CLASS`; selects the request's target class weight
 * @property {number} cost air tasking ranking (lower wins); written each cycle by `#scoreAirMissionRequest`
 * @property {number} demandWeight CAS only: how badly the requesting brigade needs air support (lower = more)
 */

/**
 * Type definitions for `worldState.brigades`.
 * @typedef {Object} BattalionComposition
 * @property {number} category
 * @property {DroidObject[]} healthyUnitList
 * @property {DroidObject[]} damagedUnitList
 * @property {number} count
 * @property {number} deficit
 * 
 * @typedef {Map<number, BattalionComposition>} BrigadeComposition
 * 
 * @typedef {Object} BrigadeMetadata
 * @property {number} id This is the brigade ID (duplicate of the key).
 * @property {PositionInfo} location  
 * @property {number} strength Smoothed count of direct-fire units in the brigade (mortars excluded).
 * @property {number} avgBodySize Average vehicle BODY_WEIGHT (excludes cyborgs). Affects formation keeping (bigger vehicles need more room to maneuver).
 * @property {number} directFireCount Raw count of direct-fire units this update. `strength - directFireCount` is what the brigade is down on its recent peak.
 * @property {NearbyTargets} nearbyTargets
 * @property {FbObject[]} currentDirectFireTargets Previous cycle's ranked target list. Only `[0]` is read today; the rest is stored to be stepped through later.
 * @property {AirStrikeMissionRequest[]} casStrikeRequests
 * @property {BrigadeComposition} composition
 *  
 * @typedef {{ [brigadeID: number]: BrigadeMetadata }} BrigadeInfo
 *
 */

/**
 * @typedef {Object} TargetCandidate
 * A target under consideration this cycle. `target` is what FishBot reasons about and persists between cycles;
 * `targetObj` is fetched fresh each cycle for its position & health, and is handed to the engine.
 * @property {FbObject} target 
 * @property {DroidObject | StructureObject | FeatureObject} targetObj 
 * @property {number} cost direct fire ranking; lives here because `cost` is read-only on the game object
 */

/** 
 * @typedef {Object} BrigadeTargets
 * @property {(DroidObject | StructureObject | FeatureObject)[]} directFireTargets
 * @property {FbObject[]} directFireTargetRefs `directFireTargets` in persistable form, for `currentDirectFireTargets`. Not used by __tac.
 * @property {(DroidObject | StructureObject | FeatureObject)[]} fireSupportTargets
 * @property {(DroidObject | StructureObject | FeatureObject)[]} adaTargets
 * @property {AirStrikeMissionRequest[]} casTargets
 */

/**
 * Cohesion radii (in tiles): how much room a brigade is given to maneuver in.
 * Upper bound is set by "relaxed" (big vehicles), lower bound is set by "tight" (small vehicles).
 * @typedef {Object} CohesionRadius
 * @property {number} tight
 * @property {number} relaxed
 */


/*
	STRATEGIC PARAMETERS
*/

/**
 * @typedef {Object} AviationParameters
 * @property {number} totalNumAircraft
 * @property {boolean} SATURATION_RAID_ACTIVE 
 * @property {Object.<number, number>} MISSION_TYPE_WEIGHT CAS / raid / base strike posture, keyed by `MISSION_TYPE`
 * @property {Object.<string, number>} TARGET_CLASS_WEIGHT target value, keyed by `AIR_TARGET_CLASS`
 * @property {number} COMMITMENT_WEIGHT
 * @property {number} KNOCKOUT_WEIGHT
 * @property {number} LOW_HEALTH_THRESHOLD
 * @property {number} CAS_URGENCY_GAIN
 * @property {number} CAS_SATURATION_GAIN
 * @property {number} MIN_CAS_DEMAND_WEIGHT
 * @property {number} TURNAROUND_DISTANCE_FLOOR
 * @property {number} STANDARD_THREAT_THRESHOLD
 * @property {number} URGENT_THREAT_THRESHOLD
 * @property {number} SATURATION_THREAT_THRESHOLD
 * @property {number} CAS_SUPPORT_RADIUS
 * @property {number} UNITS_FOR_ADA_STRIKE
 */

/**
 * @typedef {Object} GroundForceParameters
 * @property {number} IMMEDIATE_DIRECT_FIRE_RADIUS
 * @property {number} DIRECT_FIRE_COMMITMENT_RADIUS
 * @property {number} TARGET_ADJACENCY_RADIUS
 * @property {number} COMMITMENT_WEIGHT
 * @property {number} ADJACENCY_WEIGHT
 * @property {number} KNOCKOUT_WEIGHT
 * @property {number} LOW_HEALTH_THRESHOLD
 * @property {number} BLOCKED_APPROACH_WEIGHT
 * @property {number} EFFECTIVE_FIRE_SUPPORT_RADIUS
 * @property {number} EFFECTIVE_ADA_RADIUS
 */

/**
 * @typedef {Object} ForceStructureParameters
 * @property {number} RELEASE_DWELL_TICKS
 * @property {number} MAX_THREAT_RATIO
 * @property {number} MAX_UNREPLACED_LOSSES
 * @property {number} releaseDwell
 */

/**
 * @typedef {Object} ConstructionParameters
 * @property {number} MAX_PARALLEL_BASE_BUILD_TASKS
 * @property {number} MAX_PARALLEL_OIL_CAP_TASKS
 * @property {number} MAX_PARALLEL_DEFENCE_BUILD_TASKS
 * @property {number} MAX_PARALLEL_REPAIR_CENTER_BUILD_TASKS
 * @property {number} ABORTED_SECTOR_COOLDOWN_MS
 * 
 * @property {number} DYNAMIC_POWER_GENERATOR_CAP 
 * @property {number} DYNAMIC_FACTORY_CAP
 * @property {number} DYNAMIC_RESEARCH_LAB_CAP
 * @property {number} MAX_VTOL_REARMING_PADS 
 * @property {boolean} SHOULD_BUILD_VTOLS 
 */

/** 
 * @typedef {Object} ResearchPath
 * @property {string[]} researchPriorities 
 * @property {string[]} researchBlacklist  
 */

/**
 * @typedef {Object} ResearchParameters
 * @property {ResearchPath} path
 */

/**
 * @typedef {Object} ProductionParameters
 * @property {boolean} CAN_DESIGN_UNITS
 * 
 * @property {boolean} SHOULD_PRODUCE_TRUCK_VEHICLES
 * @property {number} MAX_TRUCKS_THIS_TICK
 * @property {boolean} SHOULD_PRODUCE_TRUCK_CYBORGS
 * @property {number} DYNAMIC_TRUCK_CAP	
 * 
 * @property {Map<number, number>} BRIGADE_WEIGHTS
 * @property {Object} BRIGADE_COMPOSITION
 * @property {number} TOTAL_UNITS_PER_BRIGADE
 * 
 * @property {Map<number, number>} UNIT_WEIGHTS
 * @property {number} DEFAULT_LAND_UNIT_CATEGORY
 * @property {boolean} SHOULD_PRODUCE_INFANTRY
 * @property {boolean} SHOULD_PRODUCE_VTOLS
 * @property {boolean} SHOULD_PRODUCE_LAND_VEHICLES
 * 
 * @property {number} VEHICLE_REPAIR_THRESHOLD
 * @property {number} CYBORG_REPAIR_THRESHOLD
 * @property {number} STRENGTH_DECAY_RATE
 */

/*
    MISSION CONSTANTS
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

/**
 * The kind of thing an air strike request is pointed at. Assigned once, where the request is created (which
 * always knows the class), so that ranking never has to re-derive it from `OBJ_FLAGS`. Each class carries a
 * weight in `AVIATION_PARAMETERS.TARGET_CLASS_WEIGHT`, which is how "what is worth killing from the air" is tuned.
 */
/** Aircraft committed to one air strike. Also sets how many concurrent strikes the air reserve can sustain. */
const UNITS_PER_AIR_STRIKE = 2;

const AIR_TARGET_CLASS = {
	INDIRECT_FIRE: 'indirectFire',
	ADA: 'ada',
	PRODUCTION: 'production',
	ARMOUR: 'armour',
	DEFENCE: 'defence',
	RESOURCE_EXTRACTOR: 'resourceExtractor',
	CONSTRUCTOR: 'constructor',
};
Object.freeze(AIR_TARGET_CLASS);


const MISSION_TYPE = {
	ABORT_MISSION: 0,

	// ARMY AVIATION
	VTOL_STAGING_MISSION: 1000,
	CAS_STRIKE: 1001,
	AIR_RAID: 1002,
	DAS_STRIKE: 1003,

	// ARMY GROUND COMMAND
	RETURN_FOR_REPAIR: 2000,

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
];

Object.freeze(MISSION_TYPE);
Object.freeze(CONSTRUCTION_MISSION_TYPES);
Object.freeze(AVIATION_MISSION_TYPES);


/*
    COMBAT FORCE CONSTANTS
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
	MAINTENANCE_RESERVE: 2009,
	
    FIRST_BCT: 3011,                 // this is a combined arms team; each BCT with ~30 units
    SECOND_BCT: 3012,
    THIRD_BCT: 3013,
    FOURTH_BCT: 3014,
	FIFTH_BCT: 3015,
	BCT_RESERVE: 3016,

	RETURNING_FOR_REPAIR: 4000,
};
Object.freeze(DIVISION);

const BRIGADE_IDS = [DIVISION.FIRST_BCT, DIVISION.SECOND_BCT, DIVISION.THIRD_BCT, DIVISION.FOURTH_BCT, DIVISION.FIFTH_BCT];

// The reserve force is not a group of its own: reserve units sit in these category groups (which is also where
// newly manufactured units are placed) until resupply assigns them to a BCT.
const RESERVE_CATEGORY_GROUP_IDS = [
	DIVISION.HEAVY_CAV_RESERVE,
	DIVISION.LIGHT_CAV_RESERVE,
	DIVISION.INFANTRY_RESERVE,
	DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE,
	DIVISION.AIR_DEFENCE_RESERVE,
	DIVISION.SENSOR_RESERVE,
	DIVISION.MAINTENANCE_RESERVE,
];

/*
    LOGISTICS CONSTANTS
*/
const ENGINEERING = {
    ENGINEERING_RESERVE: 5000,
	BASE_BUILDER: 5001,
}
Object.freeze(ENGINEERING);

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