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
 * @returns {any | undefined} TODO: add typing
 */
function choosePropulsion(propulsionList) {
	if (propulsionList == null) {
		debug("choosePropulsion(): Input parameter 'propulsionList' is missing.")
		return undefined;
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
 * Filters out unavailable bodies & bodies bigger than the requested size. Returns a single `Body` object.
 * This function assumes FISHBOT_BODIES2 is already ordered from low-tech to high tech.
 * @returns {any | undefined}
 */
function chooseVehicleBody2(factory, requestedBodyWeight) {

	// Note: BODY_WEIGHT.MEDIUM is set to 1 (enum construction). 
	// That corresponds to the required factory.modules = 1 required for production, hence the equality in the following line.
	const maxRequiredModules = requestedBodyWeight;		
	// Set the upper-bound of body weight (limited by caller request, or by factory capability)
	const maxBodyWeight = Math.min(maxRequiredModules, factory.modules);		

	const availableBodies = [];
	for (const body of Object.values(FISHBOT_BODIES2)) {		
		const BODY_AVAILABLE = componentAvailable(body.id);
		const SIZE_WITHIN_SPEC_AND_FACTORY_CAPABILITY = body.Size <= maxBodyWeight;

		if (BODY_AVAILABLE && SIZE_WITHIN_SPEC_AND_FACTORY_CAPABILITY) {
			availableBodies.push(body);
		}
	}

	return availableBodies[availableBodies.length - 1];		// last element of array. 'undefined' if list is empty
}


/**
 * Attempts to produce a unit (to the provided specification) at the specified factory.
 * Caller must order `weaponList` and `propulsionList` in preferential order (highest preference = first).
 * @returns {boolean} whether the unit is now in production in the specified factory.
 */
function produceVehicle2(factory, body, weaponList, propulsionList) {

	// Select most up-to-date weapon
	const weapon = chooseWeapon(weaponList);

	// Select available (ground) propulsion
	const propulsion = choosePropulsion(propulsionList);
	
	if (body == null || weapon == null || propulsion == null) {
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
 * @param {boolean} CAN_DESIGN_UNITS  this flag is here to prevent FishBot from producing Hover Trucks before a command center is built
 * @returns {boolean} whether the unit is now in production
 */
function produceTruck(factory, CAN_DESIGN_UNITS) {
	
	const truckBody = CAN_DESIGN_UNITS ?
		chooseVehicleBody2(factory, BODY_WEIGHT.LIGHT) :
		FISHBOT_BODIES2["Viper"];
		
	const truckTurrets = [
		WEAPONS["Truck"]
	];

	const truckPropulsions = CAN_DESIGN_UNITS ? 
		[PROPULSIONS["Hover"], PROPULSIONS["Wheels"]] : 
		[PROPULSIONS["Wheels"]];

	return produceVehicle2(factory, truckBody, truckTurrets, truckPropulsions);
}

/**
 * Produces a cyborg constructor (Combat Engineer) unit.
 * @param {StructureObject} factory 
 * @returns {boolean} whether the unit is now in production
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
	AIR UNIT PRODUCTION
*/

function produceCloseAirSupport(factory) {

	const body = chooseVehicleBody2(factory, BODY_WEIGHT.MEDIUM);

	const fishBotCASWeapons = [
		WEAPONS["VTOL Hyper Velocity Cannon"],
		WEAPONS["VTOL Assault Cannon"],
		WEAPONS["VTOL Needle Gun"],
		WEAPONS["VTOL Rail Gun"]
	].reverse();

	const vtolPropulsions = [
		PROPULSIONS["VTOL"]
	];

	return produceVehicle2(factory, body, fishBotCASWeapons, vtolPropulsions);
}

function produceDeepAirSupport(factory) {

	const body = chooseVehicleBody2(factory, BODY_WEIGHT.MEDIUM);

	const fishBotDASWeapons = [
		WEAPONS["Cluster Bomb"],
		WEAPONS["HEAP Bomb"],
		WEAPONS["Phosphor Bomb"],
		WEAPONS["Thermite Bomb"],
		WEAPONS["Plasmite Bomb"]
	].reverse();

	const vtolPropulsions = [
		PROPULSIONS["VTOL"],
	];

	return produceVehicle2(factory, body, fishBotDASWeapons, vtolPropulsions);
}

/*
	GROUND COMBAT UNIT PRODUCTION
*/

/**
 * Light cavalry is mobile, lightly armoured, medium armament.
 */
function produceLightCavalry(factory) {
	const body = chooseVehicleBody2(factory, BODY_WEIGHT.HEAVY);

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

	return produceVehicle2(factory, body, lightCavalryWeapons, lightCavalryPropulsions);
}

/**
 * Heavy cavalry has heavy armour, heavy armament but has slow speed. Requires combined arms to be truly effective.
 * @param {*} factory 
 * @returns 
 */
function produceHeavyCavalry(factory) {
	const body = chooseVehicleBody2(factory, BODY_WEIGHT.HEAVY);

	// Order these by tech level if you want the most technologically advanced body to be used
	const heavyCavalryWeapons = [
		WEAPONS["Light Cannon"],
		WEAPONS["Medium Cannon"],
		WEAPONS["Hyper Velocity Cannon"],
		WEAPONS["Assault Cannon"],
		WEAPONS["Heavy Cannon"],
		WEAPONS["Twin Assault Cannon"],
		// WEAPONS["Needle Gun"],
		WEAPONS["Rail Gun"],
		WEAPONS["Gauss Cannon"],
	].reverse();
	
	const heavyCavalryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"], 
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle2(factory, body, heavyCavalryWeapons, heavyCavalryPropulsions);
}

/**
 * A cool idea from the 'Peacemaker' bot (by duckfood). With enough nearby repair turrets, it is possible to greatly to extend the lifespan of a frontline unit.
 */
function produceHeavyRepair(factory) {
	const body = chooseVehicleBody2(factory, BODY_WEIGHT.HEAVY);

	const repairTurrets = [
		WEAPONS['Heavy Repair Turret']
	];
	
	const heavyRepairPropulsion = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"], 
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle2(factory, body, repairTurrets, heavyRepairPropulsion);
}


function produceLandAPFireSupport(factory) {
	const body = chooseVehicleBody2(factory, BODY_WEIGHT.LIGHT);

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

	return produceVehicle2(factory, body, fireSupportWeapons, fireSupportPropulsions);
}

function produceLandFireSupportGeneric(factory) {
	const body = chooseVehicleBody2(factory, BODY_WEIGHT.HEAVY);

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

	return produceVehicle2(factory, body, fireSupportWeapons, fireSupportPropulsions);
}

function produceHighVolumeAAUnit(factory) {
	const body = chooseVehicleBody2(factory, BODY_WEIGHT.HEAVY);

	// Order these by tech level if you want the most technologically advanced weapon to be used
	const shortRangeAAWeapons = [
		WEAPONS["Hurricane AA Turret"],
		WEAPONS["Whirlwind AA Turret"]
	].reverse();
	
	const propulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"],
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle2(factory, body, shortRangeAAWeapons, propulsions);
}

function produceAAFlakUnit(factory) {
	const body = chooseVehicleBody2(factory, BODY_WEIGHT.HEAVY);

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

	return produceVehicle2(factory, body, airDefenceArtilleryWeapons, airDefenceArtilleryPropulsions);
}

function produceLandRecon(factory) {
	const body = chooseVehicleBody2(factory, BODY_WEIGHT.MEDIUM);

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

	return produceVehicle2(factory, body, sensors, sensorPropulsions);
}

/**
 * Produces a combat cyborg (infantry) unit.
 * @param {StructureObject} factory 
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

/**
 * Driver for producing land units.
 * @param {number} category 
 * @param {StructureObject} factory 
 * @returns 
 */
function produceLandUnitCategory(category, factory) {
	let productionStarted = false;  
	
	switch (category) {
		case DIVISION.HEAVY_CAV_RESERVE:
			productionStarted = productionStarted || produceHeavyCavalry(factory);
			break;
		case DIVISION.LIGHT_CAV_RESERVE:
			productionStarted = productionStarted || produceLightCavalry(factory);
			break;
		case DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE:
			productionStarted = productionStarted || produceLandFireSupportGeneric(factory);
			break;
		case DIVISION.AIR_DEFENCE_RESERVE:
			productionStarted = productionStarted || produceHighVolumeAAUnit(factory);
			break;
		case DIVISION.SENSOR_RESERVE: 
			productionStarted = productionStarted || produceLandRecon(factory);
			break;
		case DIVISION.MAINTENANCE_RESERVE:
			productionStarted = productionStarted || produceHeavyRepair(factory);
			break;
		default:
			warn(`produceLandUnitCategory() did not understand "${category}". Falling back to light cav production.`);
			productionStarted = productionStarted || produceLightCavalry(factory);
	}

	return productionStarted;
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
