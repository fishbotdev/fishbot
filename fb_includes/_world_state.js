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
 *      - We want to avoid chaos (obscure modifications of the state, impossible debugging, duplication of logic, accidental rule violations)
 * 
 *  In the Domain Services architecture, we need a 
 *      1. Central database which stores the current game state ("state")    -- fulfilled by: worldState (this file)
 *      2. State observer/reporter ("system")                                -- fulfilled by: operational level functions hq_gX
 *      3. State mutator ("service")                                         -- fulfilled by: hq_toc
 *      4. Decision maker (coordinator)                                      -- fulfilled by: hq_command
 */

class worldState {
    // State: this class stores the game state from FishBot's perspective.
    // All functions in FishBot use this class as the current ground truth.
    constructor() {

        // Map knowledge
        this.sectors = [];
        this.highRiskSectors = [];
        this.oilDominance = false;

        // Combat targeting
        this.forceLocation = undefined;
        this.nearbyGroundTargets = undefined;   

        // Mission management system
        this.g = new fbGroup();
        this.activeMissions = [];

        // Bot attributes
        this.botIsActive = true;
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

    #initialiseFbGroups(state) {
        // Application service: Generates initial values in FishBot v3 grouping system
        state.g.createGroup(AIR_RESERVE);

        for (const d in DIVISION) {
            state.g.createGroup(DIVISION[d]);
        }
        
        for (const e in ENGINEERING) {
            state.g.createGroup(ENGINEERING[e]);
        }
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

    initialise(state) {
        // Application service: Initialises 'worldState' to defaults
        this.#initialiseFbGroups(state);
        this.#initialiseSectors(state);
    }
}
