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
 *      3. State mutator ("service")                                         -- fulfilled by: hq_toc (delegated by hq_command) / hq_command
 *      4. Decision maker (coordinator)                                      -- fulfilled by: hq_command
 */

class fbGrid {
    constructor() {
        this.cellSize = 10;     // in game tiles
        this.numXCells = Math.ceil(mapWidth / this.cellSize);
        this.numYCells = Math.ceil(mapHeight / this.cellSize);

        this.grid = create2DGrid(this.numXCells, this.numYCells, this.createNewFbGridCell);        
    }

    createNewFbGridCell() {
        return {
            'targetUnits': [],
            'targetStructures': [],

            'friendlyUnits': [],
            'friendlyStructures': [],

            'derricks': [],
            'bases': [],
            'adaCount': 0,
        }
    }

    enumBoundingBox(x, y, radius) {
        let results = {
            'droids': [],
            'structs': [],
            'closestDroid': undefined,
            'closestStruct': undefined
        };

        if (!defined(this.grid)) {
            debug(`WARNING: state/spatialQueryBox() could not read from undefined grid.`);
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
                // debug(`gx ${gx}, gy ${gy}, this.grid[gx][gy] ${this.grid[gx][gy]}, t ${this.grid[gx][gy]['targetUnits']}`);
                this.grid[gx][gy]['targetUnits'].forEach(t => {
                    const obj = getObject(t.type, t.player, t.id);
                    if (!defined(obj)) {
                        return;
                    }
                    const d = distSq(x, obj.x, y, obj.y);

                    // distSq check is removed here

                    results['droids'].push(t);
                    
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
                results['closestDroid'] = closestDroid;
                
                this.grid[gx][gy]['targetStructures'].forEach(t => {
                    const obj = getObject(t.type, t.player, t.id);
                    if (!defined(obj)) {
                        return;
                    }
                    const d = distSq(x, obj.x, y, obj.y);

                    // distSq check is removed here

                    results['structs'].push(t);

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
                results['closestStruct'] = closestStruct;                
            }
        }

        return results;
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
            'droids': [],
            'structs': [],
            'closestDroid': undefined,
            'closestStruct': undefined
        };

        if (!defined(this.grid)) {
            debug(`WARNING: state/spatialQueryBox() could not read from undefined grid.`);
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
                    results['droids'].push(t);
                    
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
                results['closestDroid'] = closestDroid;
                
                this.grid[gx][gy]['targetStructures'].forEach(t => {
                    const obj = getObject(t.type, t.player, t.id);
                    if (!defined(obj)) {
                        return;
                    }
                    const d = distSq(x, obj.x, y, obj.y);
                    if (d > radius ** 2) {
                        return;
                    }
                    results['structs'].push(t);

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
                results['closestStruct'] = closestStruct;                
            }
        }

        return results;
    }
}

class worldState {
    // State: this class stores the game state from FishBot's perspective.
    // All functions in FishBot use this class as the current ground truth.
    constructor() {

        // Sector system (original)
        this.sectors = [];
        this.highRiskSectors = [];

        // Sector system (new)
        this.allTargets = [];
        this.grid = new fbGrid();
        this.playerInfo = [];
        this.poi = {
            'derricks': [], 
            'bases': []
        };

        // Combat targeting
        this.forceLocation = undefined;
        this.nearbyGroundTargets = undefined;
        this.aviationTargets = {
            'raidTargets': [],
            'casTargets': [],
            'productionTargets': [],
            'adaTargets': []
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

			'numTotalUnits': 0,
			'numInfantryUnits': 0,
			'numArmourUnits': 0,
			'numAirUnits': 0,
			'numIndirectUnits': 0,
			'numADA': 0,

			'numStructs': 0,
            'numFactories': 0,
			'numDerricks': 0,
		};
    }

    /**
     * Returns an array containing the playerIDs of alive players.
     */
    enumLivingPlayers() {   
        let livingPlayerIDs = [];

        this.playerInfo.forEach(p => {
            if (p.numTotalUnits !== 0 || p.numFactories !== 0) {
                livingPlayerIDs.push(p.playerID);
            }
        });

        return livingPlayerIDs;
    }

}


class worldStateBuilder {

    #_createDerrickFromTemplate({location}) {
        // Helper: derrickTemplate factory
        let derrickTemplate = {
            'id': `DERRICK_${location.x}_${location.y}`,
            'featureType': FEATURE_TYPE.DERRICK, 
            'x': location.x,
            'y': location.y,
            'isClaimed': false,
            'playerID': undefined,

            'friendlyDefenceCount': undefined,
            'enemyDefenceCount': undefined,
            'owner': undefined,
            'controlStability': undefined, 
            'threatLevel': undefined,		
        }
        
        return derrickTemplate;
    }

    #_createBaseFromTemplate({playerID, location}) {
        // Helper: baseTemplate factory
        let baseTemplate = {
            'id': `BASE_${location.x}_${location.y}`,
            'featureType': FEATURE_TYPE.BASE,
            'x': location.x,
            'y': location.y,
            'playerID': playerID,
            'isEnemy': isEnemy(playerID),
            'nearbyBaseStructures': undefined,
        }
        return baseTemplate;
    }

    #_createSectorFromTemplate({x, y, base=undefined, derrickList=[]}) {
        // Helper: sectorTemplate factory
        let sectorTemplate = {
            'id': `SECTOR_${x}_${y}`,
            'featureType': FEATURE_TYPE.SECTOR,
            'x': x,
            'y': y,

            // Sector info
            'base': base,
            'derricks': [],
            'adjacentSectors': [],
            
            'priority': MISSION_PRIORITY.LOW,
            'friendlyDefenceCount': undefined,
            'enemyDefenceCount': undefined,
            'owner': REGION_OWNER.NEUTRAL,
            'controlStability': REGION_STABILITY.HIGH, 
            'threatLevel': REGION_THREAT_LEVEL.LOW,		
        }

        sectorTemplate.derricks.push(...derrickList);
        return sectorTemplate;
    }

    #createFbGroupingSystem() {
        // Generates initial values in FishBot v3 grouping system
        let g = new fbGroup();

        g.createGroup(AIR_RESERVE);

        for (const d in DIVISION) {
            g.createGroup(DIVISION[d]);
        }
        
        for (const e in ENGINEERING) {
            g.createGroup(ENGINEERING[e]);
        }

        return g;
    }

    #initialiseSectors(state) {
        // Application service: generate initial sector info
        let playerStartLocations = startPositions.concat();	
        for (let i=0; i<playerStartLocations.length; ++i) {

            // Assumes enemy bases are not on top of each other
            const baseLoc = playerStartLocations[i];
            let base = this.#_createBaseFromTemplate({
                playerID: i, 
                location: baseLoc
            });
            let t = this.#_createSectorFromTemplate({
                x: baseLoc.x, 
                y: baseLoc.y, 
                base: base, 
                derrickList: []
            });
            state.sectors.push(t);
        }

        let derrickLocations = derrickPositions.concat();

        const PROXIMITY_TILES = 14;

        for (let i=0; i<derrickLocations.length; i++) {
            const derrickLoc = derrickLocations[i];

            let combined = false;
            for (let j=0; j<state.sectors.length; j++) {
                const currSector = state.sectors[j];
                if (distance(derrickLoc, currSector) < PROXIMITY_TILES) {
                    // Don't create a new sector, use existing
                    state.sectors[j].derricks.push(this.#_createDerrickFromTemplate({location: derrickLoc}));
                    // debug(`Added ${derrickLoc.x}, ${derrickLoc.y} -> ${state.sectors[j].id}`);
                    combined = true;
                    break;
                }
            }
            if (combined) {
                continue;
            }
            
            // Else, create a new sector
            let t = this.#_createSectorFromTemplate({
                x: derrickLoc.x, 
                y: derrickLoc.y, 
                base: undefined, 
                derrickList: [this.#_createDerrickFromTemplate({location: derrickLoc})]
            });
            state.sectors.push(t);
        }

        // Sort sectors to go from closest to furthest from base
        state.sectors.sort((one, two) => distance(one, baseLocation) - distance(two, baseLocation));
        
        for (let i=0; i<state.sectors.length; i++) {
            // Set adjacent sectors
            let currSector = state.sectors[i];
            const otherRangedSectors = state.sectors.filter(nextSector => currSector.id !== nextSector.id).sort((one, two) => distance(one, currSector) - distance(two, currSector));
            state.sectors[i].adjacentSectors = otherRangedSectors.slice(0, 3);

            // Organise derricks in terms of distance from base
            currSector.derricks.sort((a, b) => 
                distSq(a.x, baseLocation.x, a.y, baseLocation.y) - distSq(b.x, baseLocation.x, b.y, baseLocation.y));

        }

        if (false) {
            state.sectors.forEach(s => {
                debug(`${s.id}, ${s.x}, ${s.y}`);
                // hackMarkTiles(s.x, s.y);
                if (defined(s.base)) {
                    debug(` - ${s.base.id}, ${s.base.x}, ${s.base.y} with derricks:`);
                }
                s.adjacentSectors.forEach(s => debug(`  - adj: sector ${s.id}`));
                s.derricks.forEach(d => debug(`     - ${d.id}, ${d.x}, ${d.y}`));
            })
        }
    }

    #createNewDerrick(x, y, gx, gy) {
        // Helper: derrickTemplate factory (new implementation to support new sector system)
        return {
            'id': `DERRICK_${x}_${y}`,
            'featureType': FEATURE_TYPE.DERRICK, 

            // Coordinates & grid coordinates
            'x': x,
            'y': y,
            'gx': gx,
            'gy': gy,
            
            'isClaimed': false,
            'playerID': undefined,

            'friendlyDefenceCount': undefined,
            'enemyDefenceCount': undefined,
            'owner': undefined,
            'controlStability': undefined, 
            'threatLevel': undefined,		
        }
    }

    /**
     * This modifies `state.grid` with derrick locations.
     * @param {*} state 
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
        }
        return d;
    }

    #createNewBase(playerID, x, y, gx, gy) {
        // Helper: baseTemplate factory (new implementation to support new sector system)
        let baseTemplate = {
            'id': `BASE_${playerID}_${x}_${y}`,     // this was changed to add playerID
            'featureType': FEATURE_TYPE.BASE,

            'x': x,
            'y': y,
            'gx': gx,
            'gy': gy,

            'playerID': playerID,
            'isEnemy': isEnemy(playerID),
        }
        return baseTemplate;
    }

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

    initialise(state) {
        // Application service: Initialises 'worldState' to defaults
        state.g = this.#createFbGroupingSystem();

        // old sector system
        this.#initialiseSectors(state);        

        // new sector system
        state.poi.derricks = this.#initialiseDerrickLocs(state);    // this function also modifies each grid cell
        state.poi.bases = this.#initialiseBaseLocs(state);          // this function also modifies each grid cell
    }
}
