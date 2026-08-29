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
 * This is the central database which stores the game state. 
 *
 * In this software, there is one shared game 'state'. There are multiple parts of the bot which either need to: 
 * (1) look at the game state & make decisions     (but don't modify the game state), OR
 * (2) change the game state
 *  
 * We want to avoid chaos (obscure modifications of the state, impossible debugging, duplication of logic). To this end:
 * (1) All modifications to the state happen in `stateBuilder` (initialisation) and `hq_toc` (state update).
 * (2) The functions in `hq_command.ks` (almost exclusively) makes strategic decisions based on the game state. 
 * (3) All other functions can read the state but cannot modify it.
 */

/**
	fbGroup: FISHBOT v3 CUSTOM GROUPING SYSTEM

	FishBot uses a grouping system (sometimes containing only 2-3 units per group) to support its ability to multitask. 
    A unit generally only has 1 group at a time, but that group needs to change regularly.
    I tried using both the built-in 'groups' and 'labels' initially, but found them to be unsuitable for this purpose.

    For example, construction and combat use the grouping system to assign some units to go and perform a 'mission' (e.g. go build a derrick).
        On mission completion (or failure, or abortion), the mission manager returns the assigned units to a 'reserve', from where they can be assigned to another group.
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

    constructor() {
        this.cellSize = 10;     // in game tiles
        this.lastUpdatedAt = -1;    // gameTime of the last `updateCoreIntel()`; -1 until the first one runs
        
        this.numXCells = Math.ceil(mapWidth / this.cellSize);
        this.numYCells = Math.ceil(mapHeight / this.cellSize);

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
         * This stores all map-related data which is parsed once on game start.
         * Convention: every grid in this codebase is [x][y]-indexed unless explicitly noted otherwise.
         * The one exception is the engine's own `MapTiles`, which is [y][x].
         * @type {MapData}
         */
        this.mapData;

        /**
         *  This object stores data about fixed points of interest on the game map.
         */
        this.poi = {
            /** @type {DerrickObject[]} */
            'derricks': [], 
            /** @type {PlayerHomeBaseObject[]} */
            'bases': []
        };

        /**
         *  The "grid" is the core component of FishBot's spatial awareness system. 
         *  @type {fbGrid} 
         */
        this.grid = new fbGrid();

        /**
         *  Spatial fields are representations of information on the grid (e.g. locations of anti-air defences), and are used for decision making.
         *  @type {SpatialFieldsObject} 
         */
        this.fields;

        // Game statistics
        /** @type {Map<string, number>} */
        this.MAX_STRUCTURE_COUNT = new Map();

        /** @type {Map<string, number>} */
        this.MAX_DROID_COUNT = new Map();

        ////////////////////////// PLAYER STATISTICS / CUSTOM METADATA //////////////////////////
        /** 
         * The numeric array index is the same as the player ID, so `state.playerInfo[me].numTrucks` is a possible & accepted access pattern.
         * @type {PlayerStatsObject[]} 
         */
        this.playerInfo;

        ////////////////////////// FISHBOT METADATA (CONSIDER MOVING THIS TO HQ_COMMAND) //////////////////////////

        // Combat targeting
        /** @type {BrigadeInfo} */
        this.brigades = {};

        this.aviationTargets = {
            /** @type {AirStrikeMissionRequestLazy[]} */
            'raidTargets': [],

            // 4 types of targets around enemy bases
            /** @type {AirStrikeMissionRequestLazy[]} */
            'productionTargets': [],
            /** @type {AirStrikeMissionRequestLazy[]} */
            'adaTargets': [],
            /** @type {AirStrikeMissionRequestLazy[]} */
            'indirectFireTargets': [],
            /** @type {AirStrikeMissionRequestLazy[]} */
            'defensiveStructureTargets': []
        }; 

        // Mission management system
        /** @type {fbGroup} */
        this.g;

        this.activeMissions = [];

        /** @type {ProductionJob[]} */
        this.activeProductionJobs = [];

        // Oil-capture planning 
        /** @type {number} `gameTime` at the last oil-capture planning tick */
        this.oilCapPlannedAt = -1;   
        /** @type {Map<number | string, number>} Map from `sectorID` to the `gameTime` when a construction task was called off as dangerous */
        this.abortedOilSectors = new Map();         
        
        // Load balancing parameters
        this.botIsActive = true;
        this.TIME_BLOCK_MS = 200;
        this.BLOCKS_PER_MIN = Math.floor(60000 / this.TIME_BLOCK_MS);
		this.WORKER_IDS = {};
    }

    /**
     * Returns an array containing the playerIDs of alive players.
     * @returns {number[]}
     */
    enumLivingPlayers() {
        /** @param {PlayerStatsObject} p */
        const isLiving = (p) => p.numTotalUnits !== 0 || p.numFactories !== 0;
        
        return this.playerInfo.filter(isLiving).map(p => p.playerID);
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

    /**
     * Returns the maximum structure count.
     * @param {string} structureName 
     * @returns {number}
     */
    getMaxStructureCount(structureName) {
        const maxStructureCount = this.MAX_STRUCTURE_COUNT.get(structureName);
        if (maxStructureCount == null) {
            warn(`undefined "${structureName}" passed to state.getMaxStructureCount(). Returning 1.`);
            return 1;
        }
        return maxStructureCount;
    }

    getMaxUnitCount(droidCategory) {
        const maxDroidCount = this.MAX_DROID_COUNT.get(droidCategory);
        if (maxDroidCount == null) {
            warn(`undefined "${droidCategory}" passed to state.getMaxUnitCount(). Returning 10.`);
            return 10;
        }
        return maxDroidCount;
    }

}


class worldStateBuilder {

    /**
     * Returns a new `fbGroup` with default FishBot group IDs initialised. 
     * @returns {fbGroup} 
     */
    #initialiseFbGroupingSystem() {
        const g = new fbGroup();

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
            warn(`${startPositions.length} !== ${maxPlayers}! Weird behaviour may result: e.g. playerInfo might be unsynced with base locations.`);
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
     * This function initialises all map-related data. 
     * As `getWalkableTiles()` is computationally intense, it should only be called once on game start.
     * @returns {MapData}
     */
    #initialiseMapTiles() {
        /** @type {MapData} */
        const mapData = {};

        //////////////////////// VARIABLE DEFINITIONS ////////////////////////
        const HALF_MAP_WIDTH = Math.floor(mapWidth / 2);
        const HALF_MAP_HEIGHT = Math.floor(mapHeight / 2);

        // Define "walkable" & "reachable" tiles. Accounts for initial terrain features (both destroyable + non-destroyable are treated equally).
        //  - "Walkable" => can I place another object on that tile (be it a droid, structure or feature)? Useful for building.
        //  - "Reachable" => can I path to an adjacent tile? Useful for determining if a oil resource / location is reachable by a truck.

        /** @type {(boolean[])[]} */
        const isBaseNonWalkableTile = create2DGrid(mapWidth, mapHeight, () => {return false;});

        // Some features have a bounding box which is larger than 1. These are defined below in an ad-hoc fashion.
        // For example, for the *Snowy Tree2* feature, `features.json` gives a 'breadth' = 'width' = 1 (ref: https://github.com/Warzone2100/warzone2100/blob/d9863cf7d5ccea3125d3e95e3ed094f52d05b27c/data/base/stats/features.json#L663) 
        //   but in the actual game, *Snowy Tree2* seems to have a 2x2 collision box!
        // Note: "*Snowy Tree2*" (e.g. 2c-Roughness) that is centered at [85, 48] would have other tiles at [84, 48], [84, 47], [85, 47]. 
        //   This is consistent with how other 2x2 base structures are treated e.g. Power Generator / Research Facility.
        const FEATURE_NAMES_2X2 = [
            "*Wrecked Building 9*",
            "*Wrecked Building 17*",
            "*Snowy Tree2*", 
            "*LargeCoolingTower*", 
            "*NuclearPowerStation*", 
            "*OldFactory*", 
            "Powerlab", 
            "Laseropticslab", 
            "Rotaryweaponslab", 
            "Heavyweaponslab", 
            "Advancedmaterialslab", 
            "Aerodynamicslab",
            "Nanolab", 
            "Indirectweaponslab", 
        ]; 
        const FEATURE_NAMES_3X3 = [
            "*Building 1*", 
            "*Building 2*", 
            "*Building 3*", 
            "*Building 7*", 
            "*Building 8*", 
            "*Building 11*", 
            "*Wrecked Building 16*",
        ];
        const FEATURE_NAMES_2X1 = [     // horizontal 
            "*Building 10*",
            "*Building 12*",
            "Warehouse",
            "*Warehouse2*",
        ];
        const FEATURE_NAMES_1X2 = [     // vertical 
            "Wrecked Tanker",
            "*Warehouse3*",
        ];

        const OFFSET_2X2 = [[0, 0], [0, -1], [-1, 0], [-1, -1]];
        const OFFSET_3X3 = [[0, 0], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]];
        const OFFSET_2X1 = [[0, 0], [-1, 0]];       // horizontal
        const OFFSET_1X2 = [[0, 0], [0, -1]];       // vertical

        // Note: `enumFeature` includes oil derrick positions too so `isDerrickPosition` is not required yet.
        const allFeatures = enumFeature(ALL_PLAYERS);   
        
        const SHOW_FEATURES = false;        // enable this to see all features highlighted with red highlight

        const setBaseNonWalkableTiles = (x, y, offsets) => {
            offsets.forEach(o => {
                const ox = x + o[0];
                const oy = y + o[1];
                isBaseNonWalkableTile[ox][oy] = true;
                if (SHOW_FEATURES)  highlightTiles(ox, oy);              
            });
        }

        allFeatures.forEach(feature => {
            const x = feature.x, y = feature.y;
            const featureName = feature.name;

            if (SHOW_FEATURES)  debug(`${featureName} (id: ${feature.id}) (${x}, ${y})`);
            if (FEATURE_NAMES_2X2.includes(featureName)) {
                setBaseNonWalkableTiles(x, y, OFFSET_2X2);
            } else if (FEATURE_NAMES_3X3.includes(featureName)) {
                setBaseNonWalkableTiles(x, y, OFFSET_3X3);
            } else if (FEATURE_NAMES_2X1.includes(featureName)) {
                setBaseNonWalkableTiles(x, y, OFFSET_2X1);
            } else if (FEATURE_NAMES_1X2.includes(featureName)) {
                setBaseNonWalkableTiles(x, y, OFFSET_1X2);
            } else if (featureName === "Oil Resource") {
                // Explicitly showing that Oil Resources are treated as a 1x1 non-walkable feature.
                isBaseNonWalkableTile[feature.x][feature.y] = true;     
            } else {
                isBaseNonWalkableTile[feature.x][feature.y] = true;
                if (SHOW_FEATURES)  highlightTiles(feature.x, feature.y);     
            }
        });

        // Remove the very edges of the map since these are likely to be invalid tiles
        const xEdge = generateRange(mapWidth);
        const yEdge = generateRange(mapHeight);
        xEdge.forEach(x => {
            isBaseNonWalkableTile[x][0] = true;
            isBaseNonWalkableTile[x][mapHeight - 1] = true;
        });
        yEdge.forEach(y => {
            isBaseNonWalkableTile[0][y] = true;
            isBaseNonWalkableTile[mapWidth - 1][y] = true;
        });

        // Remove all water + cliffs
        for (let x=0; x<mapWidth; x++) {
            for (let y=0; y<mapHeight; y++) {
                const terrainType = MapTiles[y][x].terrainType;     
                // For the `terrainType` enum, see: https://github.com/Warzone2100/warzone2100/blob/00ca862eb87e8d22462ee97b4d2b8ab9ee30a451/lib/wzmaplib/include/wzmaplib/terrain_type.h#L26 
                if (terrainType === TER_CLIFFFACE || terrainType === TER_WATER) {
                    isBaseNonWalkableTile[x][y] = true;
                }
            }
        }

        const walkableTiles = getWalkableTiles(isBaseNonWalkableTile);

        /** @type {(boolean[])[]} */
        const isWalkable = create2DGrid(mapWidth, mapHeight, () => {return false;});

        /** @type {(boolean[])[]} */
        const isReachable = create2DGrid(mapWidth, mapHeight, () => {return false;});

        walkableTiles.forEach(b => {
            const x = b[0];
            const y = b[1];
            isWalkable[x][y] = true;
            isReachable[x][y] = true;
            // highlightTiles(x, y);        // Uncomment this to see all the walkable tiles on the map that the algorithm found
        });

        // Find chokepoint locations, assuming static terrain.

        /**
         * Computes, for each walkable tile, the number of consecutive walkable tiles counting
         * backward from (x,y) along direction (dx,dy) (inclusive of (x,y) itself).
         * @param {(boolean[])[]} isWalkable
         * @param {number} dx one of -1, 0, 1
         * @param {number} dy one of -1, 0, 1
         * @returns {(number[])[]}
         */
        const computeDirectionalClearance = (isWalkable, dx, dy) => {
            const clearance = create2DGrid(mapWidth, mapHeight, () => 0);

            let xStart = 0;
            let xStep = 1;
            if (dx < 0) {
                xStart = mapWidth - 1;
                xStep = -1;
            }

            let yStart = 0;
            let yStep = 1;
            if (dy < 0) {
                yStart = mapHeight - 1;
                yStep = -1;
            }

            for (let i=0; i<mapWidth; i++) {
                for (let j=0; j<mapHeight; j++) {
                    const x = xStart + i * xStep;
                    const y = yStart + j * yStep;

                    if (!isWalkable[x][y]) {
                        continue;   // clearance stays 0
                    }

                    const px = x - dx;
                    const py = y - dy;

                    if (px < 0 || px >= mapWidth || py < 0 || py >= mapHeight) {
                        clearance[x][y] = 1;
                        continue;
                    }

                    clearance[x][y] = clearance[px][py] + 1;
                }
            }

            return clearance;
        };

        const clearanceNorth = computeDirectionalClearance(isWalkable, 0, 1);
        const clearanceSouth = computeDirectionalClearance(isWalkable, 0, -1);
        const clearanceEast = computeDirectionalClearance(isWalkable, 1, 0);
        const clearanceWest = computeDirectionalClearance(isWalkable, -1, 0);

        const CHOKEPOINT_WIDTH_THRESHOLD = 4;

        /** @type {(number[])[]} */
        const chokepointWidth = create2DGrid(mapWidth, mapHeight, () => 0);

        /** @type {(boolean[])[]} */
        const isChokepoint = create2DGrid(mapWidth, mapHeight, () => false);

        for (let x=0; x<mapWidth; x++) {
            for (let y=0; y<mapHeight; y++) {
                if (!isWalkable[x][y]) {
                    continue;
                }

                const widthNS = clearanceNorth[x][y] + clearanceSouth[x][y] - 1;
                const widthEW = clearanceEast[x][y] + clearanceWest[x][y] - 1;
                const width = Math.min(widthNS, widthEW);

                chokepointWidth[x][y] = width;
                isChokepoint[x][y] = width <= CHOKEPOINT_WIDTH_THRESHOLD;
                // if (DEBUG_MODE_ON && isChokepoint[x][y])    highlightTiles(x, y);
            }
        }

        /** @type {(boolean[])[]} */
        const isDerrickPosition = create2DGrid(mapWidth, mapHeight, () => {return false;});
                
		const ADJACENT_TILE_OFFSETS = [[0, 1], [0, -1], [-1, 0], [1, 0]];

        derrickPositions.forEach(d => {
            isDerrickPosition[d.x][d.y] = true;
            
            // If one of the adjacent tiles are walkable, then the derrick should be classed as reachable (but not walkable, since a unit / structure cannot occupy an Oil Resource tile)
            if (ADJACENT_TILE_OFFSETS.some(o => isWalkable[d.x + o[0]][d.y + o[1]])) {      
                // markTile(d.x, d.y);    // Uncomment this to see the reachable oil derricks on the map
                isReachable[d.x][d.y] = true;
            }
        });

        /** @type {Coordinate[]} */
        const QUADRANT_SEARCH_PATTERN = [
            // Searches in a positive-x & positive-y direction 
            [0, 0], 
            [1, 0], [0, 1], 
            [1, 1], [2, 0], [0, 2],
            [1, 2], [2, 1], [3, 0], [0, 3],
            [2, 2], [1, 3], [3, 1], [4, 0], [0, 4],
            [3, 2], [2, 3], [1, 4], [4, 1], [5, 0], [0, 5]
        ];

        const heightMap = create2DGrid(mapWidth, mapHeight, (x, y) => MapTiles[y][x].height);       // The inbuilt `MapTiles` is referenced with [y][x]. This has been changed inside FishBot to use the conventional (x, y) referencing. 
      
        // Enable this block to print out a heightmap of your map in the console
        if (false) {
            for (let y=0; y<mapHeight; y++) {       
                let text = ``;
                for (let x=0; x<mapWidth; x++) {
                    text += `${heightMap[x][y]},`.padStart(5, " ");
                }
                debug(text);
            }
        }

        //////////////////////// WRITING VARIABLES ////////////////////////
        mapData['HALF_MAP_WIDTH'] = HALF_MAP_WIDTH;
        mapData['HALF_MAP_HEIGHT'] = HALF_MAP_HEIGHT;

        mapData['walkableTiles'] = walkableTiles;
        mapData['isWalkable'] = isWalkable;
        mapData['isReachable'] = isReachable;

        mapData['isDerrickPosition'] = isDerrickPosition;

        mapData['QUADRANT_SEARCH_PATTERN'] = QUADRANT_SEARCH_PATTERN;
        mapData['heightMap'] = heightMap;

        mapData['chokepointWidth'] = chokepointWidth;
        mapData['isChokepoint'] = isChokepoint;

        return mapData;

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
            /** @type {Map<number, BattalionComposition>} */
            const brigadeComposition = new Map();
            CATEGORIES.forEach(category => brigadeComposition.set(category, createBattalionComposition(category)));
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

        // Create the reserve brigade
        brigades[DIVISION.BCT_RESERVE] = createNewBrigadeObject(DIVISION.BCT_RESERVE);

        return brigades;
    }

    /**
     * Queries the game engine for the maximum allowable count of all base structures.
     *   Returns a Map from the *human-readable* structure name (which is the same way you would access `BASE_STRUCTURES`) to a number (the maximum allowable count for that structure).
     * Note: As of Warzone 2100 v4.7.0, `getStructureLimit` will only return the *default* structure limit if it is called too early. 
     *   To return the correct limits, `getStructureLimit` should be called during `eventStartLevel()`, or afterward. 
     * @returns {Map<string, number>} 
     */
    #initialiseMaxStructureCounts() {
        const MODULE_NAMES = ["Factory Module", "Power Module", "Research Module"];
        const MODULES_PER_FACTORY = 2;

        const maxStructureCounts = new Map();
        
        const NEGATIVE_ONE = 0xFFFFFFFF;        // `getStructureLimit` returns this for some structures. They have been omitted below, so there is no need to handle it (yet).

        for (const [name, structureData] of Object.entries(BASE_STRUCTURES)) {      
            if (MODULE_NAMES.includes(name)) {
                continue;   
            }
            if (["Oil Derrick"].includes(name)) {
                maxStructureCounts.set(name, 256);      // some large value
                continue;
            }
            const limit = getStructureLimit(structureData.id, me);

            maxStructureCounts.set(name, limit);      
        }

        const MAX_FACTORY_MODULES = (maxStructureCounts.get("Factory") + maxStructureCounts.get("VTOL Factory")) * MODULES_PER_FACTORY;
        maxStructureCounts.set("Factory Module", MAX_FACTORY_MODULES);
        maxStructureCounts.set("Power Module", maxStructureCounts.get("Power Generator"));
        maxStructureCounts.set("Research Module", maxStructureCounts.get("Research Facility"));

        // for (const [name, limit] of maxStructureCounts)     debug(`\t${name}: ${limit}`);

        return maxStructureCounts;
    }

    /**
     * Queries the game engine for the maximum unit counts of each `droidType`.
     * @returns {Map<string, number>}
     */
    #initialiseMaxDroidCounts() {
        const droidLimits = new Map();
        droidLimits.set("DROID_CONSTRUCT", getDroidLimit(me, DROID_CONSTRUCT));
        droidLimits.set("DROID_WEAPON", getDroidLimit(me, DROID_WEAPON));
        droidLimits.set("DROID_REPAIR", getDroidLimit(me, DROID_REPAIR));
        droidLimits.set("DROID_SENSOR", getDroidLimit(me, DROID_SENSOR));
        droidLimits.set("DROID_CYBORG", getDroidLimit(me, DROID_CYBORG));
        droidLimits.set("DROID_COMMAND", getDroidLimit(me, DROID_COMMAND));

        return droidLimits;
    }   

    /**
     * Initialises `state` with default parameters.
     * @param {worldState} state 
     * @returns {void}
     */
    initialise(state) {
        state.mapData = this.#initialiseMapTiles();

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

        state.MAX_STRUCTURE_COUNT = this.#initialiseMaxStructureCounts(); 
        state.MAX_DROID_COUNT = this.#initialiseMaxDroidCounts();
    }
}
