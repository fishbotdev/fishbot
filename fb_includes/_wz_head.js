/*
	This file is part of FishBot, a Warzone 2100 AI.

	FishBot is free software: you can redistribute it and/or modify it under the terms of the 
	GNU General Public License as published by the Free Software Foundation, either version 3 
	of the License, or (at your option) any later version.

	FishBot is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; 
	without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
	See the GNU General Public License for more details.

	You should have received a copy of the GNU General Public License along with this program. 
	If not, see <https://www.gnu.org/licenses/> or <https://www.gnu.org/licenses/gpl-3.0.html>.
*/

/*
 *  This file contains game constants (from the Stats global) which are used throughout the code.
*/

const baseLocation = startPositions[me];

/*
    RESEARCH INFORMATION
*/
let RESEARCHES = {};

/*
For each structure, e.g. RESEARCHES["Twin Assault Cannon"] the parameters are:
-   [Parameter]     | [Example value, raw]                              | [Comment]
-   Id              | "R-Wpn-Cannon6-TwinAslt"                          | (str) researchID of this technology 
-   Requires        | ["R-Wpn-Cannon5", "R-Struc-Research-Upgrade06"]   | Array[str] researchIDs
-   ResultComponents| ["Cannon6TwinAslt"]                               | Array[str] weaponIDs
-   ResultStructures| []                                                | Array[str] structureIDs
-   name            | "Twin Assault Cannon"                             | (str) Human-readable name (added by FishBot)
-   id              | "R-Wpn-Cannon6-TwinAslt"                          | (str) same as Id (added by FishBot)


*/

/*
    STRUCTURE INFORMATION
*/
const FISHBOT_DEFENCES = [];        // to be used in the future
/**
    ```STRUCTURES```: Object which contains all WZ2100 structure information extracted from the Stats global.
*/
let STRUCTURES = {};
let BASE_STRUCTURES = {};           // used to enum living players
const IRRELEVANT_STRUCTURES = ["*", "Scavenger", "BaBa", "Collective", "New Paradigm", "Missile Silo", "Downed Transport", "NEXUS Wall", "NEXUS CWall"];
for (const key in Stats.Building) {
    if (!Object.hasOwnProperty.call(Stats.Building, key)) { 
        // This checks if the object property is owned by Stats.Building and not Object.prototype (parent object)
        continue;
    }

    if (IRRELEVANT_STRUCTURES.some(irrelevantText => key.includes(irrelevantText))) {
        continue;       
    }

    let structObj = Stats.Building[key];
    structObj = {...structObj, ...{'name': key, 'id': structObj.Id}};       // adds user-friendly 'name' & id

    STRUCTURES[key] = structObj;       // Append new key
    if (structObj.Type === "Structure") {
        BASE_STRUCTURES[key] = structObj;       // Append new key
    }
}

/*
For each structure, e.g. STRUCTURE["Factory"], STRUCTURE["Pepperpot Pit"] the parameters are:
-   [Parameter]     | [Example value, raw]  | [Example value, raw]  | [Comment]
-   Armour          | 10                    | 10                    | (int)
-   BuildPower      | 100                   | 175                   | (int) How many power points it takes to start construction
-   HitPoints       | 1000                  | 300                   | (int) How much health the factory has
-   Id              | "AOLightFactory"      | "Emplacement-RotMor"  | (str) Structure ID (referred to in this bot as structureID)
-   PowerPoints     | 0                     | 0                     | (int)
-   ProductionPoints| 10                    | 0                     | (int)
-   RearmPoints     | 0                     | 0                     | (int)
-   RepairPoints    | 0                     | 0                     | (int)
-   ResearchPoints  | 0                     | 0                     | (int)
-   Resistance      | 150                   | 150                   | (int)
-   Thermal         | 10                    | 10                    | (int)
-   Type            | "Structure"           | "Wall"                | (str) base structures are of type "Structure", the rest, "Wall" 
-   Weapons         | []                    | ["Mortar3ROTARYMk1"]  | (array) contains the weapon ID
-   name            | "Factory"             | "Pepperpot Pit"       | (str) human readable name (added by FishBot)
-   id              | "AOLightFactory"      | "Emplacement-RotMor"  | (str) same as Id (added by FishBot)                      
*/

const v462_BASE_STRUCTURE_NAMES = [
"Command Center", 
"Command Relay Center", 
"Cyborg Factory", 
"Factory", 
"Factory Module", 
"Laser Satellite Command Post", 
"Oil Derrick", 
"Power Generator", 
"Power Module", 
"Repair Facility", 
"Research Facility", 
"Research Module", 
"Satellite Uplink Center", 
"VTOL Factory", 
"VTOL Rearming Pad"
];
const v462_DEFENCES_NAMES = ["AA Cyclone Flak Cannon Emplacement", "AA Cyclone Flak Cannon Hardpoint", "AA Tornado Flak Cannon Emplacement", "AA Tornado Flak Cannon Hardpoint", "Archangel Missile Emplacement", "Assault Cannon Guard Tower", "Assault Cannon Hardpoint", "Assault Gun Emplacement", "Assault Gun Hardpoint", "Assault Gun Tower", "Avenger Hardpoint", "Avenger SAM Site", "Bombard Pit", "CB Tower", "Cannon Fortress", "Cannon Tower", "Demolish Structure", "EMP Cannon Hardpoint", "EMP Mortar Pit", "Flamer Bunker", "Flamer Guard Tower", "Flamer Hardpoint", "Flashlight Emplacement", "Gauss Cannon Emplacement", "Gauss Cannon Hardpoint", "Ground Shaker Emplacement", "HMG Bunker", "Hardcrete Corner Wall", "Hardcrete Gate", "Hardcrete Wall", "Hardened Sensor Tower", "Heavy Cannon Hardpoint", "Heavy Laser Emplacement", "Heavy Machinegun Bunker", "Heavy Machinegun Guard Tower", "Heavy Machinegun Hardpoint", "Heavy Machinegun Tower", "Heavy Plasma Launcher Emplacement", "Heavy Rocket Bastion", "Heavy Rocket Battery", "Hellstorm Emplacement", "Howitzer Emplacement", "Hurricane AA Site", "Hyper Velocity Cannon Emplacement", "Hyper Velocity Cannon Hardpoint", "Incendiary Howitzer Emplacement", "Incendiary Howitzer Emplacement 2", "Incendiary Mortar Pit", "Incendiary Mortar Pit 2", "Inferno Bunker", "Inferno Hardpoint", "Jammer Tower", "Lancer Bunker", "Lancer Hardpoint", "Lancer Tower", "Light Cannon Bunker", "Light Cannon Hardpoint", "Look-Out Tower", "Mass Driver Fortress", "Medium Cannon Hardpoint", "Mini-Rocket Battery", "Mini-Rocket Tower", "Missile Fortress", "Mortar Pit", "Needle Gun Tower", "Nexus Link Tower", "Particle Gun Emplacement", "Pepperpot Pit", "Plasma Cannon Emplacement", "Plasmite Flamer Bunker", "Pulse Laser Emplacement", "Pulse Laser Hardpoint", "Pulse Laser Tower", "Radar Detector Tower", "Rail Gun Hardpoint", "Railgun Emplacement", "Ripple Rocket Battery", "Rotary MG Bunker", "Scourge Missile Hardpoint", "Scourge Missile Tower", "Sensor Tower", "Seraph Missile Battery", "Stormbringer Emplacement", "Sunburst AA Site", "Tank Killer Emplacement", "Tank Killer Hardpoint", "Tank Traps", "Twin Assault Cannon Bunker", "Twin Assault Gun Hardpoint", "Twin Machinegun Bunker", "Twin Machinegun Guard Tower", "VTOL CB Tower", "VTOL Strike Tower", "Vindicator Hardpoint", "Vindicator SAM Site", "Whirlwind AA Site", "Whirlwind Hardpoint", "Wide Spectrum Sensor Tower"];


/*
    VEHICLE BODY INFORMATION
*/
let FISHBOT_BODIES = [];            // want this to be an array of objects because this will be regularly iterated through
const FISHBOT_BODY_LIST_ORDERED = ["Viper", "Cobra", "Python", "Mantis", "Leopard", "Panther", "Tiger", "Retaliation", "Retribution", "Vengeance"];       // this is ordered in order of technological sophistication (used in production)
FISHBOT_BODY_LIST_ORDERED.forEach((bodyName) => {
    const bodyObj = {...Stats.Body[bodyName], ...{'name': bodyName, 'id': Stats.Body[bodyName].Id}};       // adds user-friendly 'name' & id
    FISHBOT_BODIES = FISHBOT_BODIES.concat(bodyObj);
});
// FISHBOT_BODIES.forEach((body) => debug( `${body.name}: ${body.Id}, ${body.Size}`));

/* 
For each body e.g. FISHBOT_BODIES["Python"], the parameters are:
-   [Parameter]     | [Example value, raw]  | [Comment]
-   Armour          | 20                    | (int) Kinetic armour 
-   BodyClass       | "Droids"              | (str) 
-   BuildPower      | 60                    | (int)
-   BuildTime       | 350                   | (int)
-   HitPointPct     | 100                   | (int)
-   HitPoints       | 200                   | (int)
-   Id              | "Body11ABT"           | (str)
-   Power           | 20000                 | (int) Engine power
-   Resistance      | 150                   | (int)
-   Size            | 2                     | (int) Light/Medium/Heavy body distinction = number of factory modules needed to make
-   Thermal         | 9                     | (int) Thermal armour points
-   WeaponSlots     | 1                     | (int) How many weapons are permissible to be mounted on this body simultaneously
-   Weight          | 2700                  | (int) 
-   name            | "Python"              | (int) Human readable name (added by FishBot)  
-   id              | "Body11ABT"           | (int) same as Id (added by FishBot)  
*/

const BODY_WEIGHT = {
    LIGHT: 0,
    MEDIUM: 1,
    HEAVY: 2
};
Object.freeze(BODY_WEIGHT);

/*
    PROPULSION INFORMATION
*/
const PROPULSION_LIST = ["Cyborg Propulsion", "Wheels", "Half-tracks", "Tracks", "Hover", "VTOL"];
let PROPULSIONS = {};
PROPULSION_LIST.forEach(propName => {
    // debug(  `Stats.Propulsion[propName] ${Stats.Propulsion[propName]}, propName ${propName}, id ${Stats.Propulsion[propName].Id}`)
    const propObj = {...Stats.Propulsion[propName], ...{'name': propName, 'id': Stats.Propulsion[propName].Id}};       // adds user-friendly 'name' & id
    PROPULSIONS[propName] = propObj;
});

/* 
For each propulsion e.g. PROPULSIONS["Hover"], the parameters are:
-   [Parameter]         | [Example value, raw]  | [Comment]
-   Acceleration        | 250                   | (int)
-   BuildPower          | 150                   | (int)
-   BuildTime           | 100                   | (int)
-   Deceleration        | 800                   | (int)
-   HitPointPct         | 100                   | (int)
-   HitPoints           | 0                     | (int)
-   HitpointPctOfBody   | 100                   | (int)
-   Id                  | "hover01"             | (str)
-   MaxSpeed            | 300                   | (int)
-   SkidDeceleration    | 120                   | (int)
-   SpinAngle           | 180                   | (int)
-   SpinSpeed           | 136                   | (int)
-   TurnSpeed           | 60                    | (int)
-   Weight              | 200                   | (int)  
-   name                | "Hover"               | (str) Human-readable name (added by FishBot)
-   id                  | "hover01"             | (str) same as Id (added by FishBot)
*/


const GROUND_PROPULSIONS = [PROPULSIONS["Wheels"], PROPULSIONS["Half-tracks"], PROPULSIONS["Tracks"]];
const HOVER_PROPULSIONS = [PROPULSIONS["Hover"]];
const VTOL_PROPULSIONS = [PROPULSIONS["VTOL"]];
const CYBORG_PROPULSIONS = [PROPULSIONS["Cyborg Propulsion"]];

