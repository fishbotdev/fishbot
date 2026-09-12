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
		this.MAX_BRIGADES = 3;								// ceiling on how many BCTs the division may put in the field
		this.BRIGADE_DESIGNATIONS = [DIVISION.FIRST_BCT];	// the BCTs which currently exist; grows and shrinks as the division can man them

		/** @type {ForceStructureParameters} */
		this.FORCE_STRUCTURE_PARAMETERS = {
			RELEASE_DWELL_TICKS: 15,	// consecutive resupply ticks the formation conditions must hold before a new BCT is formed (~30s)
			MAX_THREAT_RATIO: 0.4,		// nearby ground threats per combat unit, above which a BCT is judged to be expecting heavy combat
			MAX_UNREPLACED_LOSSES: 2,	// direct-fire units a BCT may be down on its recent peak before it counts as bleeding
			releaseDwell: 0,
		};

		// Total ground force budget, counted in brigades' worth of units (BCTs in the field + reserve).
		// Kept separate from MAX_BRIGADES so that changing how the force is split into BCTs does not also
		// change how big the army is (or, via the leftover, the VTOL budget). It is also what decides how
		// far the division can actually grow: forming a BCT needs every BCT *and* the reserve at full
		// establishment, so the division settles at (FORCE_BUDGET_BRIGADES - 1) BCTs or MAX_BRIGADES,
		// whichever is smaller.
		this.FORCE_BUDGET_BRIGADES = 4;

		const DEFAULT_FISHBOT_BRIGADE_COMPOSITION = {
			'MAX_HEAVY_CAVALRY': 6,
			'MAX_LIGHT_CAVALRY': 2,
			'MAX_MORTAR': 5,
			'MAX_ADA': 2,
			'MAX_SENSOR': 1,
			'MAX_REPAIR': 1,
			'MAX_INFANTRY': 3,
		};

		const TOTAL_UNITS_PER_BRIGADE = Object.values(DEFAULT_FISHBOT_BRIGADE_COMPOSITION).reduce((a, b) => a + b, 0);

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
			BLOCKED_APPROACH_WEIGHT: 2.0,			// demotes targets with terrain in the way; a target with a clear approach wins from ~1.4x further away

			EFFECTIVE_FIRE_SUPPORT_RADIUS: 12,		// todo: this should be adaptive - when the brigade has a sensor, this is better, without, it is restricted by sight range of the front units
			EFFECTIVE_ADA_RADIUS: 12,
		};

		/*
			Aviation parameters

			Air tasking ranks every CAS, raid and base strike request in one pool by a cost (lowest wins), in the
			same style as `directFireCost()` below: a base cost multiplied by tunable weights, where a weight under
			1.0 promotes a request and one above 1.0 demotes it. The base cost is the distance from the air base to
			the target, because that is what a VTOL pays twice on every sortie, so a weight of w lets a promoted
			target sit 1/w times further away than a rival and still win: 0.5 => 2x, 0.7 => ~1.4x.

			Unlike the posture switches this replaced, no weight can remove a whole class of mission from the pool.
			CAS in particular no longer depends on the oil situation at all: its posture weight is neutral, oil only
			tilts raids against base strikes, and what promotes a CAS request is the requesting brigade's own demand.
			So a brigade in trouble can always buy air support by out-bidding whatever else is on offer, while a
			brigade advancing unopposed does not quietly hijack the air force away from the enemy's base.
		*/
		/** @type {AviationParameters} */
		this.AVIATION_PARAMETERS = {
			totalNumAircraft: 0,
			SATURATION_RAID_ACTIVE: false,

			// Posture: which kind of mission the air force leans toward. Rewritten each cycle by `#setAviationParameters()`.
			MISSION_TYPE_WEIGHT: {
				[MISSION_TYPE.CAS_STRIKE]: 1.0,
				[MISSION_TYPE.DAS_STRIKE]: 1.0,
				[MISSION_TYPE.AIR_RAID]: 1.0,
			},

			// Target value: what a sortie is worth spending on, most wanted (cheapest) first.
			TARGET_CLASS_WEIGHT: {
				[AIR_TARGET_CLASS.INDIRECT_FIRE]: 0.30,			// counter-battery; artillery cannot shoot back at aircraft
				[AIR_TARGET_CLASS.ADA]: 0.45,					// opens the airspace for every strike after it
				[AIR_TARGET_CLASS.PRODUCTION]: 0.55,			// factories & trucks; the industrial campaign
				[AIR_TARGET_CLASS.ARMOUR]: 0.70,
				[AIR_TARGET_CLASS.DEFENCE]: 0.90,
				[AIR_TARGET_CLASS.RESOURCE_EXTRACTOR]: 1.00,	// the raid baseline
				[AIR_TARGET_CLASS.CONSTRUCTOR]: 1.20,
			},

			COMMITMENT_WEIGHT: 0.5,				// a running strike is only displaced by a candidate twice as attractive
			KNOCKOUT_WEIGHT: 0.8,				// prefers finishing off damaged targets (matches the ground force rule)
			LOW_HEALTH_THRESHOLD: 50,			// a target below this health percentage is considered worth finishing off

			// CAS demand ramp: turns a brigade's own CAS requests into how badly it wants air support. Replaces the
			// old on/off trigger (1 urgent request, or 4 requests from one brigade); both those points now sit at
			// 0.80 on the ramp rather than flipping the entire air force onto CAS.
			CAS_URGENCY_GAIN: 0.15,				// per URGENT request the brigade raised
			CAS_SATURATION_GAIN: 0.05,			// per request the brigade raised, urgent or not
			MIN_CAS_DEMAND_WEIGHT: 0.35,		// floor, so one swamped brigade cannot monopolise the air force outright

			TURNAROUND_DISTANCE_FLOOR: 10,		// tiles; stops a target parked on the airfield from dominating the ranking
			THREAT_EXPOSURE_GAIN: 0.5,			// demotes targets under air defence: a cell at threat t costs (1 + 0.5t) times more

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
			DYNAMIC_POWER_GENERATOR_CAP: 2,
			DYNAMIC_FACTORY_CAP: 2,
			DYNAMIC_RESEARCH_LAB_CAP: 1,
			MAX_VTOL_REARMING_PADS: 2, 
			SHOULD_BUILD_VTOLS: false,
		};

		// Production parameters
		/** @type {Map<number, number>} */
		const DEFAULT_BRIGADE_WEIGHTS = new Map([
			[DIVISION.FIRST_BCT, 1000], 
			[DIVISION.SECOND_BCT, 100], 
			[DIVISION.THIRD_BCT, 10], 
			[DIVISION.FOURTH_BCT, 0], 
			[DIVISION.FIFTH_BCT, 0],
			[DIVISION.BCT_RESERVE, 1],
		]);
		
		/** @type {Map<number, number>} */
		const DEFAULT_UNIT_WEIGHTS = new Map([
			// Production weights (which influences production order) are tuned using `python_helper_scripts / production_scheduling.py`.
			// Must be rebalanced each time the brigade composition is changed.	
			[DIVISION.HEAVY_CAV_RESERVE, 0.55],
			[DIVISION.LIGHT_CAV_RESERVE, 0.95],
			[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 0.6],
			[DIVISION.AIR_DEFENCE_RESERVE, 0.35],
			[DIVISION.SENSOR_RESERVE, 0.2],
			[DIVISION.MAINTENANCE_RESERVE, 0.1],
		]);

		/** @type {ProductionParameters} */
		this.PRODUCTION_RESUPPLY_PARAMETERS = {
			CAN_DESIGN_UNITS: false,

			SHOULD_PRODUCE_TRUCK_VEHICLES: true,
			MAX_TRUCKS_THIS_TICK: 1,
			SHOULD_PRODUCE_TRUCK_CYBORGS: false,
			DYNAMIC_TRUCK_CAP: 8,
			
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
		this.DEFAULT_RESEARCH_PATH = rnd.researchOrders.getT2CannonResearchPath();
		this.FOCUSED_COMBAT_RESEARCH_PATH = rnd.researchOrders.getFocusedT2CannonResearchPath();

		/** @type {ResearchParameters} */
		this.RESEARCH_PARAMETERS = {
			path: this.DEFAULT_RESEARCH_PATH,
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
	 * Updates FishBot's strategic parameters dynamically with the evolution of the game state.
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

		const FAIR_SHARE_DERRICK_COUNT = Math.floor(TOTAL_DERRICKS / ALIVE_PLAYER_COUNT);
		const MINIMUM_OILS_CLAIMED = MY_DERRICK_COUNT >= Math.ceil(TOTAL_DERRICKS / (ALIVE_PLAYER_COUNT + 1));	// 2p -> bigger than 1/3, 3p -> bigger than 1/4 and so on

		const getDynamicTruckCap = (fairShareDerrickCount, minBaseBuilderTrucks, maxFishbotTruckCount) => {
			// TODO: make this depend the construction state of the base (e.g. `CAMP_CLEAN`)
			const NOMINAL_TRUCKS = Math.floor(fairShareDerrickCount / 2) + minBaseBuilderTrucks;
			const DYNAMIC_TRUCK_LIMIT = clampValue(NOMINAL_TRUCKS, 1, maxFishbotTruckCount);
			return DYNAMIC_TRUCK_LIMIT;
		};

		const BASE_BUILDER_TRUCK_COUNT = 2;
		const FISHBOT_TRUCK_SOFT_CAP = 10;
		
		this.PRODUCTION_RESUPPLY_PARAMETERS.DYNAMIC_TRUCK_CAP = getDynamicTruckCap(FAIR_SHARE_DERRICK_COUNT, BASE_BUILDER_TRUCK_COUNT, FISHBOT_TRUCK_SOFT_CAP);

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

			const BIGGEST_OIL_SHARE = MY_OIL_SHARE >= LARGEST_OIL_SHARE;

			oilDominance = MINIMUM_OILS_CLAIMED && BIGGEST_OIL_SHARE;
		}

		if (this.isOilDominant != oilDominance) {
			const derrickCount = `${MY_DERRICK_COUNT} out of ${TOTAL_DERRICKS} (${Math.ceil(MY_DERRICK_COUNT / TOTAL_DERRICKS * 100)}%)`;
			deb(`oil dominance changed to: ${oilDominance} (${derrickCount})`);
			this.isOilDominant = oilDominance;
		}

		const IS_ENERGY_DEFICIENT = !MINIMUM_OILS_CLAIMED;

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
		const getDynamicPowerGeneratorCap = (myDerrickCount, minGeneratorCounts, maxGeneratorCounts) => {
			const generatorsRequired = Math.ceil(myDerrickCount / 4);
			return clampValue(generatorsRequired, minGeneratorCounts, maxGeneratorCounts);
		};
		const TYPICAL_MIN_GENERATORS = 2;
		const MIN_GENERATORS = Math.min(TYPICAL_MIN_GENERATORS, Math.ceil(FAIR_SHARE_DERRICK_COUNT / 4));
		const MAX_GENERATORS = state.getMaxStructureCount("Power Generator");
		const DYNAMIC_POWER_GENERATOR_CAP = getDynamicPowerGeneratorCap(MY_DERRICK_COUNT, MIN_GENERATORS, MAX_GENERATORS);


		const getDynamicFactoryCap = (isEnergyDeficient, minFactoryCount, maxFactoryCount) => {
			const DYNAMIC_FACTORY_CAP = isEnergyDeficient ? minFactoryCount : maxFactoryCount;
			return DYNAMIC_FACTORY_CAP;
		}
		const MIN_FACTORIES = 1;
		const MAX_FACTORIES = state.getMaxStructureCount("Factory");
		const DYNAMIC_FACTORY_CAP = getDynamicFactoryCap(IS_ENERGY_DEFICIENT, MIN_FACTORIES, MAX_FACTORIES);


		const getDynamicResearchLabCap = (isEnergyDeficient, minLabCount, maxLabCount) => {
			const DYNAMIC_RESEARCH_LAB_CAP = isEnergyDeficient ? minLabCount : maxLabCount;
			return DYNAMIC_RESEARCH_LAB_CAP;
		}
		const MIN_RESEARCH_LABS = 1;
		const MAX_RESEARCH_LABS = state.getMaxStructureCount("Research Facility");
		const DYNAMIC_RESEARCH_LAB_CAP = getDynamicResearchLabCap(IS_ENERGY_DEFICIENT, MIN_RESEARCH_LABS, MAX_RESEARCH_LABS);

		const USE_VTOL = true;							// todo: find a situation in which you don't want to use VTOL
		const MY_VTOL_COUNT = state.playerInfo[me]['numAirUnits'];

		this.CONSTRUCTION_PARAMETERS.DYNAMIC_POWER_GENERATOR_CAP = DYNAMIC_POWER_GENERATOR_CAP;
		this.CONSTRUCTION_PARAMETERS.DYNAMIC_FACTORY_CAP = DYNAMIC_FACTORY_CAP;
		this.CONSTRUCTION_PARAMETERS.DYNAMIC_RESEARCH_LAB_CAP = DYNAMIC_RESEARCH_LAB_CAP;
		this.CONSTRUCTION_PARAMETERS.MAX_VTOL_REARMING_PADS = MY_VTOL_COUNT;
		this.CONSTRUCTION_PARAMETERS.SHOULD_BUILD_VTOLS = USE_VTOL;

		/*
			PRODUCTION
		*/
		const BRIGADE_COMPOSITION = this.PRODUCTION_RESUPPLY_PARAMETERS.BRIGADE_COMPOSITION;
		const FORCE_BUDGET_BRIGADES = this.FORCE_BUDGET_BRIGADES;

		// Define unit limits

		const MAX_INFANTRY = BRIGADE_COMPOSITION['MAX_INFANTRY'];
		const TOTAL_UNITS_PER_BRIGADE = this.PRODUCTION_RESUPPLY_PARAMETERS.TOTAL_UNITS_PER_BRIGADE;
		
		const TRUCK_HARD_LIMIT = state.getMaxUnitCount("DROID_CONSTRUCT");
		const TRUCK_SOFT_LIMIT = Math.min(TRUCK_HARD_LIMIT, this.PRODUCTION_RESUPPLY_PARAMETERS.DYNAMIC_TRUCK_CAP);

		const COMBAT_UNIT_HARD_LIMIT = state.getMaxUnitCount("DROID_WEAPON") - TRUCK_SOFT_LIMIT;
		const INFANTRY_UNIT_SOFT_LIMIT = MAX_INFANTRY * FORCE_BUDGET_BRIGADES;
		const LAND_VEHICLE_SOFT_LIMIT = (TOTAL_UNITS_PER_BRIGADE - MAX_INFANTRY) * FORCE_BUDGET_BRIGADES;
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
		
		// Decide on whether or not to produce combat units
		// Note: FishBot will not build combat vehicles, combat cyborgs or VTOLs before it can design them, on any difficulty (in line with human player rules).	
		const CAN_DESIGN_UNITS = HQ_IS_CONSTRUCTED;
		const SHOULD_PRODUCE_LAND_VEHICLES = CAN_DESIGN_UNITS && !HIT_LAND_VEHICLE_LIMIT;
		const SHOULD_PRODUCE_INFANTRY = CAN_DESIGN_UNITS && !HIT_INFANTRY_LIMIT;
		const SHOULD_PRODUCE_VTOLS = CAN_DESIGN_UNITS && !HIT_AIR_UNIT_LIMIT;

		// Decide on whether or not to produce trucks
		const MAX_TRUCKS_THIS_TICK = TRUCK_SOFT_LIMIT - MY_TRUCK_COUNT;

		const INITIAL_TRUCK_RUSH_PERIOD = gameTime < 60000;

		// TODO: wire this to deficits in both types of units.
		const SHOULD_PRODUCE_TRUCK_VEHICLES = !HIT_TRUCK_LIMIT && (!CYBORG_CONSTRUCTOR_AVAILABLE || INITIAL_TRUCK_RUSH_PERIOD);
		const SHOULD_PRODUCE_TRUCK_CYBORGS = !HIT_TRUCK_LIMIT && (CYBORG_CONSTRUCTOR_AVAILABLE || INITIAL_TRUCK_RUSH_PERIOD);

		// Brigade production priorities
		/** @type {Map<number, number>} */
		const brigadeWeights = new Map([
			[DIVISION.FIRST_BCT, 1000], 
			[DIVISION.SECOND_BCT, 100], 
			[DIVISION.THIRD_BCT, 10], 
			[DIVISION.FOURTH_BCT, 0], 
			[DIVISION.FIFTH_BCT, 0],
			[DIVISION.BCT_RESERVE, 1],
		]);
		
		/** @type {Map<number, number>} */
		const UNIT_WEIGHTS = new Map([
			// Production weights (which influences production order) are tuned using `python_helper_scripts / production_scheduling.py`.
			// Must be rebalanced each time the brigade composition is changed.	
			[DIVISION.HEAVY_CAV_RESERVE, 0.55],
			[DIVISION.LIGHT_CAV_RESERVE, 0.95],
			[DIVISION.SHORT_RANGE_FIRE_SUPPORT_RESERVE, 0.6],
			[DIVISION.AIR_DEFENCE_RESERVE, 0.35],
			[DIVISION.SENSOR_RESERVE, 0.2],
			[DIVISION.MAINTENANCE_RESERVE, 0.1],
		]);

		const DEFAULT_LAND_UNIT_CATEGORY = DIVISION.LIGHT_CAV_RESERVE;

		this.PRODUCTION_RESUPPLY_PARAMETERS.CAN_DESIGN_UNITS = CAN_DESIGN_UNITS;

		this.PRODUCTION_RESUPPLY_PARAMETERS.MAX_TRUCKS_THIS_TICK = MAX_TRUCKS_THIS_TICK;
		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_TRUCK_VEHICLES = SHOULD_PRODUCE_TRUCK_VEHICLES;
		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_TRUCK_CYBORGS = SHOULD_PRODUCE_TRUCK_CYBORGS;

		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_INFANTRY = SHOULD_PRODUCE_INFANTRY;
		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_VTOLS = SHOULD_PRODUCE_VTOLS;
		this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_LAND_VEHICLES = SHOULD_PRODUCE_LAND_VEHICLES;
		this.PRODUCTION_RESUPPLY_PARAMETERS.BRIGADE_WEIGHTS = brigadeWeights;
		this.PRODUCTION_RESUPPLY_PARAMETERS.UNIT_WEIGHTS = UNIT_WEIGHTS;
		this.PRODUCTION_RESUPPLY_PARAMETERS.DEFAULT_LAND_UNIT_CATEGORY = DEFAULT_LAND_UNIT_CATEGORY;

		/*
			AVIATION
		*/
		const IS_OIL_DOMINANT = this.isOilDominant;
		const NUM_AIRCRAFT = state.playerInfo[me].numAirUnits;	
		const AIR_UNIT_DOMINANCE = NUM_AIRCRAFT >= 10;

		const SATURATION_RAID_ACTIVE = IS_OIL_DOMINANT && AIR_UNIT_DOMINANCE;

		/*
			Posture weights.

			The oil situation decides how the air force splits its effort between hurting the enemy's economy
			(raids on derricks) and dismantling its base (strikes on production, ADA & defences). It deliberately
			does *not* decide whether close air support happens: CAS keeps a fixed weight, so a brigade that is
			actually in a fight can always outbid both, whether FishBot is winning the oil war or losing it.
		*/
		const CAS_WEIGHT = 1.0;								// neutral on purpose; brigade demand is what promotes CAS
		let dasWeight = IS_OIL_DOMINANT ? 0.7 : 1.1;		// a base-dismantling campaign is a luxury paid for with oil
		const raidWeight = IS_OIL_DOMINANT ? 1.0 : 0.6;		// behind on oil => go and contest the enemy's derricks

		if (SATURATION_RAID_ACTIVE) {
			dasWeight *= 0.7;								// enough aircraft to sustain pressure on the enemy base
		}
		
		/*
			The following thresholds set no-fly regions. Modify the threshold to match the "hq_toc/updateSpatialFields" spatial filter.
				0 => avoids all anti-air defences, 
				0.69 > (0.33 * 2) => allows targeting 1 cell over from a single air defence. 
				2 => allows 2 air defences in one isolated cell (with no cells directly adjacent containing anti-air defences) or adjacent air defences - 1 per cell.

			These are now hard limits only. Exposure below the limit is priced by `THREAT_EXPOSURE_GAIN` instead of
			banned, so a valuable target is still worth flying at through light air defence while a cheap one is not.
			The standard threshold no longer tightens to 0 when FishBot is behind on oil: grounding the air force over
			any threatened cell was a large part of why it contributed so little from behind.
		*/
		const STANDARD_THREAT_THRESHOLD = 0.69;		
		const URGENT_THREAT_THRESHOLD = 2;
		const SATURATION_THREAT_THRESHOLD = 2;	

		this.AVIATION_PARAMETERS.totalNumAircraft = NUM_AIRCRAFT;
		this.AVIATION_PARAMETERS.SATURATION_RAID_ACTIVE = SATURATION_RAID_ACTIVE;

		this.AVIATION_PARAMETERS.MISSION_TYPE_WEIGHT[MISSION_TYPE.CAS_STRIKE] = CAS_WEIGHT;
		this.AVIATION_PARAMETERS.MISSION_TYPE_WEIGHT[MISSION_TYPE.DAS_STRIKE] = dasWeight;
		this.AVIATION_PARAMETERS.MISSION_TYPE_WEIGHT[MISSION_TYPE.AIR_RAID] = raidWeight;

		this.AVIATION_PARAMETERS.STANDARD_THREAT_THRESHOLD = STANDARD_THREAT_THRESHOLD;
		this.AVIATION_PARAMETERS.URGENT_THREAT_THRESHOLD = URGENT_THREAT_THRESHOLD;
		this.AVIATION_PARAMETERS.SATURATION_THREAT_THRESHOLD = SATURATION_THREAT_THRESHOLD;
		this.AVIATION_PARAMETERS.CAS_SUPPORT_RADIUS = 25;
		this.AVIATION_PARAMETERS.UNITS_FOR_ADA_STRIKE = 3;

		/*
			RESEARCH
		*/
		const LIVING_ENEMY_COUNT = livingPlayers.filter(isEnemy).length;
		const FIGHTING_LAST_OPPONENT = LIVING_ENEMY_COUNT <= 1;
		const path = FIGHTING_LAST_OPPONENT ? this.FOCUSED_COMBAT_RESEARCH_PATH : this.DEFAULT_RESEARCH_PATH;

		if (this.RESEARCH_PARAMETERS.path !== path) {
			deb(`research weights changed to: ${FIGHTING_LAST_OPPONENT ? "focused combat" : "default"} (${LIVING_ENEMY_COUNT} enemies remaining)`);
			this.RESEARCH_PARAMETERS.path = path;
		}
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
		const isWalkable = state.mapData.isWalkable;

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
			Direct Fire Targeting: attack what is closest and reachable in a straight line, and see the current fight to completion.
			TODO: Lacks input from the strategic layer (which reasons about objectives & OAKOC) because it is currently non-existent.
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
			if (lineIsBlocked(x, y, obj.x, obj.y, isWalkable)) {
				// Terrain 1: Demotes targets the brigade cannot drive straight at. 
				// TODO: Simplistic. Projects a straight line from the brigade position to the target & checks if the tiles are walkable. Replace by strategic layer inputs.
				cost *= parameters.BLOCKED_APPROACH_WEIGHT;
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

		/*
			Fire Support Targeting
			Intent: Suppress enemy infantry then destroy defences, indirect fires & ADA, preferring targets that are already in sensor range of the brigade.
			The visible-targets preference prevents mortar units from driving in front of the direct fire units to reveal the target with its own sight range.
		*/
		/** @type {Map<number, number>} object ID -> owning player, for every enemy object the brigade can currently see */
		const visibleEnemies = new Map();
		enumRange(x, y, parameters.EFFECTIVE_FIRE_SUPPORT_RADIUS, ENEMIES, true).forEach(obj => visibleEnemies.set(obj.id, obj.player));

		/** @type {(DroidObject | StructureObject | FeatureObject)[]} */
		const visibleFireSupportTargets = [];
		/** @type {(DroidObject | StructureObject | FeatureObject)[]} */
		const hiddenFireSupportTargets = [];

		/** @param {DroidObject | StructureObject | FeatureObject} obj */
		const addFireSupportTarget = (obj) => {
			if (outsideOfRadius(obj, parameters.EFFECTIVE_FIRE_SUPPORT_RADIUS)) 	return;
			const IS_VISIBLE_TO_BRIGADE = (visibleEnemies.get(obj.id) === obj.player);
			if (IS_VISIBLE_TO_BRIGADE) {
				visibleFireSupportTargets.push(obj);
				return;
			}
			hiddenFireSupportTargets.push(obj);
		};

		const primaryIndirectFireTargets = [...enemyInfantry, ...enemyDefenses, ...enemyIndirectFire, ...enemyADA, ...enemyIndustrial, ...enemyArmor];
		const secondaryIndirectFireTargets = [...enemyConstructor, ...enemyUtility];

		primaryIndirectFireTargets.forEach(c => addFireSupportTarget(c.targetObj));
		secondaryIndirectFireTargets.forEach(c => addFireSupportTarget(c.targetObj));

		brigadeTargets["fireSupportTargets"].push(...visibleFireSupportTargets, ...hiddenFireSupportTargets);		// prefers already-visible

		const FALLBACK_TO_DIRECT_FIRE_TARGETS = (brigadeTargets["fireSupportTargets"].length === 0);
		if (FALLBACK_TO_DIRECT_FIRE_TARGETS) {
			brigadeTargets["fireSupportTargets"].push(...brigadeTargets['directFireTargets']);
		}		

		/*
			CAS Targeting (Close Air Support)
			Intent: `casTargets` is the brigade's bid for air support, ranked later against every other air
			mission by `#prioritiseAviationTargets`. Order within this list no longer decides anything - the
			request's target class and the brigade's demand do - so requests are simply appended.

			`priority` is retained because it still selects the no-fly threshold a request is held to, and
			because the count of URGENT requests is what the CAS demand ramp reads.
		*/
		/**
		 * A request is only raised for a target inside the CAS support radius. `#filterPriorityAirMissions` holds
		 * running CAS missions to that same radius, so without this check the brigade could ask for - and be given
		 * aircraft for - a target which is cancelled on the next cycle. The brigade's location is refreshed more
		 * often than its target list, so the two do drift apart.
		 * @param {TargetCandidate[]} candidates
		 * @param {number} priority
		 * @param {string} targetClass one of `AIR_TARGET_CLASS`
		 */
		const addCASRequests = (candidates, priority, targetClass) => {
			candidates.forEach(c => {
				if (outsideOfRadius(c.targetObj, this.AVIATION_PARAMETERS.CAS_SUPPORT_RADIUS)) {
					return;
				}
				brigadeTargets['casTargets'].push(aviation.translateIntoCASRequest(c.targetObj, priority, targetClass));
			});
		};

		addCASRequests(enemyIndirectFire, MISSION_PRIORITY.URGENT, AIR_TARGET_CLASS.INDIRECT_FIRE);
		addCASRequests(enemyADA, MISSION_PRIORITY.VERY_HIGH, AIR_TARGET_CLASS.ADA);
		addCASRequests(enemyArmor, MISSION_PRIORITY.VERY_HIGH, AIR_TARGET_CLASS.ARMOUR);
		addCASRequests(enemyDefenses, MISSION_PRIORITY.HIGH, AIR_TARGET_CLASS.DEFENCE);

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
	 * The no-fly threshold an air mission is held to. Urgent work, and saturation raids once FishBot has the
	 * aircraft to sustain them, accept flying over more air defence than routine work does.
	 * @param {number} priority a `MISSION_PRIORITY`
	 * @param {AviationParameters} parameters
	 * @returns {number}
	 */
	#airThreatThreshold(priority, parameters) {
		if (parameters.SATURATION_RAID_ACTIVE) {
			return parameters.SATURATION_THREAT_THRESHOLD;
		}
		return (priority === MISSION_PRIORITY.URGENT) ? parameters.URGENT_THREAT_THRESHOLD : parameters.STANDARD_THREAT_THRESHOLD;
	}

	/**
	 * How badly one brigade wants air support, expressed as a weight on its own CAS requests (lower = wanted more).
	 *
	 * This is a ramp rather than a trigger, so the air force shifts toward a brigade in trouble by degrees.
	 * The two points which used to switch the whole air force onto CAS - one URGENT request, or four requests
	 * from a single brigade - both land at 0.80 here.
	 * @param {AirStrikeMissionRequest[]} casRequests one brigade's CAS requests this cycle
	 * @param {AviationParameters} parameters
	 * @returns {number}
	 */
	#casDemandWeight(casRequests, parameters) {
		let numUrgentRequests = 0;
		casRequests.forEach(r => {
			if (r.priority === MISSION_PRIORITY.URGENT) {
				numUrgentRequests++;
			}
		});

		const demand = 1 - (parameters.CAS_URGENCY_GAIN * numUrgentRequests) - (parameters.CAS_SATURATION_GAIN * casRequests.length);
		return clampValue(demand, parameters.MIN_CAS_DEMAND_WEIGHT, 1);
	}

	/**
	 * Ranks one air strike request; the lowest cost is the most worthwhile sortie.
	 *
	 * Built the same way as `directFireCost()`: a distance base scaled by weights, where a weight below 1.0
	 * promotes the request. The base is the distance from the air base to the target, because a VTOL pays that
	 * distance twice on every sortie - so, at equal value, a nearer target buys more strikes per minute.
	 * @param {AirStrikeMissionRequest | CombatMissionData} request
	 * @param {DroidObject | StructureObject | FeatureObject} obj the target, freshly fetched
	 * @param {number} threat the `adaThreat` field value over the target
	 * @param {AviationParameters} parameters
	 * @returns {number}
	 */
	#scoreAirMissionRequest(request, obj, threat, parameters) {
		const distanceToTarget = Math.sqrt(distSq(baseLocation.x, obj.x, baseLocation.y, obj.y));
		let cost = distanceToTarget + parameters.TURNAROUND_DISTANCE_FLOOR;

		cost *= parameters.MISSION_TYPE_WEIGHT[request.missionType] ?? 1;		// posture: CAS vs raid vs base strike
		cost *= parameters.TARGET_CLASS_WEIGHT[request.targetClass] ?? 1;		// what the target is worth killing from the air

		if (request.missionType === MISSION_TYPE.CAS_STRIKE) {
			cost *= request.demandWeight ?? 1;									// how badly the supported brigade needs it
		}
		if (obj.health < parameters.LOW_HEALTH_THRESHOLD) {
			cost *= parameters.KNOCKOUT_WEIGHT;									// finishing a damaged target is cheap value
		}

		// Exposure below the no-fly threshold is priced rather than banned, so the air force gives up a defended
		// target for a comparable undefended one, but will still go after something genuinely worth the risk.
		cost *= 1 + (parameters.THREAT_EXPOSURE_GAIN * threat);
		return cost;
	}

	/**
	 * Reviews the air missions already running: aborts any whose target has become untenable, and scores the rest
	 * so that they can be ranked against this cycle's fresh candidates.
	 *
	 * Survivors are scored with `COMMITMENT_WEIGHT` applied, which is what keeps a strike package on its target
	 * unless something clearly better turns up. It replaces the previous rule - cancel every raid and base strike
	 * outright whenever CAS was being prioritised - which tore down a whole industrial campaign as soon as one
	 * urgent CAS request appeared, then rebuilt it a few cycles later.
	 * @param {worldState} state 
	 * @param {AviationParameters} parameters 
	 * @param {number} casDemandWeight the strongest CAS demand across the brigades, applied to running CAS missions
	 * @returns {{activeTargetIDs: number[], survivingMissions: CombatMissionData[]}}
	 */
	#filterPriorityAirMissions(state, parameters, casDemandWeight) {

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
		/** @type {CombatMissionData[]} */
		const survivingMissions = [];
		
		activeMissions.forEach(c => {
			activeTargetIDs.push(c.target.id);

			const currObj = getObject(c.target.type, c.target.player, c.target.id);
			if (currObj == null) 	return;

			const gx = Math.floor(currObj.x / cellSize); 
			const gy = Math.floor(currObj.y / cellSize);
			const threat = adaThreat[gx][gy];
			if (threat > this.#airThreatThreshold(c.priority, parameters)) {
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
				// A running CAS mission does not record which brigade asked for it, so it is scored against the
				// strongest demand currently in the field - it is supporting somebody who is still asking.
				c.demandWeight = casDemandWeight;
			}

			c.cost = this.#scoreAirMissionRequest(c, currObj, threat, parameters) * parameters.COMMITMENT_WEIGHT;
			survivingMissions.push(c);
		});

		return {activeTargetIDs: activeTargetIDs, survivingMissions: survivingMissions};
	}

	/**
	 * This function returns a list of prioritised Droid / Structure Objects (fresh data) which can be directly used in the `__tac` functions.
	 * @param {worldState} state 
	 * @param {AviationParameters} parameters
	 * @returns {AirStrikeMissionRequest[]}	
	 */
	#prioritiseAviationTargets(state, parameters) {

		const adaThreat = state.fields.adaThreat;
		const cellSize = state.grid.cellSize;

		const adaTargets = state.aviationTargets['adaTargets'];
		adaTargets.forEach(t => {t.numAircraft = parameters.UNITS_FOR_ADA_STRIKE;});

		/** @type {AirStrikeMissionRequest[]} */
		const casTargets = [];
		let strongestCasDemand = 1;
		this.BRIGADE_DESIGNATIONS.forEach(id => {
			const casStrikeRequests = state.brigades[id]['casStrikeRequests'];

			const demandWeight = this.#casDemandWeight(casStrikeRequests, parameters);
			casStrikeRequests.forEach(r => {r.demandWeight = demandWeight;});
			strongestCasDemand = Math.min(strongestCasDemand, demandWeight);

			casTargets.push(...casStrikeRequests);
		});

		/*
			One pool, one ranking. Close air support, base strikes and derrick raids all compete on cost, so the
			air force can split its effort between them within a cycle. Previously a posture flag elected one list
			and discarded the others outright, which is what dropped every CAS request whenever FishBot was not
			oil dominant - exactly when its ground force most needed the help.
		*/
		const targetCandidates = [
			...casTargets,
			...state.aviationTargets['productionTargets'],
			...adaTargets,
			...state.aviationTargets['indirectFireTargets'],
			...state.aviationTargets['defensiveStructureTargets'],
			...state.aviationTargets['raidTargets'],
		];

		/** @type {AirStrikeMissionRequest[]} */
		const aviationTargets = [];
		if (targetCandidates.length === 0) {
			// debug(`${gameTime}: no aviation target candidates`);
			return aviationTargets;
		} 
		
		const {activeTargetIDs, survivingMissions} = this.#filterPriorityAirMissions(state, parameters, strongestCasDemand);
		
		// Score the candidates, dropping any target which is gone or sits under more air defence than its priority buys
		const newAviationTargets = [], existingAviationTargets = [];

		targetCandidates.forEach(missionRequest => {

			const t = missionRequest.target;

			const obj = getObject(t.type, t.player, t.id);
			if (obj == null) {
				return;
			};
			
			const gx = Math.floor(obj.x / cellSize); 
			const gy = Math.floor(obj.y / cellSize);
			const threat = adaThreat[gx][gy];
			if (threat > this.#airThreatThreshold(missionRequest.priority, parameters)) {
				// debug(`	removed CANDIDATE, adaThreat: ${obj.name} @ grid (${obj.x} ${obj.y})`);
				return;
			}

			missionRequest.cost = this.#scoreAirMissionRequest(missionRequest, obj, threat, parameters);

			if (activeTargetIDs.includes(obj.id)) {
				existingAviationTargets.push(missionRequest);
			} else {
				newAviationTargets.push(missionRequest);
			}
		});

		/*
			Capacity cut: rank what is already flying against what is on offer, and keep the best packages the air
			force can man. A running mission which no longer makes the cut is aborted, handing its aircraft back to
			the reserve for the strike which displaced it.
		*/
		/** @type {{cost: number, request: (AirStrikeMissionRequest | undefined), mission: (CombatMissionData | undefined)}[]} */
		const ranked = [];
		newAviationTargets.forEach(r => ranked.push({cost: r.cost, request: r, mission: undefined}));
		survivingMissions.forEach(m => ranked.push({cost: m.cost, request: undefined, mission: m}));
		ranked.sort((a, b) => a.cost - b.cost);

		const STRIKE_CAPACITY = Math.max(1, Math.floor(parameters.totalNumAircraft / UNITS_PER_AIR_STRIKE));

		for (let i = 0; i < ranked.length; i++) {
			const entry = ranked[i];
			const WITHIN_CAPACITY = (i < STRIKE_CAPACITY);

			if (entry.mission != undefined) {
				if (!WITHIN_CAPACITY) {
					// debug(`displaced ACTIVE: ${entry.mission.target.name} (${entry.mission.missionType})`);
					entry.mission.missionStatus = MISSION_STATUS.ABORT;
				}
				continue;
			}
			if (WITHIN_CAPACITY) {
				aviationTargets.push(entry.request);
			}
		}

		// Spare aircraft double up on a target already under attack rather than sitting on the pad. Counts the
		// candidates found, not the ones selected, which is capped at the strike capacity and so always fits.
		const TOO_MANY_AIRCRAFT = newAviationTargets.length <= Math.floor(parameters.totalNumAircraft / 2);
		if (TOO_MANY_AIRCRAFT) {
			existingAviationTargets.sort((a, b) => a.cost - b.cost);
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
			// highlightTiles(brigadeLocation.x, brigadeLocation.y);
		});

		// Manage reserves: temporary: Move reserves to pre-emptively reinforce BCT0
		moveReservesToShadow(state, RESERVE_CATEGORY_GROUP_IDS, DIVISION.FIRST_BCT);
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
		const SHOULD_PLAN_REMOTE_CONSTRUCTION = !trucksUnavailable && !WORLD_UNCHANGED_SINCE_LAST_PLAN;

		this.toc.updateConstructionPlanningRecord(state, abortedSectors, SHOULD_PLAN_REMOTE_CONSTRUCTION, this.CONSTRUCTION_PARAMETERS.ABORTED_SECTOR_COOLDOWN_MS);

		if (trucksUnavailable) {
			return;
		}

		const approvedConstructionTasks = [];

		// BASE BUILD
		const baseBuildDeficit = this.CONSTRUCTION_PARAMETERS.MAX_PARALLEL_BASE_BUILD_TASKS - activeBaseBuildTasks.length;
		if (baseBuildDeficit > 0) {
			const requestedBaseBuildTasks = engineering.requestBaseConstruction(state, this.CONSTRUCTION_PARAMETERS);
			approvedConstructionTasks.push(...requestedBaseBuildTasks.slice(0, baseBuildDeficit));
		}

		if (!SHOULD_PLAN_REMOTE_CONSTRUCTION) {
			this.toc.assignConstructionTasks(state, approvedConstructionTasks);
			return;
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
	 * Reports whether every battalion in a brigade is at its full establishment. Also valid for the reserve,
	 * which is measured against the same brigade composition.
	 * @param {worldState} state
	 * @param {number} brigadeID
	 * @returns {boolean}
	 */
	#isFullyManned(state, brigadeID) {
		const brigadeComposition = state.brigades[brigadeID]["composition"];
		for (const [category, btnComposition] of brigadeComposition) {
			if (btnComposition["deficit"] > 0) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Reports whether a BCT is facing enough nearby enemies to expect heavy combat.
	 *
	 * Only the classes which shoot back at ground forces are counted. ADA cannot engage them, and constructors,
	 * industry and utility structures are the opposite signal - finding those means the front is soft, which is
	 * exactly when splitting the division is safe. The count is taken relative to the BCT's own strength, since
	 * a dozen targets mean something different to a full BCT than to a half-dead one.
	 * @param {worldState} state
	 * @param {number} brigadeID
	 * @param {number} combatUnitCount
	 * @returns {boolean}
	 */
	#isExpectingHeavyCombat(state, brigadeID, combatUnitCount) {
		const THREATENING_TARGET_CLASSES = ['enemyArmor', 'enemyInfantry', 'enemyIndirectFire', 'enemyDefenses'];
		const nearbyTargets = state.brigades[brigadeID]['nearbyTargets'];

		let threatCount = 0;
		THREATENING_TARGET_CLASSES.forEach(targetClass => threatCount += nearbyTargets[targetClass].length);

		if (combatUnitCount === 0) {
			return threatCount > 0;
		}
		return threatCount > combatUnitCount * this.FORCE_STRUCTURE_PARAMETERS.MAX_THREAT_RATIO;
	}

	/**
	 * Reports whether a BCT is losing units faster than resupply is replacing them.
	 *
	 * `strength` is a high-water mark which decays by `STRENGTH_DECAY_RATE` per update but snaps straight back up
	 * to the real count when the BCT is reinforced, so the gap between the two is what the BCT is down on its
	 * recent peak *and* has not had made good. Losses which the reserve is deep enough to keep replacing do not
	 * register, which is the intent: it is the replacement rate being outrun that should stop the division
	 * splitting, not casualties as such.
	 * @param {worldState} state
	 * @param {number} brigadeID
	 * @returns {boolean}
	 */
	#isTakingUnreplacedLosses(state, brigadeID) {
		const brigade = state.brigades[brigadeID];
		const unreplacedLosses = brigade['strength'] - brigade['directFireCount'];

		return unreplacedLosses > this.FORCE_STRUCTURE_PARAMETERS.MAX_UNREPLACED_LOSSES;
	}

	/**
	 * Decides the division's force structure for this tick: which of the existing BCTs are manned well enough
	 * to fight, and whether the division can afford to form another one.
	 *
	 * Units are held in the reserve by default. A new BCT is only formed once every BCT already in the field
	 * *and* the reserve are at full establishment, sustained for `RELEASE_DWELL_TICKS`. Forming is deliberately
	 * slow while folding is immediate, because a new BCT is empty and so drains a full brigade's worth out of
	 * the reserve in a single resupply tick - that is the replacement depth the rest of the division gives up.
	 * @param {worldState} state
	 * @param {Map<number, number>} brigadeUnitCount combat unit count per existing BCT; a newly formed BCT is added to it
	 * @returns {Map<number, boolean>} whether each existing BCT is manned well enough to fight
	 */
	#updateForceStructure(state, brigadeUnitCount) {
		const parameters = this.PRODUCTION_RESUPPLY_PARAMETERS;
		const forceStructure = this.FORCE_STRUCTURE_PARAMETERS;

		/** @type {Map<number, boolean>} */
		const activeBrigade = new Map();

		let weakBCTCount = 0;
		for (const [brigadeID, unitCount] of brigadeUnitCount) {
			if (unitCount > parameters.TOTAL_UNITS_PER_BRIGADE * 1 / 2) {
				activeBrigade.set(brigadeID, true);
				continue;
			}

			// One under-strength BCT is tolerated; any others are folded back into the reserve
			weakBCTCount += 1;
			// if (weakBCTCount > 1 && unitCount > 0) 	debug(`${gameTime}: Brigade "${brigadeID}" recombined (only ${unitCount} units).`);
			activeBrigade.set(brigadeID, weakBCTCount <= 1);
		}

		const AT_BRIGADE_CEILING = this.BRIGADE_DESIGNATIONS.length >= this.MAX_BRIGADES;
		const FORCE_IS_SUFFICIENT = this.BRIGADE_DESIGNATIONS.every(brigadeID => this.#isFullyManned(state, brigadeID))
			&& this.#isFullyManned(state, DIVISION.BCT_RESERVE);

		// Splitting the division is only safe if nothing already in the field is about to need the reserve
		let expectingHeavyCombat = false;
		for (const [brigadeID, unitCount] of brigadeUnitCount) {
			if (this.#isExpectingHeavyCombat(state, brigadeID, unitCount) || this.#isTakingUnreplacedLosses(state, brigadeID)) {
				expectingHeavyCombat = true;
				break;
			}
		}

		if (AT_BRIGADE_CEILING || !FORCE_IS_SUFFICIENT || expectingHeavyCombat) {
			forceStructure.releaseDwell = 0;
			return activeBrigade;
		}

		forceStructure.releaseDwell += 1;
		if (forceStructure.releaseDwell < forceStructure.RELEASE_DWELL_TICKS) {
			return activeBrigade;
		}
		forceStructure.releaseDwell = 0;

		// Form the next BCT. It is empty, so the reinforcement loop below hands it a whole brigade's worth of
		// units from the reserve this tick, and the next formation waits on production refilling the reserve.
		// Designations are not necessarily a prefix of BRIGADE_IDS: a middle BCT can be folded back into the
		// reserve, leaving a gap for the next formation to take.
		const newBrigadeID = BRIGADE_IDS.find(brigadeID => !this.BRIGADE_DESIGNATIONS.includes(brigadeID));
		if (newBrigadeID == null) {
			return activeBrigade;
		}

		this.BRIGADE_DESIGNATIONS.push(newBrigadeID);
		this.toc.updateBrigadeSupplyStatus(state, newBrigadeID, parameters);
		brigadeUnitCount.set(newBrigadeID, this.#getBctCombatUnitCount(state, newBrigadeID));
		activeBrigade.set(newBrigadeID, true);
		// debug(`${gameTime}: Brigade "${newBrigadeID}" formed (${this.BRIGADE_DESIGNATIONS.length} of ${this.MAX_BRIGADES}).`);

		return activeBrigade;
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

		const REPAIR_FACILITY_AVAILABLE = state.playerInfo[me]["repairFacilityFbObjects"].length > 0;		// this has the potential to be stale, but it is not critical that it is up-to-date

		// Get reserve force units
		/** @type {Map<number, DroidObject[]>} */
		const reserveUnits = new Map();
		RESERVE_CATEGORY_GROUP_IDS.forEach(id => {reserveUnits.set(id, state.g.enumGroup(id))});

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

			// Units sent for repair have left their category group, but the lists read above still hold them.
			// Re-read, so that resupply cannot hand a repair-bound unit straight back to a BCT.
			RESERVE_CATEGORY_GROUP_IDS.forEach(id => {reserveUnits.set(id, state.g.enumGroup(id))});
		}

		// Count the reserve only once its damaged units have been sent away, so that the force structure
		// decision below sees the units resupply can actually hand out.
		this.toc.updateBrigadeSupplyStatus(state, DIVISION.BCT_RESERVE, this.PRODUCTION_RESUPPLY_PARAMETERS);

		// Decide which BCTs can be manned, and whether the division can afford to form another
		const activeBrigade = this.#updateForceStructure(state, brigadeUnitCount);

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

		// Retire the BCTs which were folded back into the reserve above. This is done last so that the loop
		// still visits them: a BCT is only struck off once it has handed its units back.
		// BCT0 is the division's last formation and is never retired, however weak it becomes.
		this.BRIGADE_DESIGNATIONS = this.BRIGADE_DESIGNATIONS.filter(brigadeID => {
			return brigadeID === DIVISION.FIRST_BCT || activeBrigade.get(brigadeID) !== false;
		});
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
		
		const MAX_TRUCKS_THIS_TICK = this.PRODUCTION_RESUPPLY_PARAMETERS.MAX_TRUCKS_THIS_TICK;
		const SHOULD_PRODUCE_TRUCK_VEHICLES = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_TRUCK_VEHICLES;
		const SHOULD_PRODUCE_TRUCK_CYBORGS = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_TRUCK_CYBORGS;
		
		const CAN_DESIGN_UNITS = this.PRODUCTION_RESUPPLY_PARAMETERS.CAN_DESIGN_UNITS;
		
		const SHOULD_PRODUCE_LAND_VEHICLES = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_LAND_VEHICLES;
		const SHOULD_PRODUCE_INFANTRY = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_INFANTRY;
		const SHOULD_PRODUCE_VTOLS = this.PRODUCTION_RESUPPLY_PARAMETERS.SHOULD_PRODUCE_VTOLS;

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

			if (SHOULD_PRODUCE_TRUCK_CYBORGS && trucksThisTick < MAX_TRUCKS_THIS_TICK) {
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

			if (SHOULD_PRODUCE_TRUCK_VEHICLES && trucksThisTick < MAX_TRUCKS_THIS_TICK) {
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
					deb(`${researchOrder[j].name}`);		
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