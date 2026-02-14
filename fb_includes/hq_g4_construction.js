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

class armyEngineering {
	constructor() {

	}
	
	getTruckAvailability() {
		const truckAvailability = {
			numAvailable: state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE).length,
			numTotal: enumDroid(me, DROID_CONSTRUCT).length
		}
		return truckAvailability;
	}

	#getNumFinishedModules({structureID}) {
		// Assumes that 
		let completedModuleCount = 0;
		switch (structureID) {
			case STRUCTURES["Power Module"].id:
				let numFinishedGenerators = enumStruct(me, POWER_GEN).filter(s => s.status === BUILT);
				numFinishedGenerators.forEach(g => {completedModuleCount += g.modules;});
				break;
			case STRUCTURES["Factory Module"].id:
				let numFinishedFactories = enumStruct(me, FACTORY).filter(s => s.status === BUILT);
				let numFinishedVtolFactories = enumStruct(me, VTOL_FACTORY).filter(s => s.status === BUILT);
				numFinishedFactories.push(...numFinishedVtolFactories);		// add vtol factories to the end
				numFinishedFactories.forEach(f => {completedModuleCount += f.modules;});
				break;
			case STRUCTURES["Research Module"].id:
				let numFinishedLabs = enumStruct(me, RESEARCH_LAB).filter(s => s.status === BUILT);
				numFinishedLabs.forEach(l => {completedModuleCount += l.modules;})
				break;
			default:
				debug(`#getNumFinishedModules(): Could not recognise structureID ${structureID}, returning 0 modules`);
				// do nothing
		}

		return completedModuleCount;
	}

	requestBaseConstruction(state) {
		// Inputs:
		// -	buildQueue: a list of STRUCTURES['exampleName']

		const baseBuildOrder_T1NoBase = [
			STRUCTURES["Factory"],
			STRUCTURES["Factory"],
			STRUCTURES["Command Center"],
			STRUCTURES["Power Generator"],	
			STRUCTURES["Power Generator"],	
			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],
			STRUCTURES["Power Generator"],
			STRUCTURES["Cyborg Factory"],		

			STRUCTURES["VTOL Factory"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],

			STRUCTURES["Power Module"],				// The script will automatically find the position to place this power module
			STRUCTURES["Research Facility"],
			STRUCTURES["Power Module"],
			STRUCTURES["Power Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			// STRUCTURES["Repair Facility"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["Cyborg Factory"],		
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],
			STRUCTURES["Research Module"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["Cyborg Factory"],		
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["VTOL Rearming Pad"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["Factory"],
			STRUCTURES["Factory Module"],
			STRUCTURES["Factory Module"],


			STRUCTURES["Cyborg Factory"],
			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],
			STRUCTURES["Research Facility"],
			STRUCTURES["Research Module"],
			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],
			STRUCTURES["Power Generator"],
			STRUCTURES["Power Module"],	
		];

		// Put each task into an appropriate format for approval ("buildTask", which is internal to g4_construction)
		let buildTasks = [];

		// Create running tally
		let minimumRequired = {};
		baseBuildOrder_T1NoBase.forEach(struct => {
			if (!defined(minimumRequired[struct.id])) {
				minimumRequired[struct.id] = 0;
				// debug(`	requestBaseConstruction(): minimumRequired -> ${struct.id} ${minimumRequired[struct.id]}`);
			}
		});

		for (let i=0; i<baseBuildOrder_T1NoBase.length; i++) {
			// Iterate through the build order & check if the desired number of structures have been built already;
			const currStructureData = baseBuildOrder_T1NoBase[i];

			// Part 1: Add new structure to running tally
			minimumRequired[currStructureData.id] += 1;

			// Part 2: Check how many in progress / built
			let structCount = undefined;
			if (["Research Module", "Power Module", "Factory Module"].includes(currStructureData.name)) {
				structCount = this.#getNumFinishedModules({structureID: currStructureData.id});
			} else {
				structCount = enumStruct(me, currStructureData.id).length;		// returns both 'BUILT' & 'BEING_BUILT' results
			}

			if (false) debug(`	structCount -> structCount ${structCount} 	VS 	built ${minimumRequired[currStructureData.id]}`);

			if (structCount >= minimumRequired[currStructureData.id]) {
				continue;
			}

			// Else, schedule a new task
			const buildRequest = this.#translateIntoBuildRequest({
				missionType: MISSION_TYPE.CONSTRUCT_AUTO_DETECT_BY_STRUCTURE, 
				structureData: currStructureData,
				payload: undefined
			});
			buildTasks.push(buildRequest);
			break;
		}
		
		return buildTasks;
	}

	requestSectorDefenceConstruction(state) {
		// Select new locations for placing defences
		let contestedDerricks = [];
		let friendlyDerricks = [];
		let highValueDerricks = [];

		for (let i=0; i<state.sectors.length; i++) {
			const currSector = state.sectors[i];

			// Check nature of derricks (are they all together, or are they spread out?)
			let clustered = true;
			if (currSector.derricks.length > 1) {
				for (let j=1; j<currSector.derricks.length; j++) {
					let d = distance(currSector.derricks[j], currSector.derricks[0]);
					if (d > 5) {
						clustered = false;
						break;
					}
				}
			}

			for (let i=0; i<currSector.derricks.length; i++) {

				if (clustered && i > 0) {
					break;		// only run one iteration
				}

				const currDerrick = currSector.derricks[i];

				if ([REGION_OWNER.FRIENDLY, REGION_OWNER.CONTESTED].includes(currDerrick.owner) &&			// based on current structures (fixed assets) around location
					currDerrick.threatLevel <= REGION_THREAT_LEVEL.MEDIUM &&									// based on potential for raiding (mobile assets) + reinforcement
					currDerrick.controlStability <= REGION_STABILITY.MEDIUM) {								// geography (based on map analysis)
					let bunkerBuildRequest = this.#translateIntoBuildRequest({
						missionType: MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE, 
						structureData: STRUCTURES["Rotary MG Bunker"],
						payload: currDerrick}
					);

					if (currSector.derricks.length >= 4) {
						highValueDerricks.push(bunkerBuildRequest);
					}

					if (currDerrick.owner === REGION_OWNER.CONTESTED) {
						contestedDerricks.push(bunkerBuildRequest);
					} else {
						friendlyDerricks.push(bunkerBuildRequest);
					}
					// debug(`defence requested: ${newDefence.x} ${newDefence.y}, threat: ${resource.threatLevel}, owner: ${resource.owner}`);
				}

				// Special case of high value, clustered derricks with nothing else built yet
				if (clustered && 
					currSector.owner === REGION_OWNER.NEUTRAL &&
					currSector.derricks.length >= 4) {

					let highValueDefence = this.#translateIntoBuildRequest({
						missionType: MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE, 
						structureData: STRUCTURES["Rotary MG Bunker"],
						payload: currDerrick}
					);

					highValueDerricks.push(highValueDefence);
				}

				// Special case of high value, clustered derricks with residual enemy derricks
				if (clustered && 
					currSector.derricks.length >= 4 && 
					currSector.derricks.some(d => d.owner === REGION_OWNER.FRIENDLY) &&
					currSector.derricks.some(d => d.owner === REGION_OWNER.ENEMY || d.owner === REGION_OWNER.CONTESTED) &&
					currSector.enemyDefenceCount === 0) {

					let highValueDefence = this.#translateIntoBuildRequest({
						missionType: MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE, 
						structureData: STRUCTURES["Assault Gun Hardpoint"],
						payload: currDerrick}
					);

					friendlyDerricks.push(highValueDefence);
				}
			}
		}
		
		// Rationale: contested derricks should be closest to base (highest likelihood to capitalise), whereas friendlyDerricks should be far away from base (highest risk to enemy reinforcement)
		highValueDerricks.sort((one, two) => 
			distSq(one.payload.x, baseLocation.x, one.payload.y, baseLocation.y) - distSq(two.payload.x, baseLocation.x, two.payload.y, baseLocation.y));
		contestedDerricks.sort((one, two) => 
			distSq(two.payload.x, baseLocation.x, two.payload.y, baseLocation.y) - distSq(one.payload.x, baseLocation.x, one.payload.y, baseLocation.y));
		friendlyDerricks.sort((one, two) => 
			distSq(two.payload.x, baseLocation.x, two.payload.y, baseLocation.y) - distSq(one.payload.x, baseLocation.x, one.payload.y, baseLocation.y));

		if (highValueDerricks.length >= 1) {
			return [...highValueDerricks];
		}

		return [...highValueDerricks, ...contestedDerricks, ...friendlyDerricks];
	}

	/*
		Oil capture
	*/
	requestOilCapture(state) {
		let sectorsWithOilToCapture = [];

		// This function assumes that sectors are arranged in ascending order of distance from base
		const sectors = state.sectors;
		for (let i=0; i<sectors.length; i++) {

			let allClaimed = true;
			for (let j=0; j<sectors[i].derricks.length; j++) {
				const currDerrick = sectors[i].derricks[j];
				if (currDerrick.threatLevel > REGION_THREAT_LEVEL.MEDIUM) {
					continue;
				}

				if (currDerrick.isClaimed !== true) {
					allClaimed = false;
					break;
				}
			}

			if (!allClaimed) {
				sectorsWithOilToCapture.push(sectors[i]);
			}
		}

		let buildTasks = [];

		for (let i=0; i<sectorsWithOilToCapture.length; i++) {
			const currSector = sectorsWithOilToCapture[i];

			// Convert sector oil capture into a build task. Derricks are grouped appropriately

			if (currSector.derricks.length >= 4) {
				let buildRequest = this.#translateIntoBuildRequest({
					missionType: MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR, 
					structureData: STRUCTURES["Oil Derrick"],
					payload: currSector
				});
				
				buildTasks.push(buildRequest);
			} else {
				currSector.derricks.forEach(derrick => {
					if (derrick.isClaimed === true) {
						return;
					}

					if (tileIsBurning(derrick.x, derrick.y)) {
						// debug(`cancelled oil capture - derrick is burning ${derrick.x}, ${derrick.y}`);
						return;
					}

					let buildRequest = this.#translateIntoBuildRequest({
						missionType: MISSION_TYPE.CONSTRUCT_OIL_DERRICK, 
						structureData: STRUCTURES["Oil Derrick"],
						payload: derrick
					});
					
					buildTasks.push(buildRequest);
				});			
			}

		}
		
		return buildTasks;
	}

	/*
		MISSION CREATION
	*/

	#createBuildRequest({missionType, structureData, payload}) {
		let buildRequestTemplate = 
		{
			missionType: missionType,
			structureID: structureData.id,
			payload: payload,
		}

		return buildRequestTemplate;
	}

	#translateIntoBuildRequest({missionType, structureData, payload}) {
		let buildRequest = undefined;

		switch (missionType) {
			case MISSION_TYPE.CONSTRUCT_OIL_DERRICK:
				buildRequest = this.#createBuildRequest({missionType: missionType, structureData: structureData, payload: payload});
				break;
			case MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR:
				buildRequest = this.#createBuildRequest({missionType: missionType, structureData: structureData, payload: payload});
				break;
			case MISSION_TYPE.CONSTRUCT_AUTO_DETECT_BY_STRUCTURE:
				let mt = undefined;
				switch(structureData.id) {
					case STRUCTURES["Research Module"].id:	
					case STRUCTURES["Power Module"].id:
					case STRUCTURES["Factory Module"].id:		// these three have the same handler
						mt = MISSION_TYPE.CONSTRUCT_SINGLE_MODULE;	
						break;
					default:
						mt = MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE;
				}
				buildRequest = this.#createBuildRequest({missionType: mt, structureData: structureData, payload: payload});
				break;
			case MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE:
				buildRequest = this.#createBuildRequest({missionType: missionType, structureData: structureData, payload: payload});
				break;
			case MISSION_TYPE.CONSTRUCT_STRUCTURE_NEARBY:
				buildRequest = this.#createBuildRequest({missionType: missionType, structureData: structureData, payload: payload});
				break;				
			default:
				debug(`WARNING: hq_g4_construction/translateIntoBuildRequest(): Unrecognised missionType: ${missionType}`);
				// do nothing for now
		}

		return buildRequest;
	}

	#createMissionOrders() {
		let missionDataTemplate = {
			'id': undefined, 
			'missionType': undefined, 
			'missionStatus': MISSION_STATUS.FAILED_CREATION, 
			'priority': MISSION_PRIORITY.LOW, 
			'taskForceID': undefined, 
			'orders': undefined, 
			'ceaseOrders': undefined,
			'timeStarted': -2,
			'timeCompleted': -1,

			'sectorID': undefined,	// used by Recon missions (for missions that do not complete instantly) -- unused as of 07 Jan 26
		};

		return missionDataTemplate;
	}

	#mcb(callback, ...args) {
		// This function is here so we can schedule execution of the callback function at some later point
		return callback(...args);	//...args is important otherwise all remaining args will be interpreted as a single array of parameters
	}

	#finaliseConstruction(md) {
		// Mission completed
		const taskForceUnits = state.g.enumGroup(md.taskForceID);
		if (taskForceUnits.length > 0) {
			taskForceUnits.forEach((droid) => {
				state.g.addDroidToGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
				orderDroidLoc(droid, DORDER_MOVE, baseLocation.x, baseLocation.y);
			});	
		} else {
			// debug(`Terminated mission: taskForceID ${md.taskForceID} are all dead.`);
		}
		state.g.deleteGroup(md.taskForceID);
		md.timeCompleted = getCurrGameTime();
	}

	createHelpConstructTask() {
		// this is the default behaviour of all trucks

		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	
			
		// Make a shallow copy (as long as the template doesn't change, this is fine)
		// 	- id:				: Unique ID to designate this particular mission (set here)
		//	- missionType		: Integer to denote mission type (determined in OPS)
		//	- missionStatus		: Integer to denote mission status (this function sets it to NOT_STARTED)
		// 	- priority			: Integer to denote priority (determined in OPS)
		// 	- taskForceID		: Unique ID to designate all units in the group (set here)
		// 	- orders			: how to carry out the mission (tactics.js)
		//	- ceaseOrders 		: how to finish the mission (tactics.js)
		//	- timeCompleted		: gameTime when ceaseOrders was called & processed

		let md = this.#createMissionOrders();

		// Create mission details		
		const id = getCurrGameTime() + "HELP_CONSTRUCT";
		md.id = id;
		md.taskForceID = ENGINEERING.ENGINEERING_RESERVE;		// taskForceID is used for enumGroup so 

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(helpConstructAroundBase, md.taskForceID);		
		md.ceaseOrders = () => {return;};	// doesn't do anything

		return md;
	}
	
	createBuildBaseStructureTask({buildTask, tickUID}) {
		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {			
			// debug(`#createBuildBaseStructureTask(): No trucks available.`);
			return undefined;
		}

		let MAX_TRUCKS = 2;

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildBaseStructureTask(): Structure not available: ${buildTask.structureID}`);
			return undefined;
		}

		const loc = pickStructLocation(engineeringReserve[0], buildTask.structureID, baseLocation.x, baseLocation.y);		
		if (!defined(loc)) {
			debug(`#createBuildBaseStructureTask(): pickStructLocation() couldn't find a good location for ${buildTask.structureID}.`);
			return undefined;
		}

		// Select closest trucks to new location
		engineeringReserve.sort((first, second) => distance(first, buildTask) - distance(second, buildTask));
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS); 

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_BASE_STRUCTURE_" + tickUID;
		md.id = id;
		md.taskForceID = id;
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(buildBaseStructure, md.taskForceID, buildTask.structureID, loc.x, loc.y);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}

	createBuildDerrickTask({buildTask, tickUID}) {		
		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	
		
		const derrick = buildTask.payload;

		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {
			// debug(`#createBuildBaseStructureTask(): No trucks available.`);
			return undefined;
		}
		
		let MAX_TRUCKS = 1;
		
		// Select closest trucks to sector
		engineeringReserve.sort((first, second) => distance(first, buildTask) - distance(second, buildTask));		// buildTask = state.sector -> has x,y
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS);

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`createBuildDerrickTask(): Structure not available: ${buildTask.structureID} - were oil derricks disabled?`);
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_OIL_DERRICK_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.sectorID = buildTask.payload.id;
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(buildOilDerrick, md.taskForceID, buildTask.structureID, derrick);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}

	createBuildAllDerricksInSectorTask({buildTask, tickUID}) {		
		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	
		
		const sectorDerricks = buildTask.payload.derricks;

		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {
			// debug(`#createBuildBaseStructureTask(): No trucks available.`);
			return undefined;
		}
		
		let MAX_TRUCKS = 1;
		
		// Select closest trucks to sector
		engineeringReserve.sort((first, second) => distance(first, buildTask) - distance(second, buildTask));		// buildTask = state.sector -> has x,y
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS);

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildAllDerricksInSectorTask(): Structure not available: ${buildTask.structureID} - were oil derricks disabled?`);
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_SECTOR_DERRICKS_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.sectorID = buildTask.payload.id;
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(buildMultipleOilDerricks, md.taskForceID, buildTask.structureID, sectorDerricks);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}

	createBuildSingleModuleTask({buildTask, tickUID}) {
		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	

		// This function builds *one* additional module extension on *every* structure than can be upgraded.

		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length === 0) {
			// debug(`#createBuildBaseStructureTask(): No trucks available.`);
			return undefined;
		}

		const MAX_TRUCKS = 2;

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildSingleModuleTask(): Structure not available: ${buildTask.structureID}`);
			return undefined;
		}
		
		const MAX_POWER_MODULES = 1;
		const MAX_FACTORY_MODULES = 2;
		const MAX_RESEARCH_MODULES = 1;

		let baseStructures = [];
		switch(buildTask.structureID) {
			case (STRUCTURES["Power Module"].id):
				let generators = enumStruct(me, POWER_GEN).filter(gen => gen.modules < MAX_POWER_MODULES);
				baseStructures.push(...generators);
				break;
			case (STRUCTURES["Factory Module"].id):
				let factories = enumStruct(me, FACTORY).filter(factory => factory.modules < MAX_FACTORY_MODULES);
				let vtolFactories = enumStruct(me, VTOL_FACTORY).filter(factory => factory.modules < MAX_FACTORY_MODULES);
				baseStructures.push(...factories, ...vtolFactories);
				break;
			case (STRUCTURES["Research Module"].id):
				let labs = enumStruct(me, RESEARCH_LAB).filter(lab => lab.modules < MAX_RESEARCH_MODULES);
				baseStructures.push(...labs);
				break;
			default:
				// Do nothing
		}

		if (baseStructures.length === 0) {
			// debug(`#createBuildSingleModuleTask(): no available structures to place: ${buildTask.structureID}`);
			return undefined;
		}

		const x = baseStructures[0].x; 
		const y = baseStructures[0].y;
		const numFinishedModules = baseStructures[0].modules + 1;

		// Select closest trucks to location
		engineeringReserve.sort((first, second) => distance(first, buildTask) - distance(second, buildTask));
		const taskForceUnits = engineeringReserve.slice(0, MAX_TRUCKS); 

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_SINGLE_MODULE_" + tickUID;
		md.id = id;
		md.taskForceID = id;
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations			
		md.orders = () => this.#mcb(buildSingleModule, md.taskForceID, buildTask.structureID, x, y, numFinishedModules);
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}

	createBuildNearbyDefenceTask({buildTask, tickUID}) {
		// it returns either:
		// 	- missionData object (according to missionDataTemplate), if mission successfully created, OR
		//	- undefined, if mission was not able to be created	

		const MINIMUM_TRUCKS = 2;
		
		let engineeringReserve = state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE);
		if (engineeringReserve.length < MINIMUM_TRUCKS) {
			// debug(`#createBuildNearbyDefenceTask(): No trucks available.`);
			return undefined;
		}

		// Select closest trucks to new location
		const currDerrick = buildTask.payload;
		engineeringReserve.sort((first, second) => distance(first, currDerrick) - distance(second, currDerrick));
		const taskForceUnits = engineeringReserve.slice(0, MINIMUM_TRUCKS); 

		if (!isStructureAvailable(buildTask.structureID, me)) {
			debug(`#createBuildNearbyDefenceTask(): Structure not available: ${buildTask.structureID}`);
			return undefined;
		}

		let preferredLoc = pickStructLocation2({structureID: buildTask.structureID, x: currDerrick.x, y: currDerrick.y});
		if (!defined(preferredLoc)) {
			debug(`createBuildNearbyDefenceTask(): pickStructLocation2() could not find a valid location`);
			return undefined;
		}

		let md = this.#createMissionOrders();

		// Create mission details
		const id = getCurrGameTime() + "_CONSTRUCT_NEARBY_DEFENCE_" + tickUID;
		md.id = id;
		md.taskForceID = id;

		md.sectorID = currDerrick.id;			// TODO: CHECK IF "SECTORID" is the correct abstraction even though this is derrick ID (position ID?)
		
		taskForceUnits.forEach((droid) => {
			state.g.addDroidToGroup({groupID: md.taskForceID, droidID: droid.id});
			state.g.removeDroidFromGroup({groupID: ENGINEERING.ENGINEERING_RESERVE, droidID: droid.id});
		});		

		// Assign orders for conducting & ceasing operations
		if (false) debug(`Mission creation for: _CONSTRUCT_NEARBY_DEFENCE_ -> (${preferredLoc.x}, ${preferredLoc.y}) `);			
		md.orders = () => this.#mcb(buildNearbyDefences, md.taskForceID, buildTask.structureID, preferredLoc.x, preferredLoc.y);		// lambda is necessary otherwise md.orders is not interpreted as a function
		md.ceaseOrders = () => this.#mcb(this.#finaliseConstruction, md);

		return md;
	}
}