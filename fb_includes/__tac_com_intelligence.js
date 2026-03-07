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

function getSectorIntelFromGameEngine(sectorInfo, missionType) {

    // System: Returns "observations" from the game engine
    const base = sectorInfo.base;
    const derricks = sectorInfo.derricks;

    // Create templates for base & derrick intel reports
    let baseIntelReport = undefined;
    if (defined(base)) {
        baseIntelReport = {
            'id': base.id,
            'nearbyBaseStructures': undefined,
        }
    }

    let derrickIntelReports = [];
    if (derricks.length > 0) {
        derricks.forEach(derrick => {
            let derrickIntelReport = {
                'id': derrick.id,
                'isClaimed': false,
                'playerID': undefined,

                'friendlyDefenceCount': undefined,
                'enemyDefenceCount': undefined,
            };
            derrickIntelReports.push(derrickIntelReport);
        });
    }

    // Method: 
    //  - report any progress on base 
    //  - ENUMSTRUCT AROUND derricks
    //  - report if derrick is built

    // BASE INTEL
    const BASE_SEARCH_RADIUS = 20;
    if (defined(base)) {
        let nearbyBaseStructures = enumRange(base.x, base.y, BASE_SEARCH_RADIUS, ALL_PLAYERS, false).                   // enumRange -> 'false' means that it will not filter by visibility
                                   filter(obj => (obj.type === STRUCTURE && ![RESOURCE_EXTRACTOR, DEFENSE, WALL].includes(obj.stattype)));		
        baseIntelReport['nearbyBaseStructures'] = nearbyBaseStructures.length;
    }

    // DERRICK INTEL
    let overallFriendlyDefenceCount = 0, overallEnemyDefenceCount = 0;

    const DERRICK_SEARCH_RADIUS = 8;        // 8 > 5*sqrt(2) -> this searches for nearby structures in at least a 11x11 box centred on the derrick
    for (let i=0; i<derricks.length; i++) {
        let currReport = derrickIntelReports[i];
        const currDerrick = derricks[i];

        const nearbyStructures = enumRange(currDerrick.x, currDerrick.y, DERRICK_SEARCH_RADIUS, ALL_PLAYERS, false);
        
        const targetDerrick = nearbyStructures.filter(obj => {
            const oilDerrickID = STRUCTURES["Oil Derrick"].id;
            const lookup = STRUCTURES[obj.name];
            if (!defined(lookup)) {
                return false;
            }
            if (lookup.id === oilDerrickID) {
                if (obj.x === currDerrick.x && obj.y === currDerrick.y) {
                    return true;
                }		
            }
            return false;
        }); 

        // Update intel report with ownership
        if (targetDerrick.length > 0) {
            currReport.isClaimed = true;					
            currReport.playerID = targetDerrick[0].player;
        } else {
            currReport.isClaimed = false;	
            currReport.playerID = undefined;
        }

        let nearbyDefences = nearbyStructures.filter(obj => 
            obj.type === STRUCTURE && [DEFENSE, WALL, GATE].includes(obj.stattype) && obj.status === BUILT);

        let friendlyDefenceCount = nearbyDefences.filter(obj => !isEnemy(obj.player)).length;
        let enemyDefenceCount = nearbyDefences.filter(obj => isEnemy(obj.player)).length;

        overallFriendlyDefenceCount += friendlyDefenceCount;
        overallEnemyDefenceCount += enemyDefenceCount;

        // Update intel report with defenceCount
        currReport.friendlyDefenceCount = friendlyDefenceCount;
        currReport.enemyDefenceCount = enemyDefenceCount;
    }

    let sectorIntelReport = {
        'id': sectorInfo.id,
        'featureType': FEATURE_TYPE.SECTOR,
        'x': sectorInfo.x,
        'y': sectorInfo.y,

        'friendlyDefenceCount': overallFriendlyDefenceCount,
        'enemyDefenceCount': overallEnemyDefenceCount,

        'base': baseIntelReport,
        'derricks': derrickIntelReports
    };

    if (false) {
        debug(`Intel on ${sectorIntelReport.id}:`);
        if (defined(sectorIntelReport['base'])) {
            debug(` nearby base: ${sectorIntelReport['base'].id}, nearby structs: ${sectorIntelReport['base'].nearbyBaseStructures}`);
        }
        sectorIntelReport.derricks.forEach(d => {
            debug(` derrick ${d.id}, isClaimed: ${d.isClaimed}, playerID: ${d.playerID}`);
        });
        debug(` nearby friendly defences: ${sectorIntelReport.friendlyDefenceCount}, enemy: ${sectorIntelReport.enemyDefenceCount}`);
    }

    return {
        status: MISSION_STATUS.SUCCEEDED,
        intelReport: {
            'missionType': missionType,
            'report': sectorIntelReport
        }
    }

}

function checkOilDominance(state, oilDominancePercentage, missionType) {

    let totalDerricks = 0, capturedDerricks = 0;

    for (let i=0; i<state.sectors.length; i++) {
        let d = state.sectors[i].derricks;
        d.forEach(derrick => {
            if (derrick.owner === REGION_OWNER.FRIENDLY) {
                capturedDerricks++;
            }
            totalDerricks++;
        })
    }

    const isOilDominant = Math.floor(capturedDerricks / totalDerricks * 100) > oilDominancePercentage;

    return {
        status: MISSION_STATUS.SUCCEEDED,
        intelReport: {
            'missionType': missionType, 
            'report': isOilDominant
        }
    }
}
