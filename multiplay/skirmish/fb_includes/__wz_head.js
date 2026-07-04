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
 * This file contains game constants (from the Stats global) which are used throughout the code.
 * As such, it should be included first.
*/

const baseLocation = startPositions[me];

const WZ2100_TILERANGE_SCALING_FACTOR = 1 / 128;

/*
    RESEARCH INFORMATION
*/
const RESEARCHES = {};
const RESEARCHES_BY_ID = {};

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

const IRRELEVANT_RESEARCHES = [];

let CANNON_RESEARCHES = [];
let GAUSS_CANNON_RESEARCHES = [];
let ROCKET_RESEARCHES = [];
let MISSILE_RESEARCHES = [];
let MORTAR_RESEARCHES = [];
let HOWITZER_RESEARCHES = [];
let MACHINEGUN_RESEARCHES = [];
let LASER_RESEARCHES = [];
let AA_DIRECT_FIRE_RESEARCHES = [];
let AA_ROCKET_RESEARCHES = [];
let VTOL_BOMB_RESEARCHES = [];
let FLAMER_RESEARCHES = [];
let DEFENSIVE_STRUCTURE_RESEARCHES = [];
let CYBORG_TYPE_RESEARCHES = [];
let KINETIC_ARMOUR_RESEARCHES = [];
let HEAT_ARMOUR_RESEARCHES = [];
let BODY_RESEARCHES = [];
let PROPULSION_RESEARCHES = [];
let SENSOR_UPGRADE_RESEARCHES = [];
let STRUCTURE_UPGRADE_RESEARCHES = []; 
let SYSTEM_UPGRADE_RESEARCHES = [];
let UNCLASSIFIED_RESEARCHES = [];

for (const key in Stats.Research) {
    if (!Object.hasOwnProperty.call(Stats.Research, key)) { 
        // This checks if the object property is owned by Stats.Weapon and not Object.prototype (parent object)
        continue;
    }

    if (IRRELEVANT_RESEARCHES.some(irrelevantText => key.includes(irrelevantText))) {
        continue;       
    }

    let r = Stats.Research[key];
     // add user-friendly 'name' & id
    r['name'] = key;
    r['id'] = r.Id;      

    // Add to RESEARCHES global
    RESEARCHES[key] = r;
    RESEARCHES_BY_ID[r.Id] = r;

    const checkForKeywords = (inputID, searchKeywords, excludeKeywords=[]) => searchKeywords.some(keyword => inputID.includes(keyword)) && !excludeKeywords.some(keyword => inputID.includes(keyword));
    
    /*
        Notes for implementation: 
         -  Below categories should align with FishBot weapon classes & areas of interest
         -  Note: T3 weapon research trees diverge from previous weapon researches so they are classified separately here
            - Cannon -> Gauss Cannon
            - Rocket -> Missile
            - Mortar -> Howitzer
            - Machinegun -> Laser
            - Flamer -> Plasma weapons (combined)
    */  

    if (checkForKeywords(r.id, ["R-Defense"], ["R-Defense-TankTrap", "R-Defense-HardcreteGate", "EMP"])) {
        // This should be first to filter out fortress structures e.g. "R-Defense-Super-Missile"
        DEFENSIVE_STRUCTURE_RESEARCHES.push(r);

    } else if (checkForKeywords(r.id, ["R-Wpn-Cannon"])) {
        CANNON_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Wpn-Rail"])) {
        GAUSS_CANNON_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["Rocket"])) {
        ROCKET_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["SAM", "R-Wpn-Sunburst"])) {
        // This captures SAM researches e.g. e.g. "R-Wpn-Missile-HvSAM"; this should be before other missile researches. 
        AA_ROCKET_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["Missile"])) {
        MISSILE_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Wpn-MG"])) {
        MACHINEGUN_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Wpn-Mortar"], ["R-Wpn-MortarEMP"])) {
        MORTAR_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Wpn-Howitzer", "R-Wpn-HvyHowitzer"])) {
        HOWITZER_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Wpn-AAGun", "R-Wpn-AALaser"])) {
        AA_DIRECT_FIRE_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Wpn-Bomb"])) {
        VTOL_BOMB_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Wpn-Laser", "R-Wpn-Energy", "R-Wpn-HvyLaser", "R-Wpn-ParticleGun"])) {
        LASER_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["Flame", "R-Wpn-PlasmaCannon", "R-Wpn-HeavyPlasmaLauncher"])) {
        FLAMER_RESEARCHES.push(r);

    } else if (checkForKeywords(r.id, ["R-Vehicle-Metals", "R-Cyborg-Metals"])) {
        KINETIC_ARMOUR_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ['R-Cyborg-Armor-Heat', 'R-Vehicle-Armor-Heat'])) {
        HEAT_ARMOUR_RESEARCHES.push(r);    
    } else if (checkForKeywords(r.id, ['R-Vehicle-Body'])) {
        BODY_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ['R-Vehicle-Prop', 'R-Vehicle-Engine'])) {
        PROPULSION_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Cyborg"], ["R-Cyborg-Transport"])) {
        // This should be after R-Cyborg-Metals so it only captures new cyborg designs
        CYBORG_TYPE_RESEARCHES.push(r);   

    } else if (checkForKeywords(r.id, ['R-Struc'])) {
        STRUCTURE_UPGRADE_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ["R-Sys-Sensor"])) {
        SENSOR_UPGRADE_RESEARCHES.push(r);
    } else if (checkForKeywords(r.id, ['R-Sys'], ["R-Sys-Spade1Mk1", "R-Sys-VTOLStrike","R-Sys-VTOLCBS", "R-Sys-Spy", "R-Sys-RadarDetector"])) {
        SYSTEM_UPGRADE_RESEARCHES.push(r);
    } else {
        // Any researches in this category are ignored.
        UNCLASSIFIED_RESEARCHES.push(r);
    }

}
Object.freeze(RESEARCHES);

if (false) {
    debug(`CANNON_RESEARCHES`);
    CANNON_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`GAUSS_CANNON_RESEARCHES`);
    GAUSS_CANNON_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`ROCKET_RESEARCHES`);
    ROCKET_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`MISSILE_RESEARCHES`);
    MISSILE_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`MACHINEGUN_RESEARCHES`);
    MACHINEGUN_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`LASER_RESEARCHES`);
    LASER_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`MORTAR_RESEARCHES`);
    MORTAR_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`HOWITZER_RESEARCHES`);
    HOWITZER_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`VTOL_BOMB_RESEARCHES`);
    VTOL_BOMB_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`AA_DIRECT_FIRE_RESEARCHES`);
    AA_DIRECT_FIRE_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`AA_ROCKET_RESEARCHES`);
    AA_ROCKET_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`FLAMER_RESEARCHES`);
    FLAMER_RESEARCHES.forEach(r => debug(`\t${r.name}`));

    debug(`KINETIC_ARMOUR_RESEARCHES`);
    KINETIC_ARMOUR_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`HEAT_ARMOUR_RESEARCHES`);
    HEAT_ARMOUR_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`BODY_RESEARCHES`);
    BODY_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`PROPULSION_RESEARCHES`);
    PROPULSION_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`CYBORG_TYPE_RESEARCHES`);
    CYBORG_TYPE_RESEARCHES.forEach(r => debug(`\t${r.name}`));

    debug(`STRUCTURE_UPGRADE_RESEARCHES`);
    STRUCTURE_UPGRADE_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`SENSOR_UPGRADE_RESEARCHES`);
    SENSOR_UPGRADE_RESEARCHES.forEach(r => debug(`\t${r.name}`));
    debug(`SYSTEM_UPGRADE_RESEARCHES`);
    SYSTEM_UPGRADE_RESEARCHES.forEach(r => debug(`\t${r.name}`));

    debug(`DEFENSIVE_STRUCTURE_RESEARCHES`);
    DEFENSIVE_STRUCTURE_RESEARCHES.forEach(r => debug(`\t${r.name}`));

    debug(`UNCLASSIFIED_RESEARCHES`);
    UNCLASSIFIED_RESEARCHES.forEach(r => debug(`\t${r.name}`));
}

/*
    STRUCTURE INFORMATION
*/

/**
    ```STRUCTURES```: Object which contains all WZ2100 structure information extracted from the Stats global.
*/
let STRUCTURES = {};
let BASE_STRUCTURES = {};   

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

const IRRELEVANT_STRUCTURES = ["*", "Scavenger", "BaBa", "Collective", "New Paradigm", "Missile Silo", "Downed Transport", "NEXUS Wall", "NEXUS CWall"];

for (const key in Stats.Building) {
    if (!Object.hasOwnProperty.call(Stats.Building, key)) { 
        // This checks if the object property is owned by Stats.Building and not Object.prototype (parent object)
        continue;
    }

    if (IRRELEVANT_STRUCTURES.some(irrelevantText => key.includes(irrelevantText))) {
        continue;       
    }

    let s = Stats.Building[key];
     // add user-friendly 'name' & id
    s['name'] = key;
    s['id'] = s.Id;      

    // Add to core STRUCTURES lookup table
    STRUCTURES[key] = s;

    // Add to BASE_STRUCTURES lookup table (BASE_STRUCTURES currently has no use in v0.3.1)
    if (s.Type === "Structure") {
        // base structures have 'Type' = "Structure"
        BASE_STRUCTURES[key] = s;       
    }
}
Object.freeze(STRUCTURES);
Object.freeze(BASE_STRUCTURES);

// These are here for reference / copy-pasting into other parts of the code.
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
const v462_DEFENCES_NAMES = [
"AA Cyclone Flak Cannon Emplacement", 
"AA Cyclone Flak Cannon Hardpoint", 
"AA Tornado Flak Cannon Emplacement", 
"AA Tornado Flak Cannon Hardpoint", 
"Archangel Missile Emplacement", 
"Assault Cannon Guard Tower", 
"Assault Cannon Hardpoint", 
"Assault Gun Emplacement", 
"Assault Gun Hardpoint", 
"Assault Gun Tower", 
"Avenger Hardpoint", 
"Avenger SAM Site", 
"Bombard Pit",
"CB Tower", 
"Cannon Fortress", 
"Cannon Tower", 
"Demolish Structure", 
"EMP Cannon Hardpoint", 
"EMP Mortar Pit", 
"Flamer Bunker", 
"Flamer Guard Tower", 
"Flamer Hardpoint", 
"Flashlight Emplacement", 
"Gauss Cannon Emplacement", 
"Gauss Cannon Hardpoint", 
"Ground Shaker Emplacement", 
"HMG Bunker", 
"Hardcrete Corner Wall", 
"Hardcrete Gate", 
"Hardcrete Wall", 
"Hardened Sensor Tower", 
"Heavy Cannon Hardpoint", 
"Heavy Laser Emplacement", 
"Heavy Machinegun Bunker", 
"Heavy Machinegun Guard Tower", 
"Heavy Machinegun Hardpoint", 
"Heavy Machinegun Tower", 
"Heavy Plasma Launcher Emplacement",
"Heavy Rocket Bastion", 
"Heavy Rocket Battery", 
"Hellstorm Emplacement", 
"Howitzer Emplacement", 
"Hurricane AA Site", 
"Hyper Velocity Cannon Emplacement", 
"Hyper Velocity Cannon Hardpoint", 
"Incendiary Howitzer Emplacement", 
"Incendiary Howitzer Emplacement 2", 
"Incendiary Mortar Pit", 
"Incendiary Mortar Pit 2", 
"Inferno Bunker", 
"Inferno Hardpoint", 
"Jammer Tower", 
"Lancer Bunker", 
"Lancer Hardpoint", 
"Lancer Tower", 
"Light Cannon Bunker", 
"Light Cannon Hardpoint", 
"Look-Out Tower", 
"Mass Driver Fortress", 
"Medium Cannon Hardpoint", 
"Mini-Rocket Battery", 
"Mini-Rocket Tower", 
"Missile Fortress", 
"Mortar Pit", 
"Needle Gun Tower", 
"Nexus Link Tower", 
"Particle Gun Emplacement", 
"Pepperpot Pit", 
"Plasma Cannon Emplacement", 
"Plasmite Flamer Bunker", 
"Pulse Laser Emplacement", 
"Pulse Laser Hardpoint", 
"Pulse Laser Tower", 
"Radar Detector Tower", 
"Rail Gun Hardpoint", 
"Railgun Emplacement", 
"Ripple Rocket Battery", 
"Rotary MG Bunker", 
"Scourge Missile Hardpoint", 
"Scourge Missile Tower", 
"Sensor Tower", 
"Seraph Missile Battery", 
"Stormbringer Emplacement", 
"Sunburst AA Site", 
"Tank Killer Emplacement", 
"Tank Killer Hardpoint", 
"Tank Traps", 
"Twin Assault Cannon Bunker", 
"Twin Assault Gun Hardpoint", 
"Twin Machinegun Bunker", 
"Twin Machinegun Guard Tower", 
"VTOL CB Tower", 
"VTOL Strike Tower", 
"Vindicator Hardpoint", 
"Vindicator SAM Site", 
"Whirlwind AA Site", 
"Whirlwind Hardpoint", 
"Wide Spectrum Sensor Tower"
];


/*
    VEHICLE BODY INFORMATION
*/
let FISHBOT_BODIES = [];            // want this to be an array of objects because this will be regularly iterated through

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

const FISHBOT_BODY_LIST_ORDERED = ["Viper", "Cobra", "Python", "Mantis", "Leopard", "Panther", "Tiger", "Retaliation", "Retribution", "Vengeance"];       // this is ordered in order of technological sophistication (used in production)
FISHBOT_BODY_LIST_ORDERED.forEach((bodyName) => {
    const bodyObj = {...Stats.Body[bodyName], ...{'name': bodyName, 'id': Stats.Body[bodyName].Id}};       // adds user-friendly 'name' & id
    FISHBOT_BODIES.push(bodyObj);
});
// FISHBOT_BODIES.forEach((body) => debug( `${body.name}: ${body.Id}, ${body.Size}`));

const BODY_WEIGHT = {
    LIGHT: 0,
    MEDIUM: 1,
    HEAVY: 2
};
Object.freeze(BODY_WEIGHT);

/*
    PROPULSION INFORMATION
*/
let PROPULSIONS = {};

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

const PROPULSION_LIST = ["Cyborg Propulsion", "Wheels", "Half-tracks", "Tracks", "Hover", "VTOL"];
PROPULSION_LIST.forEach(propName => {
    // debug(  `Stats.Propulsion[propName] ${Stats.Propulsion[propName]}, propName ${propName}, id ${Stats.Propulsion[propName].Id}`)
    const propObj = {...Stats.Propulsion[propName], ...{'name': propName, 'id': Stats.Propulsion[propName].Id}};       // adds user-friendly 'name' & id
    PROPULSIONS[propName] = propObj;
});
Object.freeze(PROPULSIONS);

const GROUND_PROPULSIONS = [PROPULSIONS["Wheels"], PROPULSIONS["Half-tracks"], PROPULSIONS["Tracks"]];
const HOVER_PROPULSIONS = [PROPULSIONS["Hover"]];
const VTOL_PROPULSIONS = [PROPULSIONS["VTOL"]];
const CYBORG_PROPULSIONS = [PROPULSIONS["Cyborg Propulsion"]];

/*
    WEAPON INFORMATION
*/

let WEAPONS = {};

/* 
For each weapon e.g. WEAPONS["Lancer"], the parameters are:
-   [Parameter]             | [Example value, raw]  | [Comment]
-   AllowedOnTransporter    | false                 | (bool)
-   BuildPower              | 150                   | (int)
-   BuildTime               | 500                   | (int)
-   Damage                  | 105                   | (int)
-   Effect                  | "ANTI TANK"           | (str)
-   EmpRadius               | 0                     | (int)
-   FireOnMove              | true                  | (bool)
-   FirePause               | 100                   | (int)
-   FlightSpeed             | 1700                  | (int)
-   HitChance               | 60                    | (int)
-   HitPointPct             | 100                   | (int)
-   HitPoints               | 20                    | (int)
-   Id                      | "Rocket-LtA-T"        | (str)
-   ImpactClass             | "ROCKET"              | (str)  
-   ImpactType              | "KINETIC"             | (str) 
-   MaxElevation            | 90                    | (int)
-   MaxRange                | 1152                  | (int) Weapon range; divide by WZ2100_TILERANGE_SCALING_FACTOR (= 128) for the distance in tiles e.g. 1152 / 128 = 9 tiles
-   MinElevation            | -60                   | (int)
-   MinRange                | 128                   | (int)
-   MinimumDamage           | 33                    | (int)
-   NoFriendlyFire          | false                 | (bool)
-   Penetrate               | false                 | (bool)
-   Radius                  | 0                     | (int)
-   RadiusDamage            | 0                     | (int)
-   Recoil                  | 0                     | (int)
-   ReloadTime              | 16000                 | (int) reload time; my assumption is that this is without modifiers, and is measured in ms
-   RepeatClass             | "ROCKET"              | (str)
-   RepeatDamage            | 0                     | (int)
-   RepeatRadius            | 0                     | (int)
-   RepeatTime              | 0                     | (int)
-   RepeatType              | "KINETIC"             | (str)
-   Rotate                  | 180                   | (int)
-   Rounds                  | 2                     | (int)
-   ShootInAir              | false                 | (bool) seems to be equivalent to 'canHitAir'     
-   ShootOnGround           | true                  | (bool) seems to be equivalent to 'canHitGround'
-   ShortHitChance          | 30                    | (int)
-   ShortRange              | 512                   | (int)
-   Weight                  | 250                   | (int)
-   name                    | "Lancer"              | (str) Human-readable name (added by FishBot)
-   id                      | "Rocket-LtA-T"        | (str) same as Id (added by FishBot)
*/

const MAX_SHORT_RANGE_ARTILLERY_RADIUS = 24;

const IRRELEVANT_WEAPONS = ["*", "ZNULLWEAPON"];

let MACHINEGUN_WEAPONS = [];
let FLAMER_WEAPONS = [];
let CANNON_WEAPONS = [];
let AT_ROCKET_WEAPONS = [];
let VTOL_ARTILLERY_WEAPONS = [];
let SHORT_RANGE_ARTILLERY_WEAPONS = [];
let LONG_RANGE_ARTILLERY_WEAPONS = [];
let AA_DIRECT_FIRE_WEAPONS = [];
let AA_ROCKET_WEAPONS = [];
let LASER_WEAPONS = [];
let UNCLASSIFIED_WEAPONS = [];


for (const key in Stats.Weapon) {
    if (!Object.hasOwnProperty.call(Stats.Weapon, key)) { 
        // This checks if the object property is owned by Stats.Weapon and not Object.prototype (parent object)
        continue;
    }

    if (IRRELEVANT_WEAPONS.some(irrelevantText => key.includes(irrelevantText))) {
        continue;       
    }

    let w = Stats.Weapon[key];
     // add user-friendly 'name' & id
    w['name'] = key;
    w['id'] = w.Id;      

    // Add to WEAPONS global
    WEAPONS[key] = w;       // Append new key

    // Filter out artillery first
    if (w["Effect"] === "ARTILLERY ROUND" && !w["name"].includes("VTOL")) {
        if (w["MaxRange"] >= MAX_SHORT_RANGE_ARTILLERY_RADIUS * (1 / WZ2100_TILERANGE_SCALING_FACTOR)) {
            // e.g. Archangel Missile, Howitzers
            LONG_RANGE_ARTILLERY_WEAPONS.push(w);
        } else {
            SHORT_RANGE_ARTILLERY_WEAPONS.push(w);
        }       
        continue;
    }

    // Filter out AA next
    if (w["ShootInAir"] && !w["ShootOnGround"]) {
        switch(w["ImpactClass"]) {
            case "MISSILE":
            case "ROCKET":
                AA_ROCKET_WEAPONS.push(w);
                break;
            case "A-A GUN":
            case "ENERGY":
            case "CANNON":
                AA_DIRECT_FIRE_WEAPONS.push(w);
                break;
            default:
                UNCLASSIFIED_WEAPONS.push(w);
                break;
        }
        continue;
    }

    // NOTE: for some reason (WZ2100 v4.6.3): "Assault Cannon"["Effect"] === "ANTI AIRCRAFT"

    // Classify the rest 
    switch(w["ImpactClass"]) {
        case "MISSILE":
        case "ROCKET":
            AT_ROCKET_WEAPONS.push(w);
            break;
        case "GAUSS":
        case "CANNON":
            CANNON_WEAPONS.push(w);
            break;
        case "MACHINE GUN":
            MACHINEGUN_WEAPONS.push(w);
            break;
        case "BOMB":
            VTOL_ARTILLERY_WEAPONS.push(w);
            break;
        case "FLAME":
            FLAMER_WEAPONS.push(w);
            break;
        case "ENERGY":
            LASER_WEAPONS.push(w);
            break;
        default:
            UNCLASSIFIED_WEAPONS.push(w);
            break;
    }
    continue;
}

// The following weapons are not included in the `Stats.Weapon` global in WZ2100 v4.6.3, so they are manually added here:
WEAPONS["Truck"] = {id: "Spade1Mk1", name: "Truck"};
WEAPONS["Cyborg Constructor"] = {id: "CyborgSpade", name: "Cyborg Constructor"};        
WEAPONS["Sensor Turret"] = {id: "SensorTurret1Mk1", name: "Sensor Turret"};
WEAPONS["CB Radar Turret"] = {id: "Sys-CBTurret01", name: "CB Radar Turret"};
WEAPONS["Wide Spectrum Sensor"] = {id: "Sensor-WideSpec", name: "Wide Spectrum Sensor"};
WEAPONS["Heavy Repair Turret"] = {id: "HeavyRepair", name: "Heavy Repair Turret"};
UNCLASSIFIED_WEAPONS.push(WEAPONS["Truck"], WEAPONS["Sensor Turret"], WEAPONS["CB Radar Turret"], WEAPONS["Wide Spectrum Sensor"]);
Object.freeze(WEAPONS);

if (false) {
    debug(`MACHINEGUN_WEAPONS`);
    MACHINEGUN_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`FLAMER_WEAPONS`);
    FLAMER_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`CANNON_WEAPONS`);
    CANNON_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`AT_ROCKET_WEAPONS`);
    AT_ROCKET_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`VTOL_ARTILLERY_WEAPONS`);
    VTOL_ARTILLERY_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`SHORT_RANGE_ARTILLERY_WEAPONS`);
    SHORT_RANGE_ARTILLERY_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`LONG_RANGE_ARTILLERY_WEAPONS`);
    LONG_RANGE_ARTILLERY_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`AA_DIRECT_FIRE_WEAPONS`);
    AA_DIRECT_FIRE_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`AA_ROCKET_WEAPONS`);
    AA_ROCKET_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`LASER_WEAPONS`);
    LASER_WEAPONS.forEach(w => debug(`\t${w.name}`));
    debug(`UNCLASSIFIED_WEAPONS`);
    UNCLASSIFIED_WEAPONS.forEach(w => debug(`\t${w.name}`));
}
