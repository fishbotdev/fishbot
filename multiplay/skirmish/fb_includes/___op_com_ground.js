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


class armyGroundForceCommand {

	constructor() {
		
	}

	completedForceBuildup() {
		let allTanksCount = enumDroid(me, DROID_WEAPON).filter((droid) => droid.isVTOL !== true).length;		// todo: replace with other
		const fireSupportCount = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE).length;
		const directAssaultTanksCount = allTanksCount - fireSupportCount;

		if (directAssaultTanksCount >= 5)
			return true;
		else
			return false;
	}

	completedStagingForAttack() {
		let allTanksCount = enumDroid(me, DROID_WEAPON).filter((droid) => droid.isVTOL !== true).length;		// todo: replace with other
		const fireSupportCount = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE).length;

		if (allTanksCount >= 10 && fireSupportCount >= 3)		
			return true;
		else
			return false;
	}

	getForceMedianLocation(unused) {
		/*
			Goal: to find the 'median' droid's (x,y) coordinates
			1. Get x,y of all owned droids
			2. Iterate through (x,y) coordinate list, get the median, return as 'x' and 'y'
		*/

		let generalReserve = state.g.enumGroup(DIVISION.GENERAL_RESERVE);
		let fireSupportReserve = state.g.enumGroup(DIVISION.FIRE_SUPPORT_RESERVE);
		let infantryReserve = state.g.enumGroup(DIVISION.INFANTRY_RESERVE);
		let allLandUnits = [...generalReserve, ...fireSupportReserve, ...infantryReserve];

		let currGameTime = getCurrGameTime();
		let droidsInGroup = allLandUnits.filter((droid) => (currGameTime - droid.born) > 30000);	
		if (droidsInGroup.length === 0) {
			return undefined;
		}

		let droidX = [], droidY = [];
		droidsInGroup.forEach((droid) => {
			droidX.push(droid.x);
			droidY.push(droid.y);
		});	

		// Find median
		let medianX = Math.floor(arrayMedian(droidX));
		let medianY = Math.floor(arrayMedian(droidY));

		return {"x": medianX, "y": medianY};
	}

}