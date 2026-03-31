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
	WZ2100 DRIVERS
*/
function buildDroidWrapper(factory, droidName, bodies, propulsions, weapon) {
	/*
		NOTE: Regarding the input parameters to buildDroid()
		- The components can be passed as ordinary strings, or as a list of strings. 
		- If passed as a list, the first available component in the list will be used.
	*/
	const productionStarted = buildDroid(factory, droidName, bodies, propulsions, null, "", weapon);
	if (productionStarted === true) {
		return true;
	} else {
		return false;
	}
}

function iCanDesign() {
	// FishBot will not build units before it can design them, on any difficulty.
	const hqIsBuilt = (enumStruct(me, HQ).filter(hq => hq.status === BUILT).length > 0);
	if (hqIsBuilt)
		return true;
	else
		return false;
}

function chooseVehicleBody({bodies=[], factory=undefined, maxFactoryModules=undefined}) {
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

	/*
		Algorithm: 
		1. Filter out all unavailable bodies.
		2. For the highest capability of the factory, select the most technologically advanced body.
	*/

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
}

function chooseWeapon({weaponList=undefined}) {
	const DEBUG_MODE = false;

	if (!defined(weaponList)) {
		debug("chooseWeapon(): weaponList was not passed to this function.")
		return undefined;
	}
	if (weaponList.length === 0) {
		debug("chooseWeapon(): weaponList was empty.");
		return undefined;
	}
	
	const availableWeapons = weaponList.filter((weapon) => componentAvailable(weapon.stat));

	if (availableWeapons.length === 0) {
		debug("chooseWeapon(): None of the passed weapons were available.")
		return undefined;
	}

	if (DEBUG_MODE) debug(`chooseWeapon(): selected ${availableWeapons[0].name}`);
	return availableWeapons[0];		// the list is pre-sorted before it enters this function
}

function choosePropulsion(propulsionList) {
	if (!defined(propulsionList)) {
		debug("choosePropulsion(): Input parameter 'propulsionList' is missing.")
		return undefined;
	}

	// propulsionList.forEach(p => debug(`		testing: ${p.name}, ${p.id}, ${p.Id}`));
	const availablePropulsions = propulsionList.filter((p) => componentAvailable(p.id));
	if (availablePropulsions.length === 0) {
		debug("choosePropulsion(): No technologically-available propulsion in 'propulsionList'.")
	}

	return availablePropulsions[0];
}

function produceVehicle({factory, weaponList, propulsionList, maxBodyWeight=BODY_WEIGHT.HEAVY}) {

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
		
	const body = chooseVehicleBody({bodies: FISHBOT_BODIES, factory: factory, maxFactoryModules: maxRequiredModules});		

	// Select most up-to-date weapon
	const weapon = chooseWeapon({weaponList: weaponList});

	// Select available (ground) propulsion
	const propulsion = choosePropulsion(propulsionList);
	
	if (!defined(body) || !defined(weapon) || !defined(propulsion)) {
		debug("produceVehicle(): Either 'body' or 'weapon' or 'propulsion' were undefined.")
		return false;
	}
		
	const tankName = weapon.name + ", " + body.name + ", " + propulsion.name +  ` (FishBot v${FISHBOT_VERSION})`;

	const productionInProgress = buildDroidWrapper(factory, tankName, body.id, propulsion.id, weapon.stat);
	return productionInProgress;
}

/*
	LOGISTICS UNIT PRODUCTION
*/
function produceTruck(factory) {

	const truckTurrets = [
		{stat: "Spade1Mk1", name: 'Truck'}
	];

	const truckPropulsions = [
		PROPULSIONS["Wheels"],
		PROPULSIONS["Hover"]
	].reverse();

	return produceVehicle({factory: factory, weaponList: truckTurrets, propulsionList: truckPropulsions, maxBodyWeight: BODY_WEIGHT.LIGHT});
}

function produceCombatEngineer(factory) {
	const combatEngineer = { 
		name: 'Combat Engineer',
		body: "CyborgLightBody", 
		prop: PROPULSIONS["Cyborg Propulsion"].id, 
		weapon: "CyborgSpade"
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
		{ res: "R-Wpn-Cannon4AMk1", stat: "Cannon4AUTO-VTOL", name: 'Hyper-Velocity Cannon'}, 		
		{ res: "R-Wpn-Cannon5", stat: "Cannon5Vulcan-VTOL", name: 'Assault Cannon', }, 
		{ res: "R-Wpn-RailGun01", stat: "RailGun1-VTOL", name: 'Needle Gun', }, 
		{ res: "R-Wpn-RailGun02", stat: "RailGun2-VTOL", name: 'Rail Gun', }, 
	].reverse();

	const vtolPropulsions = [
		PROPULSIONS["VTOL"]
	].reverse();

	return produceVehicle({factory: factory, weaponList: fishBotCASWeapons, propulsionList: vtolPropulsions, maxBodyWeight: BODY_WEIGHT.MEDIUM});
}

function produceDeepAirSupport(factory) {

	const fishBotDASWeapons = [
		{ res: "R-Wpn-Bomb01", stat: "Bomb1-VTOL-LtHE", name: 'Cluster Bomb' },						// bomb
		{ res: "R-Wpn-Bomb02", stat: "Bomb2-VTOL-HvHE", name: 'HEAP Bomb' },
		{ res: "R-Wpn-Bomb03", stat: "Bomb3-VTOL-LtINC", name: 'Phosphor Bomb', },
		{ res: "R-Wpn-Bomb04", stat: "Bomb4-VTOL-HvyINC", name: 'Thermite Bomb', },
		{ res: "R-Wpn-Bomb05", stat: "Bomb5-VTOL-Plasmite", name: 'Plasmite Bomb', },
	].reverse();

	const vtolPropulsions = [
		PROPULSIONS["VTOL"],
	].reverse();

	return produceVehicle({factory: factory, weaponList: fishBotDASWeapons, propulsionList: vtolPropulsions, maxBodyWeight: BODY_WEIGHT.MEDIUM});
}

/*
	GROUND COMBAT UNIT PRODUCTION
*/
function produceLightCavalry(factory) {
	// Light cavalry is mobile, lightly armoured, medium armament

	// Order these by tech level if you want the most technologically advanced weapon to be used
	const lightCavalryWeapons = [
		{ res: "R-Wpn-MG1Mk1", stat: "MG1Mk1", name: 'Machinegun', }, 
		{ res: "R-Wpn-MG2Mk1", stat: "MG2Mk1", name: 'Twin Machinegun', }, 
		{ res: "R-Wpn-MG3Mk1", stat: "MG3Mk1", name: 'Heavy Machinegun', }, 
		{ res: "R-Wpn-MG4", stat: "MG4ROTARYMk1", name: 'Assault Gun', },  
		{ res: "R-Wpn-MG5", stat: "MG5TWINROTARY", name: 'Twin Assault Gun', }, 
		// { res: "R-Wpn-Laser01", stat: "Laser3BEAMMk1", name: 'Light Laser', }, // flash
		// { res: "R-Wpn-Laser02", stat: "Laser2PULSEMk1", name: 'Medium Laser', }, // pulse
		// { res: "R-Wpn-HvyLaser", stat: "HeavyLaser", name: 'Heavy Laser', }, // hvy laser
	].reverse();
	
	const lightCavalryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"], 
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({factory: factory, weaponList: lightCavalryWeapons, propulsionList: lightCavalryPropulsions});
}

function produceHeavyCavalry(factory) {
	// Heavy cavalry has heavy armour, heavy armament but has slow speed
	// Requires combined arms to be truly effective

	// Order these by tech level if you want the most technologically advanced body to be used
	const heavyCavalryWeapons = [
			{ res: "R-Wpn-Cannon1Mk1", stat: "Cannon1Mk1", name: 'Light Cannon', }, // lc
			{ res: "R-Wpn-Cannon2Mk1", stat: "Cannon2A-TMk1", name: 'Medium Cannon', }, // mc
			{ res: "R-Wpn-Cannon4AMk1", stat: "Cannon4AUTOMk1", name: 'Hyper-Velocity Cannon', }, // hpv
			{ res: "R-Wpn-Cannon5", stat: "Cannon5VulcanMk1", name: 'Assault Cannon', }, // ac
			{ res: "R-Wpn-Cannon3Mk1", stat: "Cannon375mmMk1", name: 'Heavy Cannon', }, // hc
			{ res: "R-Wpn-Cannon6TwinAslt", stat: "Cannon6TwinAslt", name: 'Twin Assault Cannon', }, // tac
			// { res: "R-Wpn-RailGun01", stat: "RailGun1Mk1", name: 'Needle Gun', }, // needle
			{ res: "R-Wpn-RailGun02", stat: "RailGun2Mk1", name: 'Rail Gun', }, // rail
			{ res: "R-Wpn-RailGun03", stat: "RailGun3Mk1", name: 'Gauss Cannon', }, // gauss
	].reverse();
	
	const heavyCavalryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"], 
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({factory: factory, weaponList: heavyCavalryWeapons, propulsionList: heavyCavalryPropulsions});
}

function produceLandFireSupport(factory) {
	// Part of the combined arms strategy

	// Order these by tech level if you want the most technologically advanced weapon to be used
	const fireSupportWeapons = [
		{ res: "R-Wpn-Mortar01Lt", stat: "Mortar1Mk1", name: 'Mortar', },
		{ res: "R-Wpn-Mortar02Hvy", stat: "Mortar2Mk1", name: 'Heavy Mortar', },
		{ res: "R-Wpn-Mortar3", stat: "Mortar3ROTARYMk1", name: 'Rotary Mortar', },
		{stat: "Mortar-Incendiary", name: "Incendiary Mortar"},
		// { res: "R-Wpn-HowitzerMk1", stat: "Howitzer105Mk1", name: 'Howitzer', },
		{ res: "R-Wpn-Howitzer03-Rot", stat: "Howitzer03-Rot", name: 'Rotary Howitzer', },
		// { res: "R-Wpn-HvyHowitzer", stat: "Howitzer150Mk1", name: 'Heavy Howitzer', },
	].reverse();
	
	const fireSupportPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"],
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({factory: factory, weaponList: fireSupportWeapons, propulsionList: fireSupportPropulsions, maxBodyWeight: BODY_WEIGHT.MEDIUM});
}

function produceLandAntiAir(factory) {

	// Order these by tech level if you want the most technologically advanced weapon to be used
	const airDefenceArtilleryWeapons = [
		{ res: "R-Wpn-AAGun01", stat: "AAGun2Mk1", name: "AA Flak Cannon Mk1"},
		{ res: "R-Wpn-AAGun02", stat: "AAGun2Mk1Quad", name: "AA Flak Cannon Mk2"},
	].reverse();
	
	const airDefenceArtilleryPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"],
		PROPULSIONS["Tracks"]
	].reverse();

	return produceVehicle({factory: factory, weaponList: airDefenceArtilleryWeapons, propulsionList: airDefenceArtilleryPropulsions, maxBodyWeight: BODY_WEIGHT.HEAVY});
}

function produceLandRecon(factory) {
	// Order these by tech level if you want the most technologically advanced weapon to be used
	const sensors = [
		{ stat: "SensorTurret1Mk1", name: "Sensor Turret"},
		{ stat: "Sys-CBTurret01", name: "CB Sensor"},
	].reverse();
	
	const sensorPropulsions = [
		PROPULSIONS["Wheels"], 
		PROPULSIONS["Half-tracks"]
	].reverse();

	return produceVehicle({factory: factory, weaponList: sensors, propulsionList: sensorPropulsions, maxBodyWeight: BODY_WEIGHT.MEDIUM});
}

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
