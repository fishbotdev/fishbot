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


function getDroidsAndStructsByPlayer(playerIdList=undefined) {

    const createPlayerBucket = (id, droids, structs) => {return {'playerID': id, 'droids': droids, 'structs': structs}};  

    let objectsByPlayer = [];

    if (!defined(playerIdList)) {
        playerIdList = generateRange(maxPlayers);       // will create 0-indexed playerIDs from 0, 1, 2, ..., maxPlayers - 1
    }

    playerIdList.forEach(id => {
        const p = createPlayerBucket(id, enumDroid(id), enumStruct(id));
        objectsByPlayer.push(p);
    });

    return objectsByPlayer;
}


function checkOilDominance(state, oilDominancePercentage) {
    const playerInfo = state.playerInfo;
    const totalDerricks = state.poi.derricks.length;

    for (let i=0; i<playerInfo.length; i++) {
        if (playerInfo[i]['playerID'] !== me) {
            continue;
        }
        
        const pc = playerInfo[i]['numDerricks'] / totalDerricks * 100;
        // debug(` ${gameTime}: captured ${playerInfo[i]['numDerricks']} out of ${totalDerricks} (${pc}%)`);
        return (pc > oilDominancePercentage);        
    }    
}
