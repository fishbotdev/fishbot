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

/**
 * Applies reusable bitflags to game objects, enabling fast comparisons & intelligent object filtering.
 * @param {DroidObject | StructureObject} obj
 * @returns {number} bitflags from `OBJ_FLAGS`
 */
function classifyGameObject(obj) {

    let flags = 0;

    // Object-type agnostic capability
    if (isAntiAirDefense(obj)) {
        flags |= OBJ_FLAGS.ADA;

        if (obj.type === DROID) {
            if (obj.weapons.length > 0) {
                const weapon = obj.weapons[0];
                if (AA_DIRECT_FIRE_WEAPONS.includes(weapon)) {
                    // Includes AA lasers & AA cannons
                    flags |= OBJ_FLAGS.AA_DIRECT_FIRE_WEAPON;	
                } else if (AA_ROCKET_WEAPONS.includes(weapon)) {
                    flags |= OBJ_FLAGS.AA_ROCKET_WEAPON;
                } else {
                    flags |= OBJ_FLAGS.UNCLASSIFIED_WEAPON_TYPE;
                }
            }
        }			
    }

    if (obj.hasIndirect === true) {
        flags |= OBJ_FLAGS.INDIRECT_FIRE;
    }

    if (obj.type === DROID) {

        switch (obj.propulsion) {
            case PROPULSIONS["Cyborg Propulsion"].id: 
                flags |= OBJ_FLAGS.CYBORG_PROPULSION;
                break;
            case PROPULSIONS["Wheels"].id:
                flags |= OBJ_FLAGS.WHEELED_PROPULSION;
                break;
            case PROPULSIONS["Half-tracks"].id:
                flags |= OBJ_FLAGS.HALF_TRACKED_PROPULSION;
                break;
            case PROPULSIONS["Tracks"].id:
                flags |= OBJ_FLAGS.TRACKED_PROPULSION;
                break;
            case PROPULSIONS["Hover"].id:
                flags |= OBJ_FLAGS.HOVER_PROPULSION;
                break;
            case PROPULSIONS["VTOL"].id:
                flags |= OBJ_FLAGS.VTOL_PROPULSION;
                break;

            default:
                flags |= OBJ_FLAGS.TRACKED_PROPULSION;
                debug(`WARNING	intelligence/#classifyObject(): obj.propulsion was not understood: ${obj.propulsion}`);
        }

        // Droid-specific capability
        if (obj.droidType === DROID_CONSTRUCT) {
            flags |= OBJ_FLAGS.CONSTRUCTOR;
            return flags;
        }
        
        if (obj.droidType === DROID_REPAIR) {
            flags |= OBJ_FLAGS.REPAIR;
            return flags;
        }

        const ARMOUR_MASK = OBJ_FLAGS.HALF_TRACKED_PROPULSION | OBJ_FLAGS.TRACKED_PROPULSION | OBJ_FLAGS.WHEELED_PROPULSION | OBJ_FLAGS.HOVER_PROPULSION;
        if (obj.droidType === DROID_WEAPON) {
            if (flags & ARMOUR_MASK) {
                flags |= OBJ_FLAGS.ARMOUR;
            } else if (flags & OBJ_FLAGS.VTOL_PROPULSION) {
                flags |= OBJ_FLAGS.AVIATION;
            }
        }

        if (obj.droidType === DROID_CYBORG) {
            flags |= OBJ_FLAGS.INFANTRY;
        }

        if (obj.weapons.length > 0) {
            const weapon = obj.weapons[0];		// ignoring special case of dual weapon body

            if (CANNON_WEAPONS.some(w => w.id === weapon.id)) {
                flags |= OBJ_FLAGS.CANNON_WEAPON;
            } else if (AT_ROCKET_WEAPONS.some(w => w.id === weapon.id)) {
                flags | OBJ_FLAGS.AT_ROCKET_WEAPON;
            } else if (MACHINEGUN_WEAPONS.some(w => w.id === weapon.id)) {
                flags |= OBJ_FLAGS.MACHINEGUN_WEAPON;
            } else if (SHORT_RANGE_ARTILLERY_WEAPONS.some(w => w.id === weapon.id)) {
                flags |= OBJ_FLAGS.SHORT_RANGE_ARTILLERY_WEP;
            } else if (LONG_RANGE_ARTILLERY_WEAPONS.some(w => w.id === weapon.id)) {
                flags |= OBJ_FLAGS.LONG_RANGE_ARTILLERY_WEP;
            } else if (VTOL_ARTILLERY_WEAPONS.some(w => w.id === weapon.id)) {
                flags |= OBJ_FLAGS.VTOL_ARTILLERY_WEAPON;
            } else if (AA_DIRECT_FIRE_WEAPONS.some(w => w.id === weapon.id)) {
                flags |= OBJ_FLAGS.AA_DIRECT_FIRE_WEAPON;
            } else if (AA_ROCKET_WEAPONS.some(w => w.id === weapon.id)) {
                flags |= OBJ_FLAGS.AA_ROCKET_WEAPON;
            } else if (LASER_WEAPONS.some(w => w.id === weapon.id)) {
                flags |= OBJ_FLAGS.LASER_WEAPON;
            } else if (FLAMER_WEAPONS.some(w => w.id === weapon.id)) {
                flags | OBJ_FLAGS.FLAMER_WEAPON;
            } else {
                flags |= OBJ_FLAGS.UNCLASSIFIED_WEAPON_TYPE;
            }
        } else {
            flags |= OBJ_FLAGS.UNCLASSIFIED_WEAPON_TYPE;
        }

        return flags;
    }

    if (obj.type === STRUCTURE) {
        if (obj.status === BUILT) {
            flags |= OBJ_FLAGS.IS_BUILT;
        }

        if (obj.stattype === DEFENSE) {
            flags |= OBJ_FLAGS.DEFENSIVE_STRUCTURE;
            return flags;
        }

        if (obj.stattype === RESEARCH_LAB) {
            flags |= OBJ_FLAGS.RESEARCH;
            return flags;
        }

        const INDUSTRIAL_TARGETS = [FACTORY, CYBORG_FACTORY, VTOL_FACTORY];	
        if (INDUSTRIAL_TARGETS.includes(obj.stattype)) {
            flags |= OBJ_FLAGS.PRODUCTION;
            return flags;					
        }

        if (obj.stattype === RESOURCE_EXTRACTOR) {
            flags |= OBJ_FLAGS.RESOURCE_EXTRACTOR;
            return flags;
        }

        if (obj.stattype === REPAIR_FACILITY) {
            flags |= OBJ_FLAGS.REPAIR;
            return flags;
        }
    }
    
    return flags;
}


/**
 * 
 * @param {worldState} state 
 * @param {number} oilDominancePercentage 
 * @returns {boolean}
 */
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
