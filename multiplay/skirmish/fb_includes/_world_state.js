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
 *  This is the central database which stores the game state. 
 *
 *  This software uses the "Domain Services Model"
 *      - There is one shared game world / game state
 *      - There are multiple parts of the AI which either need to: 
 *          (1) look at the game state & make decisions     (but don't modify the game state)
 *          (2) change the game state
 *      - We want to avoid chaos (obscure modifications of the state, impossible debugging, duplication of logic)
 * 
 *  In the Domain Services architecture, we need a 
 *      1. Central database which stores the current game state ("state")    -- fulfilled by: this file _world_state.js
 *      2. State observer/reporter ("system")                                -- fulfilled by: operational level functions hq_gX
 *      3. State mutator ("service")                                         -- fulfilled by: hq_toc (delegated by hq_command) 
 *      4. Decision maker ("coordinator")                                    -- fulfilled by: hq_command
 * 
 *  Systems which access the state should 'extract' all of the relevant information from state 
 *  at the start of the function where possible e.g.
 *  
 *  function getGridCoordsExample() {
 *      const cellSize = state.grid.cellSize;
 *      ...
 *      const gx = Math.floor(obj.x / cellSize);
 *      ...
 *  }
 * 
 *  Services which mutate (modify) the state should be centralised in one location. 
 *  In the current implementation (0.4.0+), state mutation is handled by `hq_toc.js` (delegated by `hq_command.js`).
 *  If the core state management happens in one place, this makes it much easier to reason about, modify, and debug.
 */


/**
	fbGroup: FISHBOT v3 CUSTOM GROUPING SYSTEM

	Fishbot custom implementation of inbuilt "groups"
	Fishbot requires transient, one-to-many labelling to support its ability to maneuver & control multiple groups of units simultaneously.
    Construction and aviation use this capability extensively.
	As of Warzone 2100 v4.6.1, neither the built-in groups, nor labels, are suitable for transient, one-to-many labelling.
*/
class fbGroup {

	constructor() {
		this.groups = new Map();
		this.MAX_GROUP_SIZE = 256;
	}

	#lazyUpdateGroup(groupID) {
		// Lazy update, only updates if one of the functions is called & only for that group ID
		if (this.groups.has(groupID)) {
			const c = this.groups.get(groupID);

            const updatedGroupMemberIDs = [];
            const updatedGroupMembers = [];
            c["groupMemberIDs"].forEach(droidID => {
                const obj = getObject(DROID, me, droidID);
                if (obj == null) {
                    return;
                }
                updatedGroupMemberIDs.push(droidID);
                updatedGroupMembers.push(obj);
            });

            c["groupMemberIDs"] = updatedGroupMemberIDs;
            c["groupMembers"] = updatedGroupMembers;
			c["groupSize"] = updatedGroupMembers.length;
		}
	}

	createGroup(groupID) {
		this.groups.set(groupID, {'groupMemberIDs': [], 'groupMembers': [], "groupSize": 0});
	}

	deleteGroup(groupID) {
		if (this.groups.has(groupID)) {
			this.groups.delete(groupID);
        }
	}

    /**
     * Returns an array containing all units in the FishBot group with `groupID`.
     * @param {string | number} groupID 
     * @returns {DroidObject[]}
     */
	enumGroup(groupID) {
		if (!this.groups.has(groupID)) {
			debug(`no such groupID: "${groupID}"`);
			return [];
		}

		this.#lazyUpdateGroup(groupID);

		return this.groups.get(groupID)["groupMembers"];
	}
	
	groupSize(groupID) {
		if (!this.groups.has(groupID)) {
            return undefined;
        }
			
		this.#lazyUpdateGroup(groupID);

		return this.groups.get(groupID)["groupSize"];
	}

	addDroidToGroup({groupID, droidID}) {
		if (!this.groups.has(groupID)) {
			this.createGroup(groupID);
		}

		this.#lazyUpdateGroup(groupID);

		const currGroup = this.groups.get(groupID);	
		if (currGroup["groupSize"] >= this.MAX_GROUP_SIZE) {
			debug(`addDroidToGroup failed: Cannot add more than ${this.MAX_GROUP_SIZE} members to the group.`);
			return;
		}
		
		currGroup["groupMemberIDs"].push(droidID);
	}

	removeDroidFromGroup({groupID, droidID}) {
		if (!this.groups.has(groupID)) {
			return;
		}

		this.#lazyUpdateGroup(groupID);

        const groupMemberIDs = this.groups.get(groupID)["groupMemberIDs"];
        for (let i=0; i<groupMemberIDs.length; i++) {
            if (groupMemberIDs[i] !== droidID) {
                continue;
            }    
            groupMemberIDs.splice(i, 1);
            return;
        }
	}
}

/**
 * To comprehend the game world, FishBot divides up the game world into grid cells.
 * The grid cell system helps FishBot to be spatially aware and thus make more intelligent decisions.
 */
class fbGrid {

    /**
     * Constructor for `fbGrid`. Both `numXCells` and `numYCells` are optional arguments; they both have to specified if you want a custom grid size.
     * @param {number?} numXCells 
     * @param {number?} numYCells 
     */
    constructor(numXCells=null, numYCells=null) {
        this.cellSize = 10;     // in game tiles

        if (numXCells == null || numYCells == null) {    
            this.numXCells = Math.ceil(mapWidth / this.cellSize);
            this.numYCells = Math.ceil(mapHeight / this.cellSize);
        } else {
            this.numXCells = numXCells;
            this.numYCells = numYCells;
        }

        const createStandardFbGridCell = (gx, gy) => this.createNewFbGridCell(gx, gy);
        /** @type {FbGridCell[][]} */
        this.grid = create2DGrid(this.numXCells, this.numYCells, createStandardFbGridCell);        
    }

    /**
     * Default factory function to create a new `fbGrid` grid cell.
     * @param {number} gx 
     * @param {number} gy 
     * @returns {FbGridCell}
     */
    createNewFbGridCell(gx, gy) {
        /** @type {FbGridCell} */
        return {
            'id': `${gx}_${gy}`,    
            'gx': gx,
            'gy': gy,    
            'targetUnits': [],
            'targetStructures': [],
            'friendlyUnits': [],
            'friendlyStructures': [],
            'derricks': [],
            'bases': []
        }
    }

    /**
     * More computationally efficient `grid.enumRange`. Compared to the standard `enumRange`, the tradeoff is to sacrifice positional accuracy for speed. 
     * The calling function must handle potentially stale outputs, particularly if the grid is not updated that often.
     * @param {number} x central x-coord (game tiles)
     * @param {number} y central y-coord (game tiles)
     * @param {number} radius radial distance, inclusive (game tiles)
     * @param {boolean} showEnemy if `true`, populates `targetUnits` and `targetStructures`.
     * @param {boolean} showFriendly if `true`, populates `friendlyUnits` and `friendlyStructures`.
     * @returns {EnumRangeLazyResult}
     */
    enumRangeLazy(x, y, radius, showEnemy=true, showFriendly=true) {
        /** @type {EnumRangeLazyResult} */
        const result = {
            'targetUnits': [],
            'targetStructures': [],
            'friendlyUnits': [],
            'friendlyStructures': [],
        };

        if (!defined(this.grid)) {
            debug(`WARNING: grid.enumRange() could not read from undefined grid.`);
            return result;
        }

        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const gr = Math.ceil(radius / this.cellSize);
        
        const RADIUS_SQ = radius ** 2;

        /** @param {FbObject} obj */
        const insideSpecifiedRadius = (obj) => {
            const DISTANCE_SQ = distSq(x, obj.x, y, obj.y);
            if (DISTANCE_SQ <= RADIUS_SQ) {
                return true;
            } else {
                return false;
            }
        };

        /**
         * 
         * @param {string} className 
         * @param {number} gx 
         * @param {number} gy 
         * @returns {void} pushes the result to the result array
         */
        const pushObjectsInRadiusToResult = (className, gx, gy) => {
            const objectsInCell = this.grid[gx][gy][className];
            objectsInCell.forEach(obj => {
                if (insideSpecifiedRadius(obj)) {
                   result[className].push(obj);
                }    
            });            
        }

        const ENEMY_OBJECT_CLASSES = ['targetUnits', 'targetStructures'];
        const FRIENDLY_OBJECT_CLASSES = ['friendlyUnits', 'friendlyStructures'];

        for (let dx = -gr; dx <= gr; dx++) {
            for (let dy = -gr; dy <= gr; dy++) {

                const gx = cx + dx;
                if (gx < 0 || gx >= this.numXCells) {   // valid check is '>= this.numXCells' because of 0 indexing: [0, 1, ..., numXCells - 1] are valid
                    continue;
                }
                
                const gy = cy + dy;
                if (gy < 0 || gy >= this.numYCells) {       
                    continue;
                }

                if (showEnemy) {
                    ENEMY_OBJECT_CLASSES.forEach(className => pushObjectsInRadiusToResult(className, gx, gy));
                }
                if (showFriendly) {
                    FRIENDLY_OBJECT_CLASSES.forEach(className => pushObjectsInRadiusToResult(className, gx, gy));
                }
                
            }                
        }

        return result;
    }
}


/**
 *  `worldState`: this class stores the game state from FishBot's perspective.
 *   All functions in FishBot use this class as the current ground truth.
 */
class worldState {
    constructor() {

        ////////////////////////// SPATIAL AWARENESS //////////////////////////
        /**
         *  The "grid" is the core component of FishBot's spatial awareness system. 
         *  @type {fbGrid} 
         */
        this.grid = new fbGrid();

        /**
         *  Spatial fields, derived from the dimensions of the grid, are used for decision making.
         *  @type {SpatialFieldsObject} 
         */
        this.fields;

        /**
         *  This object stores data about fixed points of interest on the game map.
         */
        this.poi = {
            /** @type {DerrickObject[]} */
            'derricks': [], 
            /** @type {PlayerHomeBaseObject[]} */
            'bases': []
        };

        ////////////////////////// PLAYER STATISTICS / CUSTOM METADATA //////////////////////////
        /** 
         * The numeric array index is the same as the player ID, so `state.playerInfo[me].numTrucks` is a possible & accepted access pattern.
         * @type {PlayerStatsObject[]} 
         */
        this.playerInfo;

        // Game statistics
        this.REPAIR_FACILITY_HARD_CAP = 3; // getStructureLimit(STRUCTURES["Repair Facility"].id);      // TODO: Fix this when this function is fixed.

        // Combat targeting
        /** @type {BrigadeInfo} */
        this.brigades = {};

        this.aviationTargets = {
            /** @type {AirStrikeMissionRequest[]} */
            'raidTargets': [],

            // 4 types of targets around enemy bases
            /** @type {AirStrikeMissionRequest[]} */
            'productionTargets': [],
            /** @type {AirStrikeMissionRequest[]} */
            'adaTargets': [],
            /** @type {AirStrikeMissionRequest[]} */
            'indirectFireTargets': [],
            /** @type {AirStrikeMissionRequest[]} */
            'defensiveStructureTargets': []
        }; 

        // Mission management system
        /** @type {fbGroup} */
        this.g;
        this.activeMissions = [];
        /** @type {ProductionJob[]} */
        this.activeProductionJobs = [];

        // Bot attributes
        this.botIsActive = true;
        this.oilDominance = false;

        // Load balancing parameters
        this.currWorkerID = -1;
        this.TIME_BLOCK_MS = 200;
        this.INTERVALS_PER_MIN = Math.floor(60000 / this.TIME_BLOCK_MS);
		this.WORKER_IDS = {};
    }

    /**
     * Returns an array containing the playerIDs of alive players.
     */
    enumLivingPlayers() {   
        let livingPlayerIDs = [];

        this.playerInfo.forEach(p => {
            if (p["numTotalUnits"] !== 0 || p["numFactories"] !== 0) {
                livingPlayerIDs.push(p.playerID);
            }
        });

        return livingPlayerIDs;
    }

    /**
     * Returns `true` if the game has ended for this player, or for all enemy players.
     * Otherwise, it will return `false`.
     * @returns {boolean}
     */
    gameHasEnded() {
        const playerIDs = this.enumLivingPlayers();

        let foundEnemy = false, foundMyself = false;

        playerIDs.forEach(pid => {
            if (isEnemy(pid) && !foundEnemy) {
                foundEnemy = true;
            } else if (pid === me) {
                foundMyself = true;
            }
        });

        if (!foundEnemy || !foundMyself) {
            return true;
        } else {
            return false;
        }
    }

}


class worldStateBuilder {

    /**
     * Returns a new `fbGroup` with FishBot base group IDs initialised. 
     * @returns {fbGroup} 
     */
    #initialiseFbGroupingSystem() {
        let g = new fbGroup();

        for (const d in DIVISION) {
            g.createGroup(DIVISION[d]);
        }
        
        for (const e in ENGINEERING) {
            g.createGroup(ENGINEERING[e]);
        }

        return g;
    }

    /**
     * Factory function to initialise `state.fields`. Note that `state.grid` must be initialised before this.
     * @param {worldState} state 
     * @returns {SpatialFieldsObject}
     */
    #initialiseSpatialFields(state) {
        const numXCells = state.grid.numXCells;
        const numYCells = state.grid.numYCells;

        const createZeroCell = () => {return 0;};
        const createGridWithZeros = () => {return create2DGrid(numXCells, numYCells, createZeroCell);};

        return {
            'adaThreat': createGridWithZeros(),
            'enemyStaticDefenceThreat': createGridWithZeros(),
            'enemyUnitThreat': createGridWithZeros(),
            'distanceFromMyBase': createGridWithZeros(),
            'totalDerricksInCell': createGridWithZeros(),
            'unclaimedDerricksInCell': createGridWithZeros(),
            'controlStability': createGridWithZeros(),
        };
    }

    /**
     * Factory function to create a 'DerrickObject'.
     * @param {number} x 
     * @param {number} y 
     * @param {number} gx 
     * @param {number} gy 
     * @returns {DerrickObject}
     */
    #createNewDerrick(x, y, gx, gy) {
        return {
            'id': `DERRICK_${x}_${y}`,
            'x': x,
            'y': y,
            'gx': gx,
            'gy': gy,
            
            'isClaimed': false,
            'playerID': undefined,
        };
    }

    /**
     * Factory function used to initialise `state.poi.derricks`. 
     * Returns derricks in ascending order of distance from base.
     * @param {worldState} state 
     * @returns {DerrickObject[]}
     */
    #initialiseDerrickLocs(state) {
        const cellSize = state.grid.cellSize;

        const d = [];

        for (let i=0; i<derrickPositions.length; i++) {
            const x = derrickPositions[i].x;
            const y = derrickPositions[i].y;

            const gx = Math.floor(x / cellSize);
            const gy = Math.floor(y / cellSize);

            const derrick = this.#createNewDerrick(x, y, gx, gy);
            d.push(derrick);
        }

        // Order d in order of increasing order from base 
        d.sort((a,b) => distSq(a.x, baseLocation.x, a.y, baseLocation.y) - distSq(b.x, baseLocation.x, b.y, baseLocation.y));

        return d;
    }

    /**
     * Factory function to create a `PlayerHomeBaseObject`.
     * @param {number} playerID 
     * @param {number} x 
     * @param {number} y 
     * @param {number} gx 
     * @param {number} gy 
     * @returns {PlayerHomeBaseObject}
     */
    #createNewBase(playerID, x, y, gx, gy) {
        return {
            'id': `BASE_${playerID}_${x}_${y}`,    
            'x': x,
            'y': y,
            'gx': gx,
            'gy': gy,

            'isEnemy': isEnemy(playerID),
            'playerID': playerID,
        };
    }

    /**
     * Factory function used to initialise `state.poi.bases`. 
     * @param {worldState} state 
     * @returns {PlayerHomeBaseObject[]}
     */
    #initialiseBaseLocs(state) {
        const cellSize = state.grid.cellSize;

        const b = [];

        if (startPositions.length !== maxPlayers) {
            debug(`WARNING: ${startPositions.length} !== ${maxPlayers}! Weird behaviour may result: e.g. playerInfo might be unsynced with base locations.`);
        }

        for (let i=0; i<startPositions.length; i++) {
            const x = startPositions[i].x;
            const y = startPositions[i].y;

            const gx = Math.floor(x / cellSize);
            const gy = Math.floor(y / cellSize);

            const base = this.#createNewBase(i, x, y, gx, gy);
            b.push(base);
        }
        return b;
    }

    /**
     * Factory function used to initialise `state.playerInfo`.
     * @param {worldState} state 
     * @returns {PlayerStatsObject[]}
     */
    #initialisePlayerInfo(state) {
        const p = [];

        const PLAYER_ID_LIST = generateRange(maxPlayers);       // will create 0-indexed playerIDs from 0, 1, 2, ..., maxPlayers - 1
        PLAYER_ID_LIST.forEach(playerID => 
            p.push(createPlayerInfoEntry(playerID))
        );
        
        return p;
    }

    /**
     * TODO: Add jsdocs & add consolidate all other useful map-data related definitions here
     */
    #initialiseMapTiles() {

        const yMap = generateRange(mapHeight);
        const xMap = generateRange(mapWidth);

        yMap.forEach(y => {
            const mapRow = [];

            xMap.forEach(x => {
                // mapRow.push(MapTiles[y][x].height);      // uncomment for height
                mapRow.push(MapTiles[y][x].terrainType);    // uncomment for different terrain type; see: https://github.com/Warzone2100/warzone2100/blob/00ca862eb87e8d22462ee97b4d2b8ab9ee30a451/lib/wzmaplib/include/wzmaplib/terrain_type.h#L26 for terrainType enum
            });

            debug(`"${mapRow}",`);      // python script processes list of comma-delimited strings
        });

    }

    /**
     * Factory function to create buffers for `state.brigades`.
     * @param {worldState} state
     * @returns {BrigadeInfo} 
     */
    #initialiseBrigades(state) {

        /** @returns {FbObject[]} */
        const createTargetObjectArray = () => [];

        /** @returns {NearbyTargets} */
        const createNearbyTargetsArray = () => {
            return {
                'enemyArmor': createTargetObjectArray(),
                'enemyInfantry': createTargetObjectArray(), 
                'enemyIndirectFire': createTargetObjectArray(), 
                'enemyADA': createTargetObjectArray(), 
                'enemyDefenses': createTargetObjectArray(),
                'enemyConstructor': createTargetObjectArray(), 
                'enemyIndustrial': createTargetObjectArray(), 
                'enemyUtility': createTargetObjectArray(), 
                'enemyAviation': createTargetObjectArray(), 
            };
        };

        /** @returns {AirStrikeMissionRequest[]} */
        const createCASStrikeRequests = () => [];

        /** @returns {BattalionComposition} */
        const createBattalionComposition = (category) => {return {
            'category': category, 
            'healthyUnitList': [], 
            'damagedUnitList': [], 
            'count': 0,
            'deficit': 0
        };};
        const CATEGORIES = [DIVISION.INFANTRY_RESERVE, DIVISION.HEAVY_CAV_RESERVE, DIVISION.LIGHT_CAV_RESERVE, DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, DIVISION.AIR_DEFENCE_RESERVE, DIVISION.SENSOR_RESERVE, DIVISION.MAINTENANCE_RESERVE];

        /** @returns {BrigadeComposition} */
        const createBrigadeComposition = () => {
            /** @type {{[category: number]: BattalionComposition}} */
            const brigadeComposition = {};
            CATEGORIES.forEach(category => {
                brigadeComposition[category] = createBattalionComposition(category);
            });
            return brigadeComposition;
        }

        /**
         * Creates an empty brigade object.
         * @param {number} brigadeID 
         * @returns {BrigadeMetadata} 
         */
        const createNewBrigadeObject = (brigadeID) => {
            const x = baseLocation.x, y = baseLocation.y, z = MapTiles[y][x].height;
            return {
                'id': brigadeID,
                'location': {'x': x, 'y': y, 'z': z},
                'nearbyTargets': createNearbyTargetsArray(),
                'casStrikeRequests': createCASStrikeRequests(),
                'strength': 0,
                'composition': createBrigadeComposition()
            };
        };

        /** @type {BrigadeInfo} */
        const brigades = {};

        BRIGADE_IDS.forEach(id => {
            brigades[id] = createNewBrigadeObject(id);
        });

        return brigades;
    }

    /**
     *  Initialises `state` with:
     *  - FishBot grouping system `state.g`, 
     *  - default POIs (bases & derricks) `state.poi.derricks` & `state.poi.bases`,
     *  - default player information,
     *  - 
     * @param {worldState} state 
     * @returns {void}
     */
    initialise(state) {
        // this.#initialiseMapTiles();

        state.g = this.#initialiseFbGroupingSystem();

        state.fields = this.#initialiseSpatialFields(state);

        state.poi.derricks = this.#initialiseDerrickLocs(state);   
        state.poi.derricks.forEach(d => {
            // Write the same reference to the grid.
            state.grid.grid[d.gx][d.gy].derricks.push(d);
            state.fields['totalDerricksInCell'][d.gx][d.gy]++;
        }); 

        state.poi.bases = this.#initialiseBaseLocs(state); 
        state.poi.bases.forEach(b => {
            // Write the same reference to the grid.
            state.grid.grid[b.gx][b.gy].bases.push(b);
        });         

        state.playerInfo = this.#initialisePlayerInfo(state);

        state.brigades = this.#initialiseBrigades(state);

    }
}
