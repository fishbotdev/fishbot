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

class fbGrid {
    constructor() {
        this.cellSize = 10;     // in game tiles
        this.numXCells = Math.ceil(mapWidth / this.cellSize);
        this.numYCells = Math.ceil(mapHeight / this.cellSize);

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
        this.grid = new fbGrid();
        this.poi = {
            'derricks': [], 
            'bases': []
        };
        const emptyCell = (...args) => {return 0;};
        const createEmptyGrid = () => {return create2DGrid(this.grid.numXCells, this.grid.numYCells, emptyCell);};
        this.fields = {
            'adaThreat': createEmptyGrid(),
            'enemyStaticDefenceThreat': createEmptyGrid(),
            'enemyUnitThreat': createEmptyGrid(),
            'distanceFromMyBase': createEmptyGrid(),
            'totalDerricksInCell': createEmptyGrid(),
            'unclaimedDerricksInCell': createEmptyGrid(),
            'controlStability': createEmptyGrid(),
        };

        // Player statistics
        this.playerInfo = [];

        // Combat targeting
        this.allTargets = [];
        this.forceLocations = [];           // forceLocations {'x', 'y'}; ordered by brigade designation
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

        // Mission management system
        this.g = undefined;
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

    createPlayerInfoEntry(playerID) {
        return {
			'playerID': playerID,
			'isFriendly': !isEnemy(playerID), 

            // Unit stats
            'numTotalUnits': 0,
			'numInfantryUnits': 0,
			'numArmourUnits': 0,
            'numAirUnits': 0,       // air units (e.g. vtol)        

            'numRocketUnits': 0,        // anti-personnel units (e.g. MG)
            'numCannonUnits': 0,        // general-purpose (e.g. cannon)
            'numMGUnits': 0,
            'numShortRangeIndirectUnits': 0,  // indirect fires (e.g. mortar)
            'numLongRangeIndirectUnits': 0,
            'numVTOLBombUnits': 0,
            'numADAUnits': 0,       // air-defence-artillery units (e.g. flak cannon)
            'numLaserUnits': 0,
            'numFlamerUnits': 0,

            'numTrucks': 0,

            // Structure stats
			'numStructs': 0,
            'numFactories': 0,
			'numDerricks': 0, 
            'numConstructedHQs': 0,

            // Intended to be used for getting idle structures for Production & Research reasons
            'normalFactoryFbObjects': [],           
            'cyborgFactoryFbObjects': [],
            'vtolFactoryFbObjects': [],
            'researchFacilityFbObjects': [],
            
		};
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

    #createFbGroupingSystem() {
        // Generates initial values in FishBot v3 grouping system
        let g = new fbGroup();

        g.createGroup(DIVISION.AIR_RESERVE);

        for (const d in DIVISION) {
            g.createGroup(DIVISION[d]);
        }
        
        for (const e in ENGINEERING) {
            g.createGroup(ENGINEERING[e]);
        }

        return g;
    }

    /**
     * Factory function for a 'derrick' object.
     * @param {number} x 
     * @param {number} y 
     * @param {number} gx 
     * @param {number} gy 
     * @returns 
     */
    #createNewDerrick(x, y, gx, gy) {
        // Helper: derrickTemplate factory (new implementation to support new sector system)
        return {
            'id': `DERRICK_${x}_${y}`,
            'x': x,
            'y': y,
            'gx': gx,
            'gy': gy,
            
            'isClaimed': false,
            'playerID': undefined,
        }
    }

    /**
     * Used to initialise `state.poi.derricks` & also writes a reference to `state.grid.grid` directly.
     * @param {worldState} state 
     */
    #initialiseDerrickLocs(state) {
        const cellSize = state.grid.cellSize;

        let d = [];

        for (let i=0; i<derrickPositions.length; i++) {
            const x = derrickPositions[i].x;
            const y = derrickPositions[i].y;

            const gx = Math.floor(x / cellSize);
            const gy = Math.floor(y / cellSize);

            const derrick = this.#createNewDerrick(x, y, gx, gy);
            d.push(derrick);
            state.grid.grid[gx][gy].derricks.push(derrick);
            state.fields['totalDerricksInCell'][gx][gy]++;
        }

        // Order d in order of increasing order from base 
        d.sort((a,b) => distSq(a.x, baseLocation.x, a.y, baseLocation.y) - distSq(b.x, baseLocation.x, b.y, baseLocation.y));

        return d;
    }

    /**
     * Factory function for a 'base' object.
     * @param {number} playerID 
     * @param {number} x 
     * @param {number} y 
     * @param {number} gx 
     * @param {number} gy 
     * @returns 
     */
    #createNewBase(playerID, x, y, gx, gy) {
        // Helper: baseTemplate factory (new implementation to support new sector system)
        let baseTemplate = {
            'id': `BASE_${playerID}_${x}_${y}`,    
            'x': x,
            'y': y,
            'gx': gx,
            'gy': gy,

            'playerID': playerID,
            'isEnemy': isEnemy(playerID),
        }
        return baseTemplate;
    }

    /**
     * Used to initialise `state.poi.bases` & also writes a reference to `state.grid.grid` directly.
     * @param {worldState} state 
     * @returns 
     */
    #initialiseBaseLocs(state) {
        const cellSize = state.grid.cellSize;

        let b = [];

        for (let i=0; i<startPositions.length; i++) {
            const x = startPositions[i].x;
            const y = startPositions[i].y;

            const gx = Math.floor(x / cellSize);
            const gy = Math.floor(y / cellSize);

            const base = this.#createNewBase(i, x, y, gx, gy);
            b.push(base);
            state.grid.grid[gx][gy].bases.push(base);
        }
        return b;
    }

    /**
     * Used to initialise `state.playerInfo`.
     * @param {worldState} state 
     * @returns 
     */
    #initialisePlayerInfo(state) {
        let p = [];
        const playerIdList = generateRange(maxPlayers);       // will create 0-indexed playerIDs from 0, 1, 2, ..., maxPlayers - 1
        playerIdList.forEach(playerID => p.push(state.createPlayerInfoEntry(playerID)));
        
        return p;
    }

    #initialiseMapTiles() {
        const yMap = generateRange(mapHeight);
        const xMap = generateRange(mapWidth);

        yMap.forEach(y => {
            const mapRow = [];

            xMap.forEach(x => {
                // mapRow.push(MapTiles[y][x].height);      // height
                // mapRow.push(MapTiles[y][x].terrainType);    // different terrain type
            });

            // debug(`"${mapRow}",`);      // python script processes list of comma-delimited strings
        });
    }

    /**
     * Initialises `state` with the FishBot grouping system, default POIs and basic player information.
     * @param {worldState} state 
     * @returns {void}
     */
    initialise(state) {
        state.g = this.#createFbGroupingSystem();

        this.#initialiseMapTiles();

        state.poi.derricks = this.#initialiseDerrickLocs(state);    // this function also modifies each grid cell
        state.poi.bases = this.#initialiseBaseLocs(state);          // this function also modifies each grid cell

        state.playerInfo = this.#initialisePlayerInfo(state);
    }
}
