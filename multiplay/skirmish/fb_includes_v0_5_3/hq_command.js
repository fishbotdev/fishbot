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
 * This file implements FishBot's *strategic* layer.
 * 
 * All of FishBot's reasoning and decision-making functions are implemented here:
	- `runIntelligence` (gathers information from the map & stores in `state`)
	- `runCombatOperations` (directs combat units to move around)
	- `runConstructionLogistics` (directs trucks to build / demolish stuff)
 	- `runResupplyLogistics` (assigns newly produced units into combat groups)
 	- `runProductionLogistics` (directs factories to build new units depending on supply requirements)
	- `runResearchLogistics` (directs labs to research)
 * 
 * Architecture notes:
 * The functions in this class:
 * - Have the authority to write to the global state (but the state writing is delegated to `hq_toc.js`)
 * - Should make decisions on what course of action to take, but should handle no direct execution (this should be delegated to other functions)
 * - Should make decisions informed by courses of action proposed by the staff functions `hq_gX_Y`.
 * This models how a HQ at divisional level is structured in real life. Much of the terminology in this bot is borrowed from the real world.
 */
class CommandCenter {
	constructor() {

		this.toc = new TacticalOperationsCenter();

		/*
			This constructor is intended to contain *all* FishBot parameters which change how it behaves.
		*/

		// Oil strategic parameters
		this.isOilDominant = false;					// reports whether or not FishBot has enough oil (for the time being)

		// Intelligence parameters
		this.TARGET_SEARCH_RADIUS = 25;				// how many tiles away from the brigadeLocation to look for enemies (impacts computational performance)

		// Ground targeting
		this.NUMBER_OF_BRIGADES = 4;
		this.BRIGADE_DESIGNATIONS = BRIGADE_IDS.slice(0, this.NUMBER_OF_BRIGADES);

		const DEFAULT_FISHBOT_BRIGADE_COMPOSITION = {
			'MAX_HEAVY_CAVALRY': 3,
			'MAX_LIGHT_CAVALRY': 3,
			'MAX_MORTAR': 4,
			'MAX_ADA': 2,
			'MAX_SENSOR': 1,
			'MAX_INFANTRY': 6,
			'MAX_REPAIR': 1,
		};

		const TOTAL_UNITS_PER_BRIGADE = Object.values(DEFAULT_FISHBOT_BRIGADE_COMPOSITION).reduce((a, b) => a + b, 0);

		const MAX_DIRECT_FIRE_UNITS = DEFAULT_FISHBOT_BRIGADE_COMPOSITION.MAX_HEAVY_CAVALRY + DEFAULT_FISHBOT_BRIGADE_COMPOSITION.MAX_LIGHT_CAVALRY + DEFAULT_FISHBOT_BRIGADE_COMPOSITION.MAX_INFANTRY;

		/** @type {GroundForceParameters} */
		this.GROUND_FORCE_PARAMETERS = {
			IMMEDIATE_DIRECT_FIRE_RADIUS: 10,
			DIRECT_FIRE_COMMITMENT_RADIUS: 20,		// a committed target is only released once it is further away than this (or dead / unreachable)

			// Direct fire cost weights, applied by `directFireCost()` as multipliers on the *squared* distance to the
			// target. Below 1.0 promotes a target, above 1.0 demotes it. Squared, so a weight of w lets a promoted target
			// sit 1/sqrt(w) times further away than a rival and still win: 0.2 => ~2.2x, 0.25 => 2x, 0.56 => ~1.3x.
			TARGET_ADJACENCY_RADIUS: 8,				// how close a target must be to the current battle to count as "part of the same fight"
			COMMITMENT_WEIGHT: 0.2,					// the committed target only loses its place to something ~2.2x closer
			ADJACENCY_WEIGHT: 0.25,					// promotes further-away targets which are part of the same fight (e.g. the rest of an enemy base)
			KNOCKOUT_WEIGHT: 0.56,					// promotes targets which the brigade has already damaged
			LOW_HEALTH_THRESHOLD: 50,				// a target below this health percentage is considered worth finishing off

			EFFECTIVE_FIRE_SUPPORT_RADIUS: 10,		// todo: this should be adaptive - when the brigade has a sensor, this is better, without, it is restricted by sight range of the front units
			EFFECTIVE_ADA_RADIUS: 12,
			MEDIAN_CENTER_STRENGTH_THRESHOLD: Math.ceil(0.50 * MAX_DIRECT_FIRE_UNITS),		// at/above this brigade strength, the brigade position estimator switches from average to median which changes the aggression of the brigade
		};

		// Aviation parameters
		/** @type {AviationParameters} */
		this.AVIATION_PARAMETERS = {
			totalNumAircraft: 0,
			prioritiseCasTargets: false,
			prioritiseIndustrialTargets: false,
			prioritiseRaidTargets: false,
			SATURATION_RAID_ACTIVE: false,
			STANDARD_THREAT_THRESHOLD: 0,
			URGENT_THREAT_THRESHOLD: 0,
			SATURATION_THREAT_THRESHOLD: 0,
			CAS_SUPPORT_RADIUS: 25,
			UNITS_FOR_ADA_STRIKE: 3,
		};

		// Construction parameters
		/** @type {ConstructionParameters} */
		this.CONSTRUCTION_PARAMETERS = {
			// Concurrency
			MAX_PARALLEL_BASE_BUILD_TASKS: 1,
			MAX_PARALLEL_OIL_CAP_TASKS: 4,
			MAX_PARALLEL_DEFENCE_BUILD_TASKS: 1,
			MAX_PARALLEL_REPAIR_CENTER_BUILD_TASKS: 1,
			ABORTED_SECTOR_COOLDOWN_MS: 30000,		// how long a sector aborted as dangerous stays off the option list

			// Structure limits
			MAX_GENERATORS_AND_POWER_MODULES: 2,
			MAX_VTOL_REARMING_PADS: 2, 
			SHOULD_BUILD_VTOLS: false,
			SHOULD_USE_FACTORY_MODULES: false,
		};

		// Production parameters
		/** @type {Map<number, number>} */
		const DEFAULT_BRIGADE_WEIGHTS = new Map([
			[DIVISION.FIRST_BCT, 16], 
			[DIVISION.SECOND_BCT, 8], 
			[DIVISION.THIRD_BCT, 4], 
			[DIVISION.FOURTH_BCT, 2], 
			[DIVISION.FIFTH_BCT, 0],
			[DIVISION.BCT_RESERVE, 1],
		]);
		
		/** @type {Map<number, number>} */
		const DEFAULT_UNIT_WEIGHTS = new Map([
			// Production weights (which influences production order) are tuned using `python_helper_scripts / production_scheduling.py`.
			// Must be rebalanced each time the brigade composition is changed.	
			[DIVISION.HEAVY_CAV_RESERVE, 0.95],
			[DIVISION.LIGHT_CAV_RESERVE, 1.0],
			[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 0.7],
			[DIVISION.AIR_DEFENCE_RESERVE, 0.65],
			[DIVISION.SENSOR_RESERVE, 0.25],
			[DIVISION.MAINTENANCE_RESERVE, 0.5],
		]);

		/** @type {ProductionParameters} */
		this.PRODUCTION_RESUPPLY_PARAMETERS = {
			CAN_DESIGN_UNITS: false,

			SHOULD_PRODUCE_TRUCKS: true,
			MAX_TRUCKS_THIS_TICK: 1,
			CYBORG_CONSTRUCTOR_AVAILABLE: false,
			MAX_TRUCKS: 8,
			
			BRIGADE_WEIGHTS: DEFAULT_BRIGADE_WEIGHTS,
			BRIGADE_COMPOSITION: DEFAULT_FISHBOT_BRIGADE_COMPOSITION,
			TOTAL_UNITS_PER_BRIGADE: TOTAL_UNITS_PER_BRIGADE,		
			
			UNIT_WEIGHTS: DEFAULT_UNIT_WEIGHTS,
			DEFAULT_LAND_UNIT_CATEGORY: DIVISION.LIGHT_CAV_RESERVE,
			SHOULD_PRODUCE_INFANTRY: false,
			SHOULD_PRODUCE_VTOLS: false,
			SHOULD_PRODUCE_LAND_VEHICLES: false,

			VEHICLE_REPAIR_THRESHOLD: 30,
			CYBORG_REPAIR_THRESHOLD: 45,

			STRENGTH_DECAY_RATE: 1		// max direct-fire units that a brigade's estimated strength may drop by per update
		};
		
		// Research parameters
		const defaultResearchPath = rnd.researchOrders.getT2CannonResearchPath();

		/** @type {ResearchParameters} */
		this.RESEARCH_PARAMETERS = {
			path: defaultResearchPath,
		};

		// Task scheduling parameters
		// Add regular, high priority, high computational load tasks to the start of the list.
		// Update `_run.js` if any of the below task names change.
		this.TASK_SCHEDULE = {
			'combat_runC2': {"requestsPerMin": 60},
			'global_missionManager': {"requestsPerMin": 60},
			'logistics_runConstruction': {"requestsPerMin": 60},
			'logistics_runResupplyLogistics': {"requestsPerMin": 30},
			'intel_getNearbyGroundTargets': {"requestsPerMin": 20},
			'logistics_runStructureLogistics': {"requestsPerMin": 15},
			'intel_getMapIntelligence': {"requestsPerMin": 12},		
			'intel_getAviationTargets': {"requestsPerMin": 10},
			'runStrategy': {"requestsPerMin": 6},
		};
	}

	/**
	 * @param {worldState} state 
	 */
	initialise(state) {
		this.toc.setDefaultMissions(state);			
		this.toc.setSchedulerParameters(state, this.TASK_SCHEDULE);
		this.updateStrategicParameters(state);		// initialises all strategic parameters to realistic values
	}

	///////////////////////////////////////////////////     STRATEGY     ///////////////////////////////////////////////////

	/**
	 * Updates FishBot's strategic parameters with evolution of the game state.
	 * The intent is `_world_state.js` stores the objective world, while `hq_command.js` stores the decisions based on observations of that state.
	 * @param {worldState} state 
	 * @returns {void} Writes directly to `this`.
	 */
	updateStrategicParameters(state) {

		// Gather information from state
		const playerInfo = state.playerInfo;
		const TOTAL_DERRICKS = state.poi.derricks.length;
		const MY_DERRICK_COUNT = playerInfo[me].numDerricks;

		const livingPlayers = state.enumLivingPlayers();
		const ALIVE_PLAYER_COUNT = Math.max(livingPlayers.length, 1);

		const DOMINANT_OIL_SHARE = 1.2;

		// The following code sets the current FishBot strategic parameters

		/*
			Oil parameters (the most important strategic resource)
			Warzone 2100 lacks the concepts of food, fuel for vehicles & aircraft and ammunition (VTOL only).
				- Supply of oil: Combat operations + oil capture (at the moment - no cost to construct a derrick)
				- Demand of oil: Production, construction, research
		*/
		const DERRICKS_PER_PLAYER = Math.ceil(TOTAL_DERRICKS / ALIVE_PLAYER_COUNT);
		const o = [];

		let oilDominance = false;

		if (livingPlayers.length > 0) {
			livingPlayers.forEach(playerID => {
				o.push([playerID, playerInfo[playerID].numDerricks / DERRICKS_PER_PLAYER]);
			});

			o.sort((a, b) => b[1] - a[1]);			// largest to smallest oil share
			
			const oilShare = new Map(o);

			const largestOilSharePlayer = o[0][0];
			const LARGEST_OIL_SHARE = oilShare.get(largestOilSharePlayer);
			const MY_OIL_SHARE = oilShare.get(me);

			const BIG_OIL_SHARE = (MY_OIL_SHARE > DOMINANT_OIL_SHARE) || (MY_DERRICK_COUNT >= Math.ceil(0.85 * TOTAL_DERRICKS));
			const BIGGEST_OIL_SHARE = MY_OIL_SHARE >= LARGEST_OIL_SHARE;

			oilDominance = BIG_OIL_SHARE && BIGGEST_OIL_SHARE;
		}

		if (this.isOilDominant != oilDominance) {
			const derrickCount = `${MY_DERRICK_COUNT} out of ${TOTAL_DERRICKS} (${Math.ceil(MY_DERRICK_COUNT / TOTAL_DERRICKS * 100)}%)`;
			deb(`oil dominance changed to: ${oilDominance} (${derrickCount})`);
			this.isOilDominant = oilDominance;
		}

		/*
			CONSTRUCTION PARAMETERS
		*/

		// Concurrency
		const MAX_PARALLEL_BASE_BUILD_TASKS = 1;
		const MAX_PARALLEL_OIL_CAP_TASKS = 4;
		const MAX_PARALLEL_DEFENCE_BUILD_TASKS = (gameTime < 180000) ? 1 : 2;		// hack; tuned for Gamma
		const MAX_PARALLEL_REPAIR_CENTER_BUILD_TASKS = 1;

		this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_BASE_BUILD_TASKS = MAX_PARALLEL_BASE_BUILD_TASKS;
		this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_OIL_CAP_TASKS = MAX_PARALLEL_OIL_CAP_TASKS;
		this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_DEFENCE_BUILD_TASKS = MAX_PARALLEL_DEFENCE_BUILD_TASKS;
		this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_REPAIR_CENTER_BUILD_TASKS = MAX_PARALLEL_REPAIR_CENTER_BUILD_TASKS;

		// Structure limit adaptation
		const generatorsRequired = Math.ceil((MY_DERRICK_COUNT + 1) / 4);		// + 1 is here to provide extra capacity
		const MIN_GENERATORS = 2;

		const MAX_GENERATORS_AND_POWER_MODULES = clampValue(generatorsRequired, MIN_GENERATORS, state.getMaxStructureCount("Power Generator"));

		const USE_VTOL = (MY_DERRICK_COUNT >= 8);
		const USE_FACTORY_MODULES = (MY_DERRICK_COUNT >= 6);
		const MY_VTOL_COUNT = state.playerInfo[me]['numAirUnits'];

		this.CONSTRUCTION_PARAMETERS.MAX_GENERATORS_AND_POWER_MODULES = MAX_GENERATORS_AND_POWER_MODULES;
		this.CONSTRUCTION_PARAMETERS.MAX_VTOL_REARMING_PADS = MY_VTOL_COUNT;
		this.CONSTRUCTION_PARAMETERS.SHOULD_BUILD_VTOLS = USE_VTOL;
		this.CONSTRUCTION_PARAMETERS.SHOULD_USE_FACTORY_MODULES = USE_FACTORY_MODULES;

		/*
			PRODUCTION
		*/
		const BRIGADE_COMPOSITION = this.PRODUCTION_RESUPPLY_PARAMETERS.BRIGADE_COMPOSITION;
		const NUMBER_OF_BRIGADES = this.NUMBER_OF_BRIGADES;

		// Define unit limits
		const MAX_TRUCKS = this.PRODUCTION_RESUPPLY_PARAMETERS.MAX_TRUCKS;
		const MAX_INFANTRY = BRIGADE_COMPOSITION['MAX_INFANTRY'];
		const TOTAL_UNITS_PER_BRIGADE = this.PRODUCTION_RESUPPLY_PARAMETERS.TOTAL_UNITS_PER_BRIGADE;
		
		const TRUCK_HARD_LIMIT = state.getMaxUnitCount("DROID_CONSTRUCT");
		const TRUCK_SOFT_LIMIT = Math.min(TRUCK_HARD_LIMIT, MAX_TRUCKS);

		const COMBAT_UNIT_HARD_LIMIT = state.getMaxUnitCount("DROID_WEAPON") - TRUCK_SOFT_LIMIT;
		const INFANTRY_UNIT_SOFT_LIMIT = MAX_INFANTRY * (NUMBER_OF_BRIGADES + 1);		// "+1" includes reserve
		const LAND_VEHICLE_SOFT_LIMIT = (TOTAL_UNITS_PER_BRIGADE - MAX_INFANTRY) * (NUMBER_OF_BRIGADES + 1);
		const VTOL_UNIT_HARD_LIMIT = COMBAT_UNIT_HARD_LIMIT - LAND_VEHICLE_SOFT_LIMIT - INFANTRY_UNIT_SOFT_LIMIT;

		// Get player data
		const HQ_IS_CONSTRUCTED = state.playerInfo[me]["numConstructedHQs"] > 0;
		const cyborgFactories = state.playerInfo[me]["cyborgFactoryFbObjects"];
		const CYBORG_CONSTRUCTOR_AVAILABLE = cyborgFactories.length > 0;
		const MY_TRUCK_COUNT = state.playerInfo[me]["numTrucks"];
		const MY_INFANTRY_COUNT = state.playerInfo[me]["numInfantryUnits"];

		// todo: add sensor + repair to land vehicle count
		const MY_LAND_VEHICLE_COUNT = (state.playerInfo[me]["numArmourUnits"] + state.playerInfo[me]["numADAUnits"] + 
									   state.playerInfo[me]["numShortRangeIndirectUnits"] + state.playerInfo[me]["numLongRangeIndirectUnits"]);
			
		// const MY_VTOL_COUNT = state.playerInfo[me]["numAirUnits"];		// declared above

		// Compare to limits
		const HIT_TRUCK_LIMIT = MY_TRUCK_COUNT >= TRUCK_SOFT_LIMIT;
		const HIT_INFANTRY_LIMIT = MY_INFANTRY_COUNT >= INFANTRY_UNIT_SOFT_LIMIT;
		const HIT_LAND_VEHICLE_LIMIT = MY_LAND_VEHICLE_COUNT >= LAND_VEHICLE_SOFT_LIMIT;
		const HIT_AIR_UNIT_LIMIT = MY_VTOL_COUNT >= VTOL_UNIT_HARD_LIMIT;

		if (false) {
			debug(`==${gameTime}: (FishBot ${me}) PRODUCTION LIMITS==`);
			debug(`  HIT_TRUCK_LIMIT: ${MY_TRUCK_COUNT} >= ${TRUCK_SOFT_LIMIT}?`);
			debug(`  HIT_INFANTRY_LIMIT: ${MY_INFANTRY_COUNT} >= ${INFANTRY_UNIT_SOFT_LIMIT}?`);
			debug(`  HIT_LAND_VEHICLE_LIMIT: ${MY_LAND_VEHICLE_COUNT} >= ${LAND_VEHICLE_SOFT_LIMIT}?`);
			debug(`  HIT_AIR_UNIT_LIMIT: ${MY_VTOL_COUNT} >= ${VTOL_UNIT_HARD_LIMIT}?`);
		}
		
		// Get unit deficits
		// Decide on whether or not to produce combat units
		// Note: FishBot will not build combat vehicles before it can design them, on any difficulty.	
		const CAN_DESIGN_UNITS = HQ_IS_CONSTRUCTED;

		const SHOULD_PRODUCE_LAND_VEHICLES = CAN_DESIGN_UNITS && !HIT_LAND_VEHICLE_LIMIT;
		const SHOULD_PRODUCE_INFANTRY = !HIT_INFANTRY_LIMIT;
		const SHOULD_PRODUCE_VTOLS = CAN_DESIGN_UNITS && !HIT_AIR_UNIT_LIMIT;

		// Decide on whether or not to produce trucks
		const SHOULD_PRODUCE_TRUCKS = !HIT_TRUCK_LIMIT;
		const MAX_TRUCKS_THIS_TICK = 1;

		// Brigade production priorities
		/** @type {Map<number, number>} */
		const brigadeWeights = new Map([
			[DIVISION.FIRST_BCT, 16], 
			[DIVISION.SECOND_BCT, 8], 
			[DIVISION.THIRD_BCT, 4], 
			[DIVISION.FOURTH_BCT, 2], 
			[DIVISION.FIFTH_BCT, 0],
			[DIVISION.BCT_RESERVE, 1],
		]);
		
		/** @type {Map<number, number>} */
		const unitWeights = new Map([
			// Production weights (which influences production order) are tuned using `python_helper_scripts / production_scheduling.py`.
			// Must be rebalanced each time the brigade composition is changed.	
			[DIVISION.HEAVY_CAV_RESERVE, 0.95],
			[DIVISION.LIGHT_CAV_RESERVE, 1.0],
			[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 0.7],
			[DIVISION.AIR_DEFENCE_RESERVE, 0.65],
			[DIVISION.SENSOR_RESERVE, 0.25],
			[DIVISION.MAINTENANCE_RESERVE, 0.5],
		]);

		const DEFAULT_LAND_UNIT_CATEGORY = DIVISION.LIGHT_CAV_RESERVE;

		this.PRODUCTION_RESUPPLY_PARAMETERS.CAN_DESIGN_UNITS = CAN_DESIGN_UNITS;

		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_TRUCKS = SHOULD_PRODUCE_TRUCKS;
		this.PRODUCTION_RESUPPLY_PARAMETERS.MAX_TRUCKS_THIS_TICK = MAX_TRUCKS_THIS_TICK;
		this.PRODUCTION_RESUPPLY_PARAMETERS.CYBORG_CONSTRUCTOR_AVAILABLE = CYBORG_CONSTRUCTOR_AVAILABLE;

		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_INFANTRY = SHOULD_PRODUCE_INFANTRY;
		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_VTOLS = SHOULD_PRODUCE_VTOLS;
		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_LAND_VEHICLES = SHOULD_PRODUCE_LAND_VEHICLES;
		this.PRODUCTION_RESUPPLY_PARAMETERS.BRIGADE_WEIGHTS = brigadeWeights;
		this.PRODUCTION_RESUPPLY_PARAMETERS.UNIT_WEIGHTS = unitWeights;
		this.PRODUCTION_RESUPPLY_PARAMETERS.DEFAULT_LAND_UNIT_CATEGORY = DEFAULT_LAND_UNIT_CATEGORY;

		/*
			AVIATION
		*/
		const IS_OIL_DOMINANT = this.isOilDominant;
		const NUM_AIRCRAFT = state.playerInfo[me].numAirUnits;	
		const AIR_UNIT_DOMINANCE = NUM_AIRCRAFT >= 10;

		let maxCasTargets = 0;
		let numUrgentCasMissions = 0;

		this.BRIGADE_DESIGNATIONS.forEach(id => {
			const casStrikeRequests = state.brigades[id]['casStrikeRequests'];

			const targetsInRadius = casStrikeRequests.length;
			maxCasTargets = Math.max(maxCasTargets, targetsInRadius);

			casStrikeRequests.forEach(r => {
				if (r.priority === MISSION_PRIORITY.URGENT) {
					numUrgentCasMissions += 1
				}
			});
		});

		const prioritiseCasTargets = IS_OIL_DOMINANT && (numUrgentCasMissions >= 1 || maxCasTargets >= 4);
		const prioritiseRaidTargets = !IS_OIL_DOMINANT;
		const prioritiseIndustrialTargets = IS_OIL_DOMINANT;
		const SATURATION_RAID_ACTIVE = prioritiseIndustrialTargets && AIR_UNIT_DOMINANCE;
		
		// The following thresholds set no-fly regions. Modify the threshold to match the "hq_toc/updateSpatialFields" spatial filter.
		//	0 => avoids all anti-air defences, 
		//	0.69 > (0.33 * 2) => allows targeting 1 cell over from a single air defence. 
		//	2 => allows 2 air defences in one isolated cell (with no cells directly adjacent containing anti-air defences) or adjacent air defences - 1 per cell.
		const STANDARD_THREAT_THRESHOLD = IS_OIL_DOMINANT ? 0.69 : 0;		
		const URGENT_THREAT_THRESHOLD = 2;
		const SATURATION_THREAT_THRESHOLD = 2;	

		this.AVIATION_PARAMETERS.totalNumAircraft = NUM_AIRCRAFT;
		this.AVIATION_PARAMETERS.prioritiseCasTargets = prioritiseCasTargets;
		this.AVIATION_PARAMETERS.prioritiseRaidTargets = prioritiseRaidTargets;
		this.AVIATION_PARAMETERS.prioritiseIndustrialTargets = prioritiseIndustrialTargets;
		this.AVIATION_PARAMETERS.SATURATION_RAID_ACTIVE = SATURATION_RAID_ACTIVE;

		this.AVIATION_PARAMETERS.STANDARD_THREAT_THRESHOLD = STANDARD_THREAT_THRESHOLD;
		this.AVIATION_PARAMETERS.URGENT_THREAT_THRESHOLD = URGENT_THREAT_THRESHOLD;
		this.AVIATION_PARAMETERS.SATURATION_THREAT_THRESHOLD = SATURATION_THREAT_THRESHOLD;
		this.AVIATION_PARAMETERS.CAS_SUPPORT_RADIUS = 25;
		this.AVIATION_PARAMETERS.UNITS_FOR_ADA_STRIKE = 3;
	}
	
	/////////////////////////////////////////////////// G2: INTELLIGENCE ///////////////////////////////////////////////////

	/**
	 * Performs targeting & writes the result to `state`.
	 * @param {worldState} state
	 * @param {string} taskName
	 * @returns {void}
	 */
	runTargeting(state, taskName) {

		switch(taskName) {

			case 'intel_getNearbyGroundTargets':
				// Update location(s) & target(s) of active combat force(s)
				this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
					const brigadeLocation = groundForces.getForceCenterLoc(state, brigadeID, this.GROUND_FORCE_PARAMETERS);
					this.toc.setBrigadeLocation(state, brigadeID, brigadeLocation);

					const nearbyTargets = intelligence.getTargetClassesInRadius(state, brigadeLocation, this.TARGET_SEARCH_RADIUS);
					this.toc.addBrigadeTargets(state, brigadeID, nearbyTargets);
				});
				break;

			case 'intel_getAviationTargets':
				const raidTargets = intelligence.getTargetsNearDerricksLazy(state);
				const baseTargets = intelligence.getBaseTargetsLazy(state);
				this.toc.setAviationTargets(
					state, 
					raidTargets, 
					baseTargets['productionTargets'], 
					baseTargets['adaTargets'],  
					baseTargets['indirectFireTargets'],  
					baseTargets['defensiveStructureTargets']
				);
				break;

			default:
				warn(`runTargeting(): could not understand "${taskName}". Ignoring.`);
				return;
		}
	}

	/**
	 * Gathers game information directly from the game engine and stores it in the shared `state`.
	 * @param {worldState} state
	 * @returns {void}
	 */
	runIntelligence(state) {	
		this.toc.updateCoreIntel(state);	
	}

	/////////////////////////////////////////////////// G3: COMBAT OPERATIONS ///////////////////////////////////////////////////

	/**
	 * Returns `true` if all of the sublists of a target array are empty, else `false`.
	 * @param {BrigadeTargets | NearbyTargets} targetArray 
	 * @returns {boolean}
	 */
	#noTargetsAvailable(targetArray) {
		for (const metadata of Object.values(targetArray)) {
			if (Array.isArray(metadata)) {
				if (metadata.length !== 0) {
					return false;
				}
			}
		}
		return true;
	}

	/**
	 * This function returns a list of prioritised Droid / Structure Objects (fresh data) which can be directly used in the `__tac` functions.
	 * @param {worldState} state 
	 * @param {number} brigadeID 
	 * @param {GroundForceParameters} parameters
	 * @returns {BrigadeTargets} Intent: (DroidObject | StructureObject)[]	
	 */
	#prioritiseBrigadeTargets(state, brigadeID, parameters) {

		const isReachable = state.mapData.isReachable;

		/** @type {BrigadeTargets} */
		const brigadeTargets = {
			"directFireTargets": [], 
			"fireSupportTargets": [],
			"adaTargets": [], 
			"casTargets": [],
			"directFireTargetRefs": [],
		};

		const x = state.brigades[brigadeID].location.x;
		const y = state.brigades[brigadeID].location.y;

		const TARGETS = state.brigades[brigadeID].nearbyTargets;
		const PREVIOUS_TARGET = state.brigades[brigadeID].currentDirectFireTargets[0];		

		if (this.#noTargetsAvailable(TARGETS)) {
			return brigadeTargets;
		}

		/**
		 * Pairs each target with a freshly fetched game object, dropping any which is gone or unreachable.
		 * @param {FbObject[]} targetList
		 * @returns {TargetCandidate[]}
		 */
		const getCandidates = (targetList) => {
			const candidates = [];
			targetList.forEach(target => {
				const targetObj = getObject(target.type, target.player, target.id);
				if (targetObj == null) {
					return;
				}
				const ON_ISLAND_OR_WATER = !isReachable[targetObj.x][targetObj.y];
				if (ON_ISLAND_OR_WATER) {
					return;
				}
				candidates.push({'target': target, 'targetObj': targetObj, 'cost': 0});
			});
			return candidates;
		}

		const enemyArmor = getCandidates(TARGETS['enemyArmor']);
		const enemyInfantry = getCandidates(TARGETS['enemyInfantry']);
		const enemyIndirectFire = getCandidates(TARGETS['enemyIndirectFire']);
		const enemyADA = getCandidates(TARGETS['enemyADA']);
		const enemyConstructor = getCandidates(TARGETS['enemyConstructor']);
		const enemyIndustrial = getCandidates(TARGETS['enemyIndustrial']);
		const enemyUtility = getCandidates(TARGETS['enemyUtility']);
		const enemyDefenses = getCandidates(TARGETS['enemyDefenses']);
		
		/** @param {DroidObject | StructureObject | FeatureObject | PositionInfo | FbObject | null} obj */
		const outsideOfRadius = (obj, radius) => {
			if (obj == null) {
				return true;
			}
			const d = distSq(obj.x, x, obj.y, y);		
			if (d > radius ** 2) {		
				return true;
			} else {
				return false;
			}
		}

		/*
			Direct Fire Targeting
			Intent: attack what is closest (distSq to brigade) and see the current battle to completion (e.g. distSq to current target, health).
			The targets in radius have their cost adjusted (percentage-based) based on proximity to the current battle & various other factors.
		*/

		// Where the brigade's fight is, or `null` if it is not near one. Relies on FbObject carrying the stale 'x', 'y'.
		let CURRENT_BATTLE_LOCATION = null;
		const PREV_TARGET_DEFINED = PREVIOUS_TARGET != null;
		const PREV_TARGET_TOO_FAR_AWAY = outsideOfRadius(PREVIOUS_TARGET, parameters.DIRECT_FIRE_COMMITMENT_RADIUS);
		if (PREV_TARGET_DEFINED && !PREV_TARGET_TOO_FAR_AWAY) {
			CURRENT_BATTLE_LOCATION = PREVIOUS_TARGET;
		}

		/**
		 * Re-acquires lock on the existing target. Lock released when the target was destroyed, is unreachable, or the brigade is now too far from it.
		 * @param {FbObject | undefined} previousTarget
		 * @returns {DroidObject | StructureObject | FeatureObject | null}
		 */
		const getCommittedTarget = (previousTarget) => {
			if (previousTarget == null) {
				return null;
			}
			const obj = getObject(previousTarget.type, previousTarget.player, previousTarget.id);
			if (obj == null) {
				return null;		// destroyed
			}
			if (!isReachable[obj.x][obj.y]) {
				return null;		// on an island / water terrain
			}
			if (outsideOfRadius(obj, parameters.DIRECT_FIRE_COMMITMENT_RADIUS)) {
				return null;		// the brigade has been pushed (or has wandered) off this fight
			}
			return obj;
		};

		const COMMITTED_TARGET_OBJ = getCommittedTarget(PREVIOUS_TARGET);

		const COMMITTED_TARGET_FOUND = COMMITTED_TARGET_OBJ != null;

		/** @param {TargetCandidate} c */
		const isCommittedTarget = (c) => COMMITTED_TARGET_FOUND && c.target.id === PREVIOUS_TARGET.id && c.target.player === PREVIOUS_TARGET.player;

		const ADJACENCY_RADIUS_SQ = parameters.TARGET_ADJACENCY_RADIUS ** 2;

		/** @param {TargetCandidate} c */
		const directFireCost = (c) => {
			const obj = c.targetObj;
			let cost = distSq(x, obj.x, y, obj.y);

			if (isCommittedTarget(c)) {
				// Inertia 1: Prefers the existing target 
				cost *= parameters.COMMITMENT_WEIGHT;
			} else if (CURRENT_BATTLE_LOCATION != null && distSq(obj.x, CURRENT_BATTLE_LOCATION.x, obj.y, CURRENT_BATTLE_LOCATION.y) <= ADJACENCY_RADIUS_SQ) {
				// Inertia 2: Prefers targets near the current battle
				cost *= parameters.ADJACENCY_WEIGHT;
			}
			if (obj.health < parameters.LOW_HEALTH_THRESHOLD) {
				// Opportunity 1: Prefers weak targets if available
				cost *= parameters.KNOCKOUT_WEIGHT;
			}
			return cost;
		}

		const primaryDroidTargets = [...enemyArmor, ...enemyInfantry, ...enemyDefenses];
		const secondaryDirectFireTargets = [...enemyIndirectFire, ...enemyADA, ...enemyIndustrial];
		const tertiaryDirectFireTargets = [...enemyConstructor, ...enemyUtility];

		const directFireTargetsInRange = [];
		const targetsOutOfRange = [];		

		let FOUND_COMMITTED_TARGET_IN_RANGE = false;

		/** @param {TargetCandidate[]} candidates */
		const addDirectFireTargetByProximity = (candidates) => {
			candidates.forEach(c => {
				if (isCommittedTarget(c)) {		
					FOUND_COMMITTED_TARGET_IN_RANGE = true;
					directFireTargetsInRange.push(c);
					return;					
				}
				if (outsideOfRadius(c.targetObj, parameters.IMMEDIATE_DIRECT_FIRE_RADIUS)) {
					targetsOutOfRange.push(c);
				} else {
					directFireTargetsInRange.push(c);
				}
			});
		};

		addDirectFireTargetByProximity(primaryDroidTargets);
		addDirectFireTargetByProximity(secondaryDirectFireTargets);
		addDirectFireTargetByProximity(tertiaryDirectFireTargets);

		// Note: currently, `nearbyTargets` (INTEL) is refreshed less often than combat operations run (RUN_C2), so the committed target can be missing
		// from RUNC2 for a cycle (as RUNC2 finds out that the target is destroyed first). Re-inserting it stops a gap from breaking the brigade's commitment.
		if (COMMITTED_TARGET_FOUND && !FOUND_COMMITTED_TARGET_IN_RANGE) {
			directFireTargetsInRange.push({'target': PREVIOUS_TARGET, 'targetObj': COMMITTED_TARGET_OBJ, 'cost': 0});
		}

		directFireTargetsInRange.forEach(c => {c.cost = directFireCost(c);});
		directFireTargetsInRange.sort((a,b) => a.cost - b.cost);		// Note: this ignores the primary/secondary/tertiary ordering currently; cost based on type will be added later.

		const MAX_DIRECT_FIRE_TARGETS = 8;
		const targetDeficit = MAX_DIRECT_FIRE_TARGETS - directFireTargetsInRange.length;
		if (targetDeficit > 0) {
			targetsOutOfRange.sort((a,b) => distSq(x, a.targetObj.x, y, a.targetObj.y) - distSq(x, b.targetObj.x, y, b.targetObj.y));
			directFireTargetsInRange.push(...targetsOutOfRange.slice(0, targetDeficit));
		}

		directFireTargetsInRange.forEach(c => {
			brigadeTargets['directFireTargets'].push(c.targetObj);
			brigadeTargets['directFireTargetRefs'].push(c.target);
		});

		if (false) {
			// Draw lines to the top 3 targets (to see what the brigade is trying to attack)
			for (let i=0; i<Math.min(brigadeTargets['directFireTargets'].length, 3); i++) {
				const target = brigadeTargets['directFireTargets'][i];
				const lineToTarget = drawLine(x, y, target.x, target.y);
				lineToTarget.forEach(point => highlightTiles(point[0], point[1]));		
			}
		}

		// Fire Support Targeting
		// Intent: Suppress enemy infantry then destroy defences, indirect fires & ADA.
		const primaryIndirectFireTargets = [...enemyInfantry, ...enemyDefenses, ...enemyIndirectFire, ...enemyADA, ...enemyIndustrial, ...enemyArmor];
		const secondaryIndirectFireTargets = [...enemyConstructor, ...enemyUtility];

		primaryIndirectFireTargets.forEach(c => {
			if (outsideOfRadius(c.targetObj, parameters.EFFECTIVE_FIRE_SUPPORT_RADIUS)) 	return;
			brigadeTargets["fireSupportTargets"].push(c.targetObj);
		});

		secondaryIndirectFireTargets.forEach(c => {
			if (outsideOfRadius(c.targetObj, parameters.EFFECTIVE_FIRE_SUPPORT_RADIUS)) 	return;
			brigadeTargets["fireSupportTargets"].push(c.targetObj);
		});

		const FALLBACK_TO_DIRECT_FIRE_TARGETS = (brigadeTargets["fireSupportTargets"].length === 0);
		if (FALLBACK_TO_DIRECT_FIRE_TARGETS) {
			brigadeTargets["fireSupportTargets"].push(...brigadeTargets['directFireTargets']);
		}		

		// CAS Targeting (Close Air Support)
		// Intent: `casTargets` should be a list of mission requests interpretable by a following call of `#prioritiseAviationTargets`.
		const primaryCASTargets = [...enemyIndirectFire];
		const secondaryCASTargets = [...enemyADA, ...enemyArmor, ...enemyDefenses];

		const isHealthy = (obj) => obj.health > 25;
		secondaryCASTargets.forEach(c => {
			if (isHealthy(c.targetObj)) {
				brigadeTargets['casTargets'].unshift(aviation.translateIntoCASRequest(c.targetObj, MISSION_PRIORITY.VERY_HIGH));
			} else {
				brigadeTargets['casTargets'].push(aviation.translateIntoCASRequest(c.targetObj, MISSION_PRIORITY.HIGH));
			}			
		});

		primaryCASTargets.forEach(c => {
			const missionRequest = aviation.translateIntoCASRequest(c.targetObj, MISSION_PRIORITY.URGENT); 
			brigadeTargets['casTargets'].unshift(missionRequest);
		});

		// ADA Targeting (Air Defense Artillery)
		// Intent: Concentrate fire on one target.
		const enemyAircraft = getCandidates(TARGETS['enemyAviation']);		
		enemyAircraft.forEach(c => {
			const obj = c.targetObj;
			if (outsideOfRadius(obj, parameters.EFFECTIVE_ADA_RADIUS)) return;
			if (!('isFlying' in obj)) return;
			if (obj.isFlying !== true) return;
			brigadeTargets["adaTargets"].push(obj);
		});		
		brigadeTargets["adaTargets"].sort((a,b) => a.health - b.health);			

		return brigadeTargets;
	}

	/**
	 * Terminates aviation missions which are TWO PRIORITY LEVELS below. e.g. If new URGENT task -> cancel HIGH missions.
	 * @param {worldState} state 
	 * @param {AviationParameters} parameters 
	 * @returns {number[]}
	 */
	#filterPriorityAirMissions(state, parameters) {

		const adaThreat = state.fields.adaThreat;
		const cellSize = state.grid.cellSize;
		/** @type {PositionInfo[]} */
		const GROUP_POSITIONS = [];
		this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
			GROUP_POSITIONS.push(state.brigades[brigadeID].location);
		})

		const OFFENSIVE_MISSION_TYPES = [MISSION_TYPE.CAS_STRIKE, MISSION_TYPE.AIR_RAID, MISSION_TYPE.DAS_STRIKE];
		const activeMissions = this.toc.getActiveAviationMissions(state).filter(m => OFFENSIVE_MISSION_TYPES.includes(m.missionType));
		
		const activeTargetIDs = [];		// Intent: Even if cancelled, I want this knowledge that this task was present so that it can be pre-emptively removed from the target candidate list.
		
		activeMissions.forEach(c => {
			activeTargetIDs.push(c.target.id);

			const currObj = getObject(c.target.type, c.target.player, c.target.id);
			if (currObj == null) 	return;

			if (parameters.prioritiseCasTargets && c.missionType !== MISSION_TYPE.CAS_STRIKE) {
				// debug(`removed DAS / RAID mission to make room for CAS`);
				c.missionStatus = MISSION_STATUS.ABORT;
				return;
			}

			let threatThreshold = (c.priority === MISSION_PRIORITY.URGENT) ? parameters.URGENT_THREAT_THRESHOLD : parameters.STANDARD_THREAT_THRESHOLD;
			if (parameters.SATURATION_RAID_ACTIVE) {
				threatThreshold  = parameters.SATURATION_THREAT_THRESHOLD;
			}

			const gx = Math.floor(currObj.x / cellSize); 
			const gy = Math.floor(currObj.y / cellSize);
			if (adaThreat[gx][gy] > threatThreshold) {
				// debug(`	removed ACTIVE: ${currObj.name} (${c.missionType}) @ grid (${currObj.x} ${currObj.y})`);
				c.missionStatus = MISSION_STATUS.ABORT;		
				return;
			}

			const nearPosition = (gameObj, groupPos) => {return distSq(gameObj.x, groupPos.x, gameObj.y, groupPos.y) <= parameters.CAS_SUPPORT_RADIUS ** 2};
			if (c.missionType === MISSION_TYPE.CAS_STRIKE) {
				if (!GROUP_POSITIONS.some(p => nearPosition(currObj, p))) {
					// debug(`aborted CAS_STRIKE: ${c.target.name} @ ${gameTime}, too far away`);
					c.missionStatus = MISSION_STATUS.ABORT;					
					return;
				}
			}
		});

		return activeTargetIDs;
	}

	/**
	 * This function returns a list of prioritised Droid / Structure Objects (fresh data) which can be directly used in the `__tac` functions.
	 * @param {worldState} state 
	 * @param {AviationParameters} parameters
	 * @returns {AirStrikeMissionRequest[]}	
	 */
	#prioritiseAviationTargets(state, parameters) {

		const airRaidTargets = state.aviationTargets['raidTargets'];
		const industrialTargets = state.aviationTargets['productionTargets'];
		const adaTargets = state.aviationTargets['adaTargets'];
		adaTargets.forEach(t => {t.numAircraft = parameters.UNITS_FOR_ADA_STRIKE;});
		const indirectFireTargets = state.aviationTargets['indirectFireTargets'];
		const defensiveStructureTargets = state.aviationTargets['defensiveStructureTargets'];

		const adaThreat = state.fields.adaThreat;
		const cellSize = state.grid.cellSize;

		/** @type {AirStrikeMissionRequest[]} */
		const casTargets = [];
		this.BRIGADE_DESIGNATIONS.forEach(id => {
			casTargets.push(...state.brigades[id]['casStrikeRequests']);
		});
		casTargets.sort((a, b) => b.priority - a.priority);		// todo: prioritise based on brigade need (e.g. brigade weights); to be passed in 'parameters'
		
		const aviationTargets = [];
		let targetCandidates = [];

		const casPriorityTargets = [...casTargets, ...airRaidTargets];
		const raidPriorityTargets = [...airRaidTargets];

		if (parameters.prioritiseIndustrialTargets) {

			if (parameters.prioritiseCasTargets) {
				targetCandidates = [...casTargets, ...adaTargets, ...indirectFireTargets, ...defensiveStructureTargets, ...industrialTargets, ...airRaidTargets];
			} else {
				// Industrial strike
				if (parameters.SATURATION_RAID_ACTIVE) {
					targetCandidates = [...adaTargets, ...industrialTargets, ...indirectFireTargets, ...defensiveStructureTargets, ...casPriorityTargets];
				} else {
					targetCandidates = [...industrialTargets, ...indirectFireTargets, ...adaTargets, ...defensiveStructureTargets, ...casPriorityTargets];			
				}
			}

		} else if (parameters.prioritiseCasTargets) {
			targetCandidates = casPriorityTargets;
		} else if (parameters.prioritiseRaidTargets) {
			targetCandidates = raidPriorityTargets;
		} else {
			targetCandidates = casPriorityTargets;
		}

		if (targetCandidates.length === 0) {
			// debug(`${gameTime}: no target candidates; (CAS/RAID/IND = ${prioritiseIndustrialTargets}, ${prioritiseCasTargets}, ${prioritiseRaidTargets})`);
			return aviationTargets;
		} 
		
		const activeTargetObjIDs = this.#filterPriorityAirMissions(state, parameters);
		
		// Remove already active missions from the target candidate pool
		let newAviationTargets = [], existingAviationTargets = [];

		targetCandidates.forEach(missionRequest => {

			let threatThreshold = (missionRequest.priority === MISSION_PRIORITY.URGENT) ? parameters.URGENT_THREAT_THRESHOLD : parameters.STANDARD_THREAT_THRESHOLD;
			if (parameters.SATURATION_RAID_ACTIVE) {
				threatThreshold  = parameters.SATURATION_THREAT_THRESHOLD;
			}

			const t = missionRequest.target;

			const obj = getObject(t.type, t.player, t.id);
			if (obj == null) {
				return;
			};
			
			const gx = Math.floor(obj.x / cellSize); 
			const gy = Math.floor(obj.y / cellSize);
			if (adaThreat[gx][gy] > threatThreshold) {
				// debug(`	removed CANDIDATE, adaThreat: ${c.name} @ grid (${c.x} ${c.y})`);
				return;
			}

			if (activeTargetObjIDs.includes(obj.id)) {
				existingAviationTargets.push(missionRequest);
			} else {
				newAviationTargets.push(missionRequest);
			}
		});

		aviationTargets.push(...newAviationTargets);
		const TOO_MANY_AIRCRAFT = newAviationTargets.length <= Math.floor(parameters.totalNumAircraft / 2);
		if (TOO_MANY_AIRCRAFT) {
			aviationTargets.push(...existingAviationTargets);
		}

		return aviationTargets;
	}

	/**
	 * @param {worldState} state 
	 */
	runAviationOperations(state) {
		const aviationTargets = this.#prioritiseAviationTargets(state, this.AVIATION_PARAMETERS);

		this.toc.assignAviationMissions(state, aviationTargets);	
	}

	/**
	 * Directs brigades to maneuver to and attack land targets, as well as directing aircraft to support land efforts.
	 * @param {worldState} state 
	 */
	runCombatOperations(state) {

		const READY_TO_ATTACK = groundForces.isReadyToAttack(state);
		if (!READY_TO_ATTACK) {
			return;
		}

		clearAllTileHighlights();
		this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {

			const brigadeLocation = state.brigades[brigadeID]['location'];

			// const CLOSEST_ENEMY_BASE = intelligence.findClosestEnemyBase(state, brigadeLocation.x, brigadeLocation.y); 			

			const groundTargets = this.#prioritiseBrigadeTargets(state, brigadeID, this.GROUND_FORCE_PARAMETERS);

			this.toc.setBrigadeCASStrikeRequests(state, brigadeID, groundTargets['casTargets']);

			this.toc.setBrigadeDirectFireTargets(state, brigadeID, groundTargets['directFireTargetRefs']);

			if (this.#noTargetsAvailable(groundTargets)) {
				const CLOSEST_TARGET = intelligence.findClosestTarget(state, brigadeLocation.x, brigadeLocation.y); 
				if (CLOSEST_TARGET == undefined) {
					moveBrigadeToLocation(state, brigadeID, brigadeLocation.x, brigadeLocation.y);
					return;
				} 
				moveBrigadeToLocation(state, brigadeID, CLOSEST_TARGET.x, CLOSEST_TARGET.y);
				return;
			}
			
			moveBrigadeToAttack(state, brigadeID, groundTargets);	
			highlightTiles(brigadeLocation.x, brigadeLocation.y);
		});

		// Manage reserves: temporary: Move reserves to pre-emptively reinforce BCT0
		const reserveGroupIDs = [DIVISION.HEAVY_CAV_RESERVE, DIVISION.LIGHT_CAV_RESERVE, DIVISION.INFANTRY_RESERVE, DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, DIVISION.SENSOR_RESERVE, DIVISION.AIR_DEFENCE_RESERVE, DIVISION.MAINTENANCE_RESERVE];
		const x = state.brigades[DIVISION.FIRST_BCT]['location'].x;
		const y = state.brigades[DIVISION.FIRST_BCT]['location'].y;
		moveReservesToShadow(reserveGroupIDs, x, y);
	}

	/////////////////////////////////////////////////// G4: LOGISTICS ///////////////////////////////////////////////////
	/**
	 * This function aborts active construction missions where conditions at the build site have become too dangerous.
	 * @param {worldState} state
	 * @param {Array} activeRemoteMissions
	 * @returns {{abortedOilSectorIDs: (number | string)[], abortedDefenceSectorIDs: (number | string)[]}} the sectorIDs aborted, split by task type
	 */
	#abortDangerousConstructionTasks(state, activeRemoteMissions) {
		const cellSize = state.grid.cellSize;

		const enemyUnitThreat = state.fields.enemyUnitThreat;
		const enemyStaticDefenceThreat = state.fields.enemyStaticDefenceThreat;

		/** @type {(number | string)[]} */
		const abortedOilSectorIDs = [];
		/** @type {(number | string)[]} */
		const abortedDefenceSectorIDs = [];

		// New mission planning system has implemented .gx, .gy grid references for all missions
		// This allows the following algorithm:
		// 	1. Check threat @ grid ref
		//	2. Check truck distances to grid ref 
		//	3. Cancel mission
		activeRemoteMissions.forEach(md => {
			// Check unit threat at grid ref
			if (enemyUnitThreat[md.gx][md.gy] === 0 && enemyStaticDefenceThreat[md.gx][md.gy] === 0) {
				return;
			}
			
			// Check truck locations relative to grid ref
			const assignedTrucks = state.g.enumGroup(md.id);
			const moreThanOneCellAway = assignedTrucks.every(truck => {
				const tgx = Math.floor(truck.x / cellSize);
				const tgy = Math.floor(truck.y / cellSize);

				if (distSq(tgx, md.gx, tgy, md.gy) >= 1) {
					return true;
				} else {
					return false;
				}
			});

			if (moreThanOneCellAway) {
				// debug(`aborted (${md.id}) @ (~ tileco ${md.gx * cellSize} ${md.gy * cellSize}); high threat`);
				md.missionStatus = MISSION_STATUS.ABORT;

				// Todo: combine these into a unified concept of 'denied region' rather than keying by sectorID (resolves to derrickID)
				if (md.missionType === MISSION_TYPE.CONSTRUCT_OIL_DERRICK ||
					md.missionType === MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR) {
					abortedOilSectorIDs.push(md.sectorID);
				} else if (md.missionType === MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE) {
					abortedDefenceSectorIDs.push(md.sectorID);
				}
			}
		});

		return {abortedOilSectorIDs: abortedOilSectorIDs, abortedDefenceSectorIDs: abortedDefenceSectorIDs};
	}

	/**
	 * Organises the construction of structures, e.g. base building, oil capture (derricks & oil-defences) & repair facilities.
	 * @param {worldState} state 
	 */
	runConstructionLogistics(state) {

		const activeOilCapTaskIDs = [];
		const activeBaseBuildTasks = []; 
		const activeDefenceBuildTaskIDs = [];
		const activeRepairCenterBuildTaskIDs = [];
		const activeRemoteMissions = [];

		this.toc.getActiveConstructionMissions(state).forEach(missionData => {
			switch(missionData.missionType) {
				case MISSION_TYPE.CONSTRUCT_ALL_DERRICKS_IN_SECTOR:
				case MISSION_TYPE.CONSTRUCT_OIL_DERRICK:
					activeOilCapTaskIDs.push(missionData.sectorID);	
					activeRemoteMissions.push(missionData);	
					break;
				case MISSION_TYPE.CONSTRUCT_BASE_STRUCTURE:
				case MISSION_TYPE.CONSTRUCT_SINGLE_MODULE:
					activeBaseBuildTasks.push(missionData);	
					break;
				case MISSION_TYPE.CONSTRUCT_NEARBY_DEFENCE:
					activeDefenceBuildTaskIDs.push(missionData.sectorID);	
					activeRemoteMissions.push(missionData);
					break;
				case MISSION_TYPE.CONSTRUCT_REPAIR_CENTER:
				case MISSION_TYPE.DEMOLISH_REPAIR_CENTER:
					activeRepairCenterBuildTaskIDs.push(missionData.sectorID);		// should follow different cancellation logic
					break;
				default:
					// Ignore missions like default mission "HELP_CONSTRUCT"
			}
		});
		
		const abortedSectors = this.#abortDangerousConstructionTasks(state, activeRemoteMissions);

		// Command then terminates, if there are no available trucks this tick (avoids expensive planning tasks)
		const trucksUnavailable = (state.g.enumGroup(ENGINEERING.ENGINEERING_RESERVE).length === 0) && 
								  (state.g.enumGroup(ENGINEERING.BASE_BUILDER).length === 0);

		// `state.fields` / `state.grid` is updated slowly by intel (nominally once every 5 seconds). 
		// To avoid redundant work, construction should be planned only once per intel update.
		const WORLD_UNCHANGED_SINCE_LAST_PLAN = (state.grid.lastUpdatedAt === state.constructionPlannedAt);
		const SHOULD_PLAN_CONSTRUCTION = !trucksUnavailable && !WORLD_UNCHANGED_SINCE_LAST_PLAN;

		this.toc.updateConstructionPlanningRecord(state, abortedSectors, SHOULD_PLAN_CONSTRUCTION, this.CONSTRUCTION_PARAMETERS.ABORTED_SECTOR_COOLDOWN_MS);
		
		if (!SHOULD_PLAN_CONSTRUCTION) {
			return;
		}

		const approvedConstructionTasks = [];

		// BASE BUILD
		const baseBuildDeficit = this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_BASE_BUILD_TASKS - activeBaseBuildTasks.length;
		if (baseBuildDeficit > 0) {
			const requestedBaseBuildTasks = engineering.requestBaseConstruction(state, this.CONSTRUCTION_PARAMETERS);
			approvedConstructionTasks.push(...requestedBaseBuildTasks.slice(0, baseBuildDeficit));
		}

		// OIL CAP
		const oilCapDeficit = this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_OIL_CAP_TASKS - activeOilCapTaskIDs.length;
		if (oilCapDeficit > 0) {
			// The record was pruned above, so everything left in it is still cooling down.
			const excludedSectorIDs = [];
			excludedSectorIDs.push(...activeOilCapTaskIDs, ...state.abortedOilSectors.keys());
			const sectorOilCapTasks = engineering.generateOilCaptureOptions(state, excludedSectorIDs);
			approvedConstructionTasks.push(...sectorOilCapTasks.slice(0, oilCapDeficit));
		}
	
		// DERRICK DEFENCES
		const fortificationDeficit = this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_DEFENCE_BUILD_TASKS - activeDefenceBuildTaskIDs.length;
		if (fortificationDeficit > 0) {
			// As with oil capture: a site called off as too dangerous stays off the option list until its
			// cooldown expires, so the trucks are not sent straight back into the threat which turned them away.
			// The record was pruned above, so everything left in it is still cooling down.
			const excludedDerrickIDs = [];
			excludedDerrickIDs.push(...activeDefenceBuildTaskIDs, ...state.abortedDefenceSectors.keys());
			const sectorDefenceTasks = engineering.generateOilDefenceConstructionOptions(state, excludedDerrickIDs);
			approvedConstructionTasks.push(...sectorDefenceTasks.slice(0, fortificationDeficit));
		}

		// LOCAL REPAIR CENTERS
		const repairCenterEmptyTaskSlots = this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_REPAIR_CENTER_BUILD_TASKS - activeRepairCenterBuildTaskIDs.length;
		if (repairCenterEmptyTaskSlots > 0) {

			const myRepairFacilities = state.playerInfo[me]["repairFacilityFbObjects"];
			const DEMOLITION_REQUIRED = myRepairFacilities.length >= state.getMaxStructureCount("Repair Facility");

			const GROUP_POSITIONS = [];
			this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
				GROUP_POSITIONS.push(state.brigades[brigadeID]['location']);
			});

			const options = engineering.generateRemoteServiceCenterConstructionOptions(state, myRepairFacilities, GROUP_POSITIONS, DEMOLITION_REQUIRED);
			const newFacilityLocations = options["newFacilityLocations"];
			const demolitionLocations = options["demolitionLocations"];

			const NEW_FACILITY_REQUESTED = newFacilityLocations.length !== 0;

			if (NEW_FACILITY_REQUESTED) {
				if (!DEMOLITION_REQUIRED) {
					const approvedRepairCenterConstructionTasks = newFacilityLocations.slice(0, repairCenterEmptyTaskSlots);
					approvedConstructionTasks.push(...approvedRepairCenterConstructionTasks);
				} else {
					const approvedDemolitionTasks = demolitionLocations.slice(0, 1);
					// debug(`Demolition approved @ ${approvedDemolitionTasks[0].payload.x} ${approvedDemolitionTasks[0].payload.y}`);
					approvedConstructionTasks.push(...approvedDemolitionTasks);
				}
			}
		}

		this.toc.assignConstructionTasks(state, approvedConstructionTasks);
	}

	/**
	 * This function returns repaired droids to the reserves.
	 * @param {worldState} state 
	 */
	#recoverRepairedUnits(state) {
		const repairedUnits = state.g.enumGroup(DIVISION.RETURNING_FOR_REPAIR);
		repairedUnits.forEach(droid => {
			if (droid.health >= 95) {
				this.toc.resetDroidGroup(state, droid, DIVISION.RETURNING_FOR_REPAIR); 	
			}
		});
	}

	/**
	 * Gets the number of healthy combat units in a specified BCT (does not include logistic unit counts).
	 * @param {worldState} state 
	 * @param {number} brigadeID
	 * @returns {number} 
	 */
	#getBctCombatUnitCount(state, brigadeID) {
		const brigadeComposition = state.brigades[brigadeID]["composition"]; 
		const EXCLUDED_CATEGORIES = [DIVISION.AIR_DEFENCE_RESERVE, DIVISION.SENSOR_RESERVE, DIVISION.MAINTENANCE_RESERVE];

		let unitCount = 0;
		for (const [category, btnComposition] of brigadeComposition) {
			if (!EXCLUDED_CATEGORIES.includes(category)) {
				unitCount += btnComposition["count"];	
			}
		}
		return unitCount;
	}

	/**
	 * This function:
	 * - returns repaired units to active duty 
	 * - assigns reserve units to active brigade combat teams
	 * - assigns damaged units for repair
	 * @param {worldState} state 
	 * @returns {void}
	 */
	runResupplyLogistics(state) {

		// Return repaired units back into the reserve force
		this.#recoverRepairedUnits(state);		

		// Update brigade supply status
		const brigadeUnitCount = new Map();

		this.BRIGADE_DESIGNATIONS.forEach(brigadeID => {
			this.toc.updateBrigadeSupplyStatus(state, brigadeID, this.PRODUCTION_RESUPPLY_PARAMETERS);
			brigadeUnitCount.set(brigadeID, this.#getBctCombatUnitCount(state, brigadeID));
		});
		this.toc.updateBrigadeSupplyStatus(state, DIVISION.BCT_RESERVE, this.PRODUCTION_RESUPPLY_PARAMETERS);

		const REPAIR_FACILITY_AVAILABLE = state.playerInfo[me]["repairFacilityFbObjects"].length > 0;		// this has the potential to be stale, but it is not critical that it is up-to-date

		// Get reserve force units
		const RESERVE_GROUP_IDS = [
			DIVISION.HEAVY_CAV_RESERVE, 
			DIVISION.LIGHT_CAV_RESERVE, 
			DIVISION.INFANTRY_RESERVE, 
			DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 
			DIVISION.AIR_DEFENCE_RESERVE, 
			DIVISION.SENSOR_RESERVE,
			DIVISION.MAINTENANCE_RESERVE
		];

		/** @type {Map<number, DroidObject[]>} */
		const reserveUnits = new Map();
		RESERVE_GROUP_IDS.forEach(id => {reserveUnits.set(id, state.g.enumGroup(id))});

		if (REPAIR_FACILITY_AVAILABLE) {
			const RESERVE_REPAIR_THRESHOLD = 70;

			// In case reserve units are damaged, send these back for repair (reserves should only be engaged in light combat). 
			const unitsToBeRepaired = [];
			for (const [category, unitList] of reserveUnits) {
				if (unitList.length === 0) {
					continue;
				}

				unitsToBeRepaired.length = 0;	// reset the list
				unitList.forEach(droid => {
					if (droid.health < RESERVE_REPAIR_THRESHOLD) {
						unitsToBeRepaired.push(droid);
					}
				});
				
				this.toc.assignUnitsToBrigade(state, unitsToBeRepaired, category, DIVISION.RETURNING_FOR_REPAIR);
			}
		}

		// Decide how many BCTs should be made with the available units
		const activeBrigade = new Map([
			[DIVISION.FIRST_BCT, false], 
			[DIVISION.SECOND_BCT, false],
			[DIVISION.THIRD_BCT, false],
			[DIVISION.FOURTH_BCT, false],
			[DIVISION.FIFTH_BCT, false]
		]);

		let weakBCTCount = 0;
		for (const [brigadeID, unitCount] of brigadeUnitCount) {
			if (unitCount > this.PRODUCTION_RESUPPLY_PARAMETERS.TOTAL_UNITS_PER_BRIGADE * 1 / 2) {
				activeBrigade.set(brigadeID, true);
				continue;
			}

			weakBCTCount += 1;
			if (weakBCTCount > 1) {
				// if (unitCount > 0) 	debug(`${gameTime}: Brigade "${brigadeID}" recombined (only ${unitCount} units).`);
				activeBrigade.set(brigadeID, false);	// deactivate the brigade for recombination
			} else {
				activeBrigade.set(brigadeID, true);
			}
			continue;	
		}

		// Reinforce & replace damaged units for existing brigades, recombining where appropriate
		for (const [brigadeID, unitCount] of brigadeUnitCount) {
			const brigadeComposition = state.brigades[brigadeID]["composition"];

			if (!activeBrigade.get(brigadeID)) {
				// Forces all brigade units to 'return for repair', which eventually returns them to the reserves 
				for (const [category, btnComposition] of brigadeComposition) {
					this.toc.assignUnitsToBrigade(state, btnComposition['healthyUnitList'], brigadeID, DIVISION.RETURNING_FOR_REPAIR);		
					this.toc.assignUnitsToBrigade(state, btnComposition['damagedUnitList'], brigadeID, DIVISION.RETURNING_FOR_REPAIR);		
				}
				continue;
			}
			
			// By battalion, 
			// 	 1. assign units to reach base / core strength, 
			//   2. then return any damaged units for repair, sending reinforcements if available
			for (const [category, btnComposition] of brigadeComposition) {

				const deficit = btnComposition['deficit'];
				const battalionReserve = reserveUnits.get(category);
				if (battalionReserve == null) {
					warn(`Tried to get reserve units from non-existent category "${category}". Skipping.`);
					continue;
				}

				const reinforcements = battalionReserve.splice(0, deficit);
				this.toc.assignUnitsToBrigade(state, reinforcements, category, brigadeID);

				if (REPAIR_FACILITY_AVAILABLE) {
					const damagedUnitCount = btnComposition['damagedUnitList'].length;
					const replacements = battalionReserve.splice(0, damagedUnitCount);
					this.toc.assignUnitsToBrigade(state, replacements, category, brigadeID);
					this.toc.assignUnitsToBrigade(state, btnComposition['damagedUnitList'], brigadeID, DIVISION.RETURNING_FOR_REPAIR);		
				}
			}
		}
	}

	/**
	 * Organises the production of land vehicles, cyborgs & VTOLs.
	 * @param {worldState} state 
	 * @returns {void}
	 */
	runProductionLogistics(state) {

		const activeProductionJobs = state.activeProductionJobs;

		// Check factories for idle
		const factories = state.playerInfo[me]["normalFactoryFbObjects"];
		const cyborgFactories = state.playerInfo[me]["cyborgFactoryFbObjects"];
		const vtolFactories = state.playerInfo[me]["vtolFactoryFbObjects"];

		const idleFactories = getIdleStructureObjects(factories);
		const idleCyborgFactories = getIdleStructureObjects(cyborgFactories);
		const idleVtolFactories = getIdleStructureObjects(vtolFactories);

		const NO_IDLE_FACTORIES = idleFactories.length === 0 && idleCyborgFactories.length === 0 && idleVtolFactories.length === 0
		if (NO_IDLE_FACTORIES) {
			// Cleanup of the activeProductionJobs list, e.g. if a factory is destroyed mid-way through a job.
			const factoryIdList = [];
			factories.forEach(f => factoryIdList.push(f.id));
			cyborgFactories.forEach(f => factoryIdList.push(f.id));
			vtolFactories.forEach(f => factoryIdList.push(f.id));

			activeProductionJobs.forEach(j => {
				const FACTORY_ID = j['factory'].id;
				if (!factoryIdList.includes(FACTORY_ID)) {
					warn(`Removed ProductionJob "${FACTORY_ID} | ${j['type']}" as Factory "${FACTORY_ID}" was not found.`);
					this.toc.removeFromActiveProductionJobs(state, j['factory'], j['type']);
				}
			});
			return;
		}

		// Extract parameters
		const SHOULD_PRODUCE_TRUCKS = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_TRUCKS;
		const MAX_TRUCKS_THIS_TICK = this.PRODUCTION_RESUPPLY_PARAMETERS.MAX_TRUCKS_THIS_TICK;

		const CYBORG_CONSTRUCTOR_AVAILABLE = this.PRODUCTION_RESUPPLY_PARAMETERS.CYBORG_CONSTRUCTOR_AVAILABLE;
		const SHOULD_PRODUCE_INFANTRY = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_INFANTRY;
		const SHOULD_PRODUCE_VTOLS = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_VTOLS;
		const CAN_DESIGN_UNITS = this.PRODUCTION_RESUPPLY_PARAMETERS.CAN_DESIGN_UNITS;

		const SHOULD_PRODUCE_LAND_VEHICLES = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_LAND_VEHICLES;

		const landUnitQueue = [];

		// Decide on which category of land combat vehicle to produce (basic greedy algorithm)
		const brigadeIDs = [...this.BRIGADE_DESIGNATIONS, DIVISION.BCT_RESERVE];

		if (SHOULD_PRODUCE_LAND_VEHICLES && idleFactories.length > 0) {
			const productionRequests = [];

			brigadeIDs.forEach((brigadeID, idx) => {
				const brigadeComposition = state.brigades[brigadeID]["composition"];
				const weightedRequests = supply.prioritiseLandVehicleCategory(brigadeComposition, this.PRODUCTION_RESUPPLY_PARAMETERS);

				let brigadeWeight = this.PRODUCTION_RESUPPLY_PARAMETERS.BRIGADE_WEIGHTS.get(brigadeID);
				if (brigadeWeight == null) {
					warn(`brigadeWeight for "${brigadeID}" returned null (missing). Defaulting to 1.0`);
					brigadeWeight = 1.0;
				}

				weightedRequests.forEach(request => request["score"] *= brigadeWeight);
				productionRequests.push(...weightedRequests);
			});

			productionRequests.sort((a, b) => b.score - a.score);

			// Remove active jobs
			const removedRequests = [];
			activeProductionJobs.forEach(job => {
				for (let i=0; i<productionRequests.length; i++) {
					if (job.type !== productionRequests[i].type) {
						continue;
					}
					removedRequests.push(...productionRequests.splice(i, 1));
					break;
				}
			});

			for (let i=0; i<productionRequests.length; i++) {
				landUnitQueue.push(productionRequests[i].type);
			}
			if (landUnitQueue.length === 0) {
				landUnitQueue.push(this.PRODUCTION_RESUPPLY_PARAMETERS.DEFAULT_LAND_UNIT_CATEGORY);
				warn(`empty landUnitQueue; landVehicleCategory defaulting to: "${this.PRODUCTION_RESUPPLY_PARAMETERS.DEFAULT_LAND_UNIT_CATEGORY}"`);
			}

			if (false) {
				let deletedEntries = "";
				removedRequests.forEach(r => deletedEntries += `${r.type},`)
				deb(`Cleaned Production Requests (removed ${deletedEntries})`); 
				productionRequests.forEach(r => debug(`\t-${r.type} | ${r.score}`));
				deb(`producing: ${landUnitQueue[0]}`);
			}
		}

		// Run production
		let trucksThisTick = 0;
		const DEBUG_PRODUCTION = false;

		// Note: for now, we will directly call the tactical level functions
		for (let i=0; i<idleCyborgFactories.length; i++) {
			const f = idleCyborgFactories[i];

			if (SHOULD_PRODUCE_TRUCKS && CYBORG_CONSTRUCTOR_AVAILABLE && trucksThisTick < MAX_TRUCKS_THIS_TICK) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Combat Engineer`);
				const productionStarted = produceCombatEngineer(f);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': f, 'type': ENGINEERING.ENGINEERING_RESERVE});
					trucksThisTick += 1;
				}
				continue;
			}

			if (SHOULD_PRODUCE_INFANTRY) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Infantry`);
				const productionStarted = produceInfantry(f);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': f, 'type': DIVISION.INFANTRY_RESERVE});
				}
			}
		}

		for (let i=0; i<idleVtolFactories.length; i++) {
			const factory = idleVtolFactories[i];

			if (SHOULD_PRODUCE_VTOLS) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced VTOL`);
				const productionStarted = produceCloseAirSupport(factory);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': factory, 'type': DIVISION.AIR_RESERVE});
				}
			} else {
				break;
			}
		}

		for (let i=0; i<idleFactories.length; i++) {
			const factory = idleFactories[i];

			if (SHOULD_PRODUCE_TRUCKS && !CYBORG_CONSTRUCTOR_AVAILABLE && trucksThisTick < MAX_TRUCKS_THIS_TICK) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Truck`);
				// Note: CAN_DESIGN_UNITS prevents FishBot from producing any other trucks other than `Truck Viper Wheels` until the command center is built
				const productionStarted = produceTruck(factory, CAN_DESIGN_UNITS);
				if (productionStarted) {
					this.toc.addToActiveProductionJobs(state, {'factory': factory, 'type': ENGINEERING.ENGINEERING_RESERVE});
					trucksThisTick += 1;
				}		
				continue;
			}

			if (SHOULD_PRODUCE_LAND_VEHICLES && landUnitQueue.length > 0) {
				if (DEBUG_PRODUCTION) debug(`	${gameTime}: produced Land Vehicle Template`);
				const productionStarted = produceLandUnitCategory(landUnitQueue[0], factory);
				if (productionStarted) {
					const landUnitCategory = landUnitQueue.shift();
					this.toc.addToActiveProductionJobs(state, {'factory': factory, 'type': landUnitCategory});
				}
				continue;
			} else {
				break;
			}
		}

	}

	/**
	 * Organises research, using the provided research path.
	 * @param {worldState} state 
	 */
	runResearchLogistics(state) {
		const myLabs = state.playerInfo[me]["researchFacilityFbObjects"];
		const idleLabs = getIdleStructureObjects(myLabs);
		if (idleLabs.length === 0) {
			return;
		}

		const proposedResearches = rnd.proposeResearch(this.RESEARCH_PARAMETERS);
		const researchOrder = [...proposedResearches['highPriority'], ...proposedResearches['regularPriority']];
		
		let positionInResearchOrder = 0;
		for (let i=0; i<idleLabs.length; i++) {

			for (let j=positionInResearchOrder; j<researchOrder.length; j++) {
				const researchStarted = pursueResearch(idleLabs[i], researchOrder[j].id);
				if (researchStarted) {		// This check avoids conflicts with allies (shared-research mode)
					positionInResearchOrder++;
					// debug(`${me}:\t${getCurrGameTimeMinSec()}\t${researchOrder[j].name}`);		
					break;
				}
			}
		}
	}

	/**
	 * Executes all bot actions which use the mission manager system (e.g. aviation, construction).
	 * @param {worldState} state 
	 */
	runMissionManager(state) {
		this.toc.manageMissions(state);
	}
}