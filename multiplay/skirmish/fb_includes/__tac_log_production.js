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

/**
 * Wraps `buildDroid()` from the JSAPI, which causes the specified unit to be produced in the specified factory.
 * @param {StructureObject} factory 
 * @param {string} droidName 
 * @param {string} bodies 
 * @param {string} propulsions 
 * @param {string} weapon 
 * @returns {boolean} whether or not the unit is now in production in the specified factory.
 */
function buildDroidWrapper(factory, droidName, bodies, propulsions, weapon) {
	const productionStarted = buildDroid(factory, droidName, bodies, propulsions, null, "", weapon);
	return productionStarted;
}

/**
 * Filters out all unavailable bodies, then selects the most technologically advanced body (within the capability of the factory) from the provided `bodies` array.
 * @returns {any | undefined}
 */
function chooseVehicleBody({bodies=[], factory=undefined, maxFactoryModules=undefined, unitsDesignable=true}) {
	// TODO: add typing
	const DEBUG_MODE = false;
	
	if (!defined(bodies) || !defined(factory) || !defined(maxFactoryModules)) {
		debug("chooseVehicleBody(): either 'bodies' and/or 'factory' and/or maxFactoryModules is missing.");
		return undefined;		
	}

	const FACTORY_TYPES = [FACTORY, VTOL_FACTORY];
	if (!FACTORY_TYPES.includes(factory.stattype) || !defined(factory.modules)) {
		debug("chooseVehicleBody(): 'factory' is not a WZ FACTORY/VTOL_FACTORY and/or 'factory.modules' is not defined.");
		return undefined;
	}

	if (!unitsDesignable) {
		return FISHBOT_BODIES[0];		// First body in the bodies list will be selected (should be Viper)
	}

	const availableBodies = FISHBOT_BODIES.filter((body) => componentAvailable(body.Id)).reverse();		// reversing goes from highest tech to lowest tech

	if (DEBUG_MODE) {
		debug("available bodies");
		availableBodies.forEach(body => debug(`	${body.name}`));
	}

	const maximumBodyWeight = Math.min(maxFactoryModules, factory.modules);		// weight = number of modules -> LIGHT = 0 modules ; MEDIUM = 1 module ; HEAVY = 2 modules

	for (let w=maximumBodyWeight; w>=0; --w) {
		// Tries to pick the highest-weight, most-technologically-advanced body first, then decreases the body weight (modules required) towards 0 if there are none available
		const sortedBodies = availableBodies.filter((body) => body.Size === w);
		if (sortedBodies.length === 0) {
			continue;
		}

		if (DEBUG_MODE) {
			debug(`chooseVehicleBody(): selected ${sortedBodies[0].name}, maxWeight = ${maximumBodyWeight}`);
		}
		return sortedBodies[0];
	}

	return undefined;
}

/**
 * Selects the most technologically advanced weapon from the provided `weaponList`.
 * Assumption: the list is pre-sorted in order of priority before it enters this function
 * @param {any[]} weaponList
 * @returns {any | undefined} TODO: add typing
 */
function chooseWeapon(weaponList) {

	if (weaponList == null) {
		debug("chooseWeapon(): weaponList was not passed to this function.")
		return undefined;
	}

	if (weaponList.length === 0) {
		debug("chooseWeapon(): weaponList was empty.");
		return undefined;
	}
	
	const availableWeapons = weaponList.filter((weapon) => componentAvailable(weapon.id));		

	if (availableWeapons.length === 0) {
		debug("chooseWeapon(): None of the passed weapons were available.")
		return undefined;
	}

	// debug(`chooseWeapon(): selected ${availableWeapons[0].name}`);
	return availableWeapons[0];		
}

/**
 * Chooses the most technologically advanced propulsion from the provided `propulsionList`.
 * @param {any[]} propulsionList 		
 * @param {boolean} unitsDesignable used to prevent FishBot from building any other units other than `Truck Viper Wheels` before the Command Center is built
 * @returns {any | undefined} TODO: add typing
 */
function choosePropulsion(propulsionList, unitsDesignable=true) {
	if (propulsionList == null) {
		debug("choosePropulsion(): Input parameter 'propulsionList' is missing.")
		return undefined;
	}

	if (!unitsDesignable) {
		return PROPULSIONS["Wheels"];
	}

	// propulsionList.forEach(p => debug(`		testing: ${p.name}, ${p.id}, ${p.Id}`));
	const availablePropulsions = propulsionList.filter((p) => componentAvailable(p.id));
	if (availablePropulsions.length === 0) {
		debug("choosePropulsion(): No technologically-available propulsion in 'propulsionList'.");
		return undefined;
	}

	return availablePropulsions[0];
}

/**
 * Attempts to produce a unit (to the provided specification) at the specified factory.
 * @returns {boolean} whether or not the unit is now in production in the specified factory.
 */
function produceVehicle({factory, weaponList, propulsionList, maxBodyWeight=BODY_WEIGHT.HEAVY, unitsDesignable=true}) {

	let maxRequiredModules;
	switch (maxBodyWeight) {
		case BODY_WEIGHT.LIGHT:
			maxRequiredModules = 0;
			break;
		case BODY_WEIGHT.MEDIUM:
			maxRequiredModules = 1;
			break;
		case BODY_WEIGHT.HEAVY:
			maxRequiredModules = 2;
			break;
		default:
			maxRequiredModules = 0;
	}
		
	const body = chooseVehicleBody({bodies: FISHBOT_BODIES, factory: factory, maxFactoryModules: maxRequiredModules, unitsDesignable: unitsDesignable});		

	// Select most up-to-date weapon
	const weapon = chooseWeapon(weaponList);

	// Select available (ground) propulsion
	const propulsion = choosePropulsion(propulsionList, unitsDesignable);
	
	if (!defined(body) || !defined(weapon) || !defined(propulsion)) {
		debug("produceVehicle(): Either 'body' or 'weapon' or 'propulsion' were undefined.")
		return false;
	}
		
	const tankName = weapon.name + ", " + body.name + ", " + propulsion.name +  ` (FishBot v${FISHBOT_VERSION})`;

	const productionInProgress = buildDroidWrapper(factory, tankName, body.id, propulsion.id, weapon.id);
	return productionInProgress;
}


/*
	LOGISTICS UNIT PRODUCTION
*/
/**
 * Produces a truck. FishBot will only produce 'Truck Viper Wheels' when units are not designable (to follow human player rules).
 * @param {StructureObject} factory 
 * @param {boolean} unitsDesignable 
 * @returns {boolean} whether or not the unit is now in production
 */
function produceTruck(factory, unitsDesignable) {

	const truckTurrets = [
		WEAPONS["Truck"]
	];

	const truckPropulsions = [
		PROPULSIONS["Wheels"],
		PROPULSIONS["Hover"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: truckTurrets, 
		propulsionList: truckPropulsions, 
		maxBodyWeight: BODY_WEIGHT.LIGHT,
		unitsDesignable: unitsDesignable		// this flag is here to prevent FishBot from producing Hover Trucks before a command center is built
	});
}

/**
 * Produces a cyborg constructor (Combat Engineer) unit.
 * @param {StructureObject} factory 
 * @returns 
 */
function produceCombatEngineer(factory) {
	const combatEngineer = { 
		name: 'Combat Engineer',
		body: "CyborgLightBody", 
		prop: PROPULSIONS["Cyborg Propulsion"].id, 
		weapon: WEAPONS["Cyborg Constructor"].id,
	}; 

	const cyborgName = combatEngineer.name + ` (FishBot v${FISHBOT_VERSION})`;
	const productionInProgress = buildDroidWrapper(factory, cyborgName, combatEngineer.body, combatEngineer.prop, combatEngineer.weapon);
	return productionInProgress;
}

/*
	AIR COMBAT UNIT PRODUCTION
*/

function produceCloseAirSupport(factory) {

	const fishBotCASWeapons = [
		WEAPONS["VTOL Hyper Velocity Cannon"],
		WEAPONS["VTOL Assault Cannon"],
		WEAPONS["VTOL Needle Gun"],
		WEAPONS["VTOL Rail Gun"]
	].reverse();

	const vtolPropulsions = [
		PROPULSIONS["VTOL"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: fishBotCASWeapons, 
		propulsionList: vtolPropulsions, 
		maxBodyWeight: BODY_WEIGHT.MEDIUM
	});
}

function produceDeepAirSupport(factory) {

	const fishBotDASWeapons = [
		WEAPONS["Cluster Bomb"],
		WEAPONS["HEAP Bomb"],
		WEAPONS["Phosphor Bomb"],
		WEAPONS["Thermite Bomb"],
		WEAPONS["Plasmite Bomb"]
	].reverse();

	const vtolPropulsions = [
		PROPULSIONS["VTOL"],
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: fishBotDASWeapons, 
		propulsionList: vtolPropulsions, 
		maxBodyWeight: BODY_WEIGHT.MEDIUM
	});
}

/*
	GROUND COMBAT UNIT PRODUCTION
*/
function produceLightCavalry(factory) {
	// Light cavalry is mobile, lightly armoured, medium armament

	// Order these by tech level if you want the most technologically advanced weapon to be used
	const lightCavalryWeapons = [
		WEAPONS["Machinegun"],
		WEAPONS["Twin Machinegun"],
		WEAPONS["Heavy Machinegun"],
		WEAPONS["Assault Gun"],
		WEAPONS["Twin Assault Gun"],
	].reverse();
	
	const lightCavalryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"], 
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: lightCavalryWeapons, 
		propulsionList: lightCavalryPropulsions,
		maxBodyWeight: BODY_WEIGHT.HEAVY
	});
}

function produceHeavyCavalry(factory) {
	// Heavy cavalry has heavy armour, heavy armament but has slow speed
	// Requires combined arms to be truly effective

	// Order these by tech level if you want the most technologically advanced body to be used
	const heavyCavalryWeapons = [
		WEAPONS["Light Cannon"],
		WEAPONS["Medium Cannon"],
		WEAPONS["Hyper Velocity Cannon"],
		WEAPONS["Assault Cannon"],
		WEAPONS["Heavy Cannon"],
		WEAPONS["Twin Assault Cannon"],
		WEAPONS["Needle Gun"],
		WEAPONS["Rail Gun"],
		WEAPONS["Gauss Cannon"],
	].reverse();
	
	const heavyCavalryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"], 
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: heavyCavalryWeapons, 
		propulsionList: heavyCavalryPropulsions,
		maxBodyWeight: BODY_WEIGHT.HEAVY
	});
}

function produceHeavyRepair(factory) {
	// A cool idea from another bot; with sufficient heavy repair mass, it is possible to keep a unit alive almost indefinitely.
	// Order these by tech level if you want the most technologically advanced body to be used.
	const heavyCavalryWeapons = [
		WEAPONS['Heavy Repair Turret']
	].reverse();
	
	const heavyCavalryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"], 
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: heavyCavalryWeapons, 
		propulsionList: heavyCavalryPropulsions,
		maxBodyWeight: BODY_WEIGHT.HEAVY
	});
}


function produceLandAPFireSupport(factory) {
	// Order these by tech level if you want the most technologically advanced weapon to be used
	const fireSupportWeapons = [
		WEAPONS["Mortar"],
		WEAPONS["Bombard"],
		WEAPONS["Pepperpot"],
		WEAPONS["Incendiary Mortar"],
		WEAPONS["Incendiary Howitzer"],
	].reverse();
	
	const fireSupportPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"],
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: fireSupportWeapons, 
		propulsionList: fireSupportPropulsions, 
		maxBodyWeight: BODY_WEIGHT.LIGHT
	});
}

function produceLandFireSupportGeneric(factory) {
	// Part of the combined arms strategy

	// Order these by tech level if you want the most technologically advanced weapon to be used
	const fireSupportWeapons = [
		WEAPONS["Mortar"],
		WEAPONS["Bombard"],
		WEAPONS["Pepperpot"],
		WEAPONS["Hellstorm"],		// Rotary Howitzer
	].reverse();
	
	const fireSupportPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"],
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: fireSupportWeapons, 
		propulsionList: fireSupportPropulsions, 
		maxBodyWeight: BODY_WEIGHT.LIGHT
	});
}

function produceHighVolumeAAUnit(factory) {

	// Order these by tech level if you want the most technologically advanced weapon to be used
	const shortRangeAAWeapons = [
		WEAPONS["Hurricane AA Turret"],
		WEAPONS["Whirlwind AA Turret"]
	].reverse();
	
	const airDefenceArtilleryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"],
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: shortRangeAAWeapons, 
		propulsionList: airDefenceArtilleryPropulsions, 
		maxBodyWeight: BODY_WEIGHT.MEDIUM
	});
}

function produceAAFlakUnit(factory) {

	// Order these by tech level if you want the most technologically advanced weapon to be used
	const airDefenceArtilleryWeapons = [
		WEAPONS["AA Cyclone Flak Cannon"],
		WEAPONS["AA Tornado Flak Cannon"]
	].reverse();
	
	const airDefenceArtilleryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"],
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: airDefenceArtilleryWeapons, 
		propulsionList: airDefenceArtilleryPropulsions, 
		maxBodyWeight: BODY_WEIGHT.HEAVY
	});
}

function produceLandRecon(factory) {
	// Order these by tech level if you want the most technologically advanced weapon to be used
	const sensors = [
		WEAPONS["Sensor Turret"],
		WEAPONS["CB Radar Turret"],
		WEAPONS["Wide Spectrum Sensor"]
	].reverse();
	
	const sensorPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"]
	].reverse();

	return produceVehicle({
		factory: factory, 
		weaponList: sensors, 
		propulsionList: sensorPropulsions, 
		maxBodyWeight: BODY_WEIGHT.MEDIUM
	});
}

/**
 * Produces a combat cyborg (infantry) unit.
 * @param {StructureObject} factory 
 * @returns 
 */
function produceInfantry(factory) {

	// Arrange in ascending order of technological sophisitication
	const fishBotCyborgs = [
		// { res: "R-Wpn-Cannon1Mk1", body: "CyborgLightBody", name: 'Heavy Gunner', prop: "CyborgLegs", weapon: [ "CyborgCannon", ] },
		{ res: "R-Wpn-Mortar01Lt", body: "CyborgLightBody", name: 'Grenadier', prop: "CyborgLegs", weapon: "Cyb-Wpn-Grenade" },
		{ res: "R-Wpn-MG4", body: "CyborgLightBody", name: 'Assault Gunner', prop: "CyborgLegs", weapon: "CyborgRotMG" },
		// { res: "R-Wpn-Rocket01-LtAT", body: "CyborgLightBody", name: 'AT Crew', prop: "CyborgLegs", weapon: "CyborgRocket" },
		// { res: "R-Wpn-MG4", body: "CyborgHeavyBody", name: 'Super HVC Cyborg', prop: "CyborgLegs", weapon: "Cyb-Hvywpn-HPV" },
		{ res: "R-Cyborg-Hvywpn-Acannon", body: "CyborgHeavyBody", name: 'Super Auto-Cannon Cyborg', prop: "CyborgLegs", weapon: "Cyb-Hvywpn-Acannon" }, // ac super
		// { res: "R-Wpn-RailGun01", body: "CyborgLightBody", name: 'Needle Gunner', prop: "CyborgLegs", weapon: "Cyb-Wpn-Rail1" }, 
		// { res: "R-Wpn-Laser01", body: "CyborgLightBody", name: 'Flashlight Gunner', prop: "CyborgLegs", weapon: "Cyb-Wpn-Laser" }, 
		// { res: "R-Cyborg-Hvywpn-PulseLsr", body: "CyborgHeavyBody", name: 'Super Pulse Laser Cyborg', prop: "CyborgLegs", weapon: "Cyb-Hvywpn-PulseLsr" }, 
	].reverse();	

	// Try to make the most technogically advanced cyborg
	for (let i=0; i<fishBotCyborgs.length; ++i) { 
		const cyborg = fishBotCyborgs[i];
		const cyborgName =  cyborg.name + ` (FishBot v${FISHBOT_VERSION})`;

		let productionInProgress = buildDroidWrapper(factory, cyborgName, cyborg.body, cyborg.prop, cyborg.weapon);
		if (productionInProgress) {
			// debug("Produced cyborg:", cyborgName);		
			return true;
		}
	}
	return false;
}

function produceLandUnitCategory(category, factory) {
	let factoryInProduction = false;   

	let r = Math.floor(Math.random() * 4);		// this should be one of the few (if any) Math.random() calls in FishBot.
	
	switch (category) {
		case 'heavyCavalry':
			factoryInProduction = factoryInProduction || produceHeavyCavalry(factory);
			break;
		case 'lightCavalry':
			factoryInProduction = factoryInProduction || produceLightCavalry(factory);
			break;
		case 'shortRangeArtillery':
			factoryInProduction = factoryInProduction || produceLandFireSupportGeneric(factory);
			break;
		case 'ADA':
			if (r === 0) {
				factoryInProduction = factoryInProduction || produceAAFlakUnit(factory);
			} else {
				factoryInProduction = factoryInProduction || produceHighVolumeAAUnit(factory);
			}
			break;
		case 'sensor': 
			factoryInProduction = factoryInProduction || produceLandRecon(factory);
			break;
		case 'repair':
			debug(`${gameTime}: heavy repair`);
			factoryInProduction = factoryInProduction || produceHeavyRepair(factory);
			break;
		default:
			factoryInProduction = factoryInProduction || produceLightCavalry(factory);
	}

}

/**
 * Returns the FishBot group classification for a specified droid.
 * FishBot groups are distinct from droid properties / flags; these groups are used to control the 
 * overall behaviour of a team of units (e.g. "Brigade Combat Team") working together to achieve the same goal.
 * @param {DroidObject} droid  
 * @returns {number} Classified group ID
 */
function getDroidFbGroupClassification(droid) {

	const flags = classifyGameObject(droid);

	if (flags & OBJ_FLAGS.CONSTRUCTOR) {
		return ENGINEERING.ENGINEERING_RESERVE;
	}

	// AVIATION
	// Air units should be sorted early as AVIATION units could have conflicting flags with LAND FORCES e.g. "OBJ_FLAGS.CANNON_WEAPON"
	if (flags & OBJ_FLAGS.AVIATION) {
		return DIVISION.AIR_RESERVE;
	}

	// LAND FORCES
	if (flags & (OBJ_FLAGS.INFANTRY)) {
		return DIVISION.INFANTRY_RESERVE;
	}
	
	if (flags & (OBJ_FLAGS.CANNON_WEAPON)) {        // TODO: future support for other weapon types
		return DIVISION.HEAVY_CAV_RESERVE;
	}

	if (flags & (OBJ_FLAGS.MACHINEGUN_WEAPON | OBJ_FLAGS.LASER_WEAPON)) {
		return DIVISION.LIGHT_CAV_RESERVE;
	}

	if (flags & OBJ_FLAGS.SHORT_RANGE_ARTILLERY_WEP) {
		return DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE;
	}

	if (flags & OBJ_FLAGS.LONG_RANGE_ARTILLERY_WEP) {
		return DIVISION.LONG_RANGE_FIRE_SUPPORT_RESERVE;
	}

	if (flags & (OBJ_FLAGS.AA_DIRECT_FIRE_WEAPON | OBJ_FLAGS.AA_ROCKET_WEAPON)) {
		return DIVISION.AIR_DEFENCE_RESERVE;
	}

	if (flags & OBJ_FLAGS.REPAIR) {
		return DIVISION.MAINTENANCE_RESERVE;
	}
 
	if (droid.droidType === DROID_SENSOR) {
		// manually accessing the DroidObject properties as I have run out of bits in OBJ_FLAGS.
		return DIVISION.SENSOR_RESERVE;		
	}

	return DIVISION.GENERAL_RESERVE;
}
