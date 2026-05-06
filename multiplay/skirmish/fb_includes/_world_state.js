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
		this.groupTemplate = {'groupMemberIDs': [], 'groupMembers': [], "groupSize": 0};
		this.groups = new Map();
		this.MAX_GROUP_SIZE = 256;
	}

	#lazyUpdateGroup(groupID) {
		// Lazy update, only updates if one of the functions is called & only for that group ID
		if (this.groups.has(groupID)) {
			// Update members
			let c = this.groups.get(groupID);

			// debug("lazyUpdateGroup/groupMember data -- before filter", c["groupMemberIDs"], c["groupMembers"]);

			c["groupMemberIDs"] = c["groupMemberIDs"].filter((id) => getObject(DROID, me, id) !== null);

			// debug("lazyUpdateGroup/groupMember data -- after filter", c["groupMemberIDs"], c["groupMembers"]);

			c["groupMembers"] = c["groupMemberIDs"].map((id) => {return getObject(DROID, me, id);});

			// debug("lazyUpdateGroup/groupMember data -- after getObject map", c["groupMemberIDs"], c["groupMembers"]);

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

        if (numXCells == undefined || numYCells == undefined) {    
            this.numXCells = Math.ceil(mapWidth / this.cellSize);
            this.numYCells = Math.ceil(mapHeight / this.cellSize);
        } else {
            this.numXCells = numXCells;
            this.numYCells = numYCells;
        }

        const createStandardGridCell = (gx, gy) => this.createNewFbGridCell(gx, gy);
        this.grid = create2DGrid(this.numXCells, this.numYCells, createStandardGridCell);        
    }

    createNewFbGridCell(gx, gy) {
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
     * Custom enumRange for FishBot; this uses FishBot's grid system. 
     * The intent is to optimise for speed.
     * @param {number} x central x-coord (game tiles)
     * @param {number} y central y-coord (game tiles)
     * @param {number} radius radial distance, inclusive (game tiles)
     * @returns Object containing droids[], structs[], closestDroid: DroidObject and closestStruct: StructureObject
     */
    enumRange(x, y, radius) {
        let results = {
            'targetUnits': [],
            'targetStructures': [],
            'closestTargetUnit': undefined,
            'closestTargetStructure': undefined,

            // 'friendlyUnits': [],
            'friendlyStructures': [],
        };

        if (!defined(this.grid)) {
            debug(`WARNING: grid.enumRange() could not read from undefined grid.`);
            return results;
        }

        // Initialise closest droid / struct calculation
        let closestDroidDistSq = 0, closestStructDistSq = 0;
        let closestDroid = undefined, closestStruct = undefined;

        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        const gr = Math.ceil(radius / this.cellSize);

        for (let dx = -gr; dx <= gr; dx++) {
            for (let dy = -gr; dy <= gr; dy++) {

                // Compute deviations & test validity
                const gx = cx + dx;
                if (gx < 0 || gx >= this.numXCells) {
                    continue;
                }
                
                const gy = cy + dy;
                if (gy < 0 || gy >= this.numYCells) {       // >= because of 0 indexing: [0, 1, ..., numYCells - 1]
                    continue;
                }

                // Get corresponding grid entry
                this.grid[gx][gy]['targetUnits'].forEach(t => {
                    const obj = getObject(t.type, t.player, t.id);
                    if (!defined(obj)) {
                        return;
                    }
                    const d = distSq(x, obj.x, y, obj.y);
                    if (d > radius ** 2) {
                        return;
                    }
                    results['targetUnits'].push(t);
                    
                    if (!(t.flags & OBJ_FLAGS.AVIATION)) {
                        if (!defined(closestDroid)) {
                            closestDroid = obj;
                            closestDroidDistSq = d;
                            return;
                        }

                        if (d < closestDroidDistSq) {
                            closestDroid = obj;
                            closestDroidDistSq = d;
                        }
                    }
                });
                results['closestTargetUnit'] = closestDroid;
                
                this.grid[gx][gy]['targetStructures'].forEach(t => {
                    const obj = getObject(t.type, t.player, t.id);
                    if (!defined(obj)) {
                        return;
                    }
                    const d = distSq(x, obj.x, y, obj.y);
                    if (d > radius ** 2) {
                        return;
                    }
                    results['targetStructures'].push(t);

                    if (!defined(closestStruct)) {
                        closestStruct = obj;
                        closestStructDistSq = d;
                        return;
                    }

                    if (d < closestStructDistSq) {
                        closestStruct = obj;
                        closestStructDistSq = d;
                    }
                });
                results['closestTargetStructure'] = closestStruct;     
                
                this.grid[gx][gy]['friendlyStructures'].forEach(t => {
                    const obj = getObject(t.type, t.player, t.id);
                    if (!defined(obj)) {
                        return;
                    }
                    const d = distSq(x, obj.x, y, obj.y);
                    if (d > radius ** 2) {
                        return;
                    }
                    results['friendlyStructures'].push(t);
                });
            }                
        }

        return results;
    }
}


class worldState {
    // State: this class stores the game state from FishBot's perspective.
    // All functions in FishBot use this class as the current ground truth.
    constructor() {

        // Grid system (new)
        /** @type {fbGrid} */
        this.grid = new fbGrid();

        this.poi = {
            /** @type {DerrickObject[]} */
            'derricks': [], 
            /** @type {PlayerHomeBaseObject[]} */
            'bases': []
        };

        const createZeroCell = (...args) => {return 0;};
        const createGridWithZeros = () => {return create2DGrid(this.grid.numXCells, this.grid.numYCells, createZeroCell);};
        this.fields = {
            'adaThreat': createGridWithZeros(),
            'enemyStaticDefenceThreat': createGridWithZeros(),
            'enemyUnitThreat': createGridWithZeros(),
            'distanceFromMyBase': createGridWithZeros(),
            'totalDerricksInCell': createGridWithZeros(),
            'unclaimedDerricksInCell': createGridWithZeros(),
            'controlStability': createGridWithZeros(),
        };

        // Player statistics / custom metadata
        /** 
         * The numeric array index is the same as the player ID, so `state.playerInfo[me].numTrucks` is a possible & accepted access pattern.
         * @type {PlayerStatsObject[]} 
         */
        this.playerInfo = [];

        // Game statistics
        this.REPAIR_FACILITY_HARD_CAP = 3; // getStructureLimit(STRUCTURES["Repair Facility"].id);      // TODO: Fix this when this function is fixed.

        // Combat targeting
        this.allTargets = [];
        this.forceLocations = [];           // list of brigade locations: [{brigadeID: '', location: {'x': 0, 'y': 0}}]
        this.nearbyGroundTargets = [];      // nearbyTargets (list); ordered by brigade designation
        this.aviationTargets = {
            'raidTargets': [],
            'casTargets': [],

            // 4 types of targets around enemy bases
            'productionTargets': [],
            'adaTargets': [],
            'indirectFireTargets': [],
            'defensiveStructureTargets': []
        }; 

        /**
         * Buffers to store brigade combat team information (is constantly updated).
         * @type {Object.<BrigadeIDType, BrigadeInfo>} 
         */
        this.brigades = {};

        // Mission management system
        /** @type {fbGroup} */
        this.g;
        this.activeMissions = [];

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
        }
    }

    /**
     * Factory function used to initialise `state.poi.bases`. 
     * @param {worldState} state 
     * @returns {PlayerHomeBaseObject[]}
     */
    #initialiseBaseLocs(state) {
        const cellSize = state.grid.cellSize;

        const b = [];

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
     * @returns 
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
                mapRow.push(MapTiles[y][x].height);      // height
                // mapRow.push(MapTiles[y][x].terrainType);    // different terrain type
            });

            debug(`"${mapRow}",`);      // python script processes list of comma-delimited strings
        });

        const isReachable = precalculateWheeledReachableTiles();
        const constructionSearchPattern = precalculateConstructionSearchPattern();
    }

    /**
     * Factory function to create buffers for `state.brigades`.
     * @returns {Object.<BrigadeIDType, BrigadeInfo>} 
     */
    #initialiseBrigades() {
        const BRIGADE_DESIGNATIONS = [DIVISION.FIRST_BCT, DIVISION.SECOND_BCT, DIVISION.THIRD_BCT, DIVISION.FOURTH_BCT, DIVISION.FIFTH_BCT];

        // This is performance critical (hundreds (up to 1000 objects), updated every second or so).
        // As such, preallocated arrays are now used (instead of a standard Array) for minimal internal memory overhead and no garbage collector.
        // For ~7 numeric arrays & manual array of strings, memory demand (theoretical) is approximately ~40kB *per brigade*.
        
        const PREALLOCATED_SLOTS = 1024;        // 1kb per array if each slot is a byte (~4kb per array where each slot is a 32bit float / uint)

        /**
         * Creates a buffer to store targeting information.
         * @returns {TargetInfoSOA} 
         */
        const createNewTargetArray = () => {
            return {
                'name': new Array(PREALLOCATED_SLOTS),                  // For debug reasons: if memory becomes an issue, please consider removing (32 characters ~32kb memory) -> comparable memory needed to store the rest of the parameters)
                'type': new Uint32Array(PREALLOCATED_SLOTS),            // line ~66 of `warzone2100/src/basedef.h`; OBJECT_TYPE enum, assume it defaults to int
                'player': new Uint8Array(PREALLOCATED_SLOTS),           // line ~70 of `warzone2100/src/basedef.h`
                'id': new Uint32Array(PREALLOCATED_SLOTS),              // line ~67 of `warzone2100/src/basedef.h`
                'flags': new Uint32Array(PREALLOCATED_SLOTS),           // 31 bits in the current implementation (~v0.4.0)
                'gx': new Uint32Array(PREALLOCATED_SLOTS),              // Unsigned integer (can be up to global `mapWidth` if `fbGrid.cellSize` is set to 1)
                'gy': new Uint32Array(PREALLOCATED_SLOTS),              // Unsigned integer (can be up to global `mapHeight` if `fbGrid.cellSize` is set to 1)
                'priority': new Uint8Array(PREALLOCATED_SLOTS)          // 1 byte
            };            
        };

        /**
         * Creates an empty brigade object.
         * @param {number} brigadeID 
         * @returns {BrigadeInfo} 
         */
        const createNewBrigadeObject = (brigadeID) => {
            const x = baseLocation.x, y = baseLocation.y;
            return {
                'id': brigadeID,
                'position': {'x': x, 'y': y, 'z': MapTiles[y][x].height},
                'nearbyTargets': createNewTargetArray()
            };
        };

        const brigades = {};

        BRIGADE_DESIGNATIONS.forEach(id => {
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

        state.poi.derricks = this.#initialiseDerrickLocs(state);   
        state.poi.derricks.forEach(d => {
            state.grid.grid[d.gx][d.gy].derricks.push(d);
            state.fields['totalDerricksInCell'][d.gx][d.gy]++;
        }); 

        state.poi.bases = this.#initialiseBaseLocs(state); 
        state.poi.bases.forEach(b => {
            state.grid.grid[b.gx][b.gy].bases.push(b);
        });         

        state.playerInfo = this.#initialisePlayerInfo(state);

        state.brigades = this.#initialiseBrigades();
    }
}
