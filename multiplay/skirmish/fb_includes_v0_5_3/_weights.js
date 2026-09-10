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
 * FishBot's externally tunable weight vector.
 *
 * WHAT THIS FILE IS
 * -----------------
 * `hq_command.js` decides *how* FishBot behaves; this file holds the numbers those decisions are made
 * from. Everything here was previously a magic number inlined into `CommandCenter`'s constructor or into
 * `updateStrategicParameters()`. Pulling them out means an external optimiser (see
 * `tests/fb_weights_io.py`) can rewrite this one file between test batches without touching any logic.
 *
 * The values below reproduce FishBot v0.5.3's behaviour exactly. They are the incumbent, and any tuning
 * run should be scored against them.
 *
 * RULES FOR THIS FILE
 * -------------------
 * 1. Flat and scalar only. Every entry is a plain number or boolean, so the whole object maps 1:1 onto an
 *    optimiser's parameter vector. No nesting, no arrays, no expressions, no references to game state.
 * 2. No logic. This file is data. Anything conditional belongs in `updateStrategicParameters()`.
 * 3. The region between the BEGIN/END markers is machine-rewritten. Keep one `KEY: value,` per line so a
 *    generated file stays diffable against this one.
 *
 * NAMING
 * ------
 * `..._MS` are game-time milliseconds. `..._PER_...` are ratios applied to a count. `..._FRACTION` are
 * multipliers on an engine-imposed limit (1.0 = "use the whole limit"). `..._TRIGGER` / `..._THRESHOLD`
 * are the values a measured quantity is compared against.
 */

/* FB_WEIGHTS_BEGIN */
const FB_WEIGHTS = {

	// Identifies the weight set in debug output, so a scraped result can be traced back to the particle
	// that produced it. The optimiser overwrites this; "incumbent" is the hand-tuned v0.5.3 baseline.
	WEIGHT_SET_ID: "incumbent",

	/*
		OIL & ENERGY
		FishBot's central strategic read. `oilShare` is my derrick count over an even split of the map's
		derricks between living players, so 1.0 is a fair share and >1.0 is more than fair.
	*/

	// Energy sufficiency. FishBot considers itself energy-deficient below
	// `ceil(totalDerricks * SHARE / (livingPlayers + PLAYER_OFFSET))` derricks. The offset makes the bar
	// forgiving: at 1.0 a 2-player map asks for a third of the oil rather than half.
	ENERGY_SUFFICIENCY_SHARE: 1.0,
	ENERGY_SUFFICIENCY_PLAYER_OFFSET: 1,

	// Oil dominance. Requires energy sufficiency *and* an oil share at least this multiple of the leading
	// player's. Above 1.0 demands a clear lead before FishBot commits to a dominant posture; below 1.0
	// lets it claim dominance while behind.
	OIL_DOMINANCE_SHARE_MARGIN: 1.0,

	/*
		CONSTRUCTION: CONCURRENCY
		How many construction tasks of each kind may run at once. These are the throttle on truck
		attention: raising one starves the others.
	*/
	MAX_PARALLEL_BASE_BUILD_TASKS: 1,
	MAX_PARALLEL_OIL_CAP_TASKS: 4,
	MAX_PARALLEL_REPAIR_CENTER_BUILD_TASKS: 1,

	// Derrick defences ramp up once the opening is over. Previously a hard `gameTime < 180000` switch
	// carrying a "tuned for Gamma" caveat, which makes it a prime tuning candidate.
	MAX_PARALLEL_DEFENCE_BUILD_TASKS_EARLY: 1,
	MAX_PARALLEL_DEFENCE_BUILD_TASKS_LATE: 2,
	DEFENCE_BUILD_RAMP_TIME_MS: 180000,

	// How long a sector abandoned as too dangerous stays off the option list.
	ABORTED_SECTOR_COOLDOWN_MS: 30000,

	/*
		CONSTRUCTION: STRUCTURE CAPS
		These are the filters applied to the base build order in
		`hq_g4_construction.js / requestBaseConstruction()`. Because that order is a fixed list walked
		front-to-back, lowering a cap does not just cap that structure — it moves everything behind it
		forward. This is the primary lever on construction order.
	*/

	// Power generators scale with captured oil: `ceil(myDerricks * GENERATORS_PER_DERRICK)`. One
	// generator serves four derricks in WZ2100, hence 0.25.
	GENERATORS_PER_DERRICK: 0.25,
	// Floor on generators, itself capped by what a fair share of oil could sustain.
	TYPICAL_MIN_GENERATORS: 2,

	// Factories and research labs are gated on energy sufficiency: a hard floor while deficient, and a
	// fraction of the engine's structure limit once sufficient.
	FACTORY_CAP_WHEN_DEFICIENT: 1,
	FACTORY_CAP_FRACTION_WHEN_SUFFICIENT: 1.0,
	RESEARCH_LAB_CAP_WHEN_DEFICIENT: 1,
	RESEARCH_LAB_CAP_FRACTION_WHEN_SUFFICIENT: 1.0,

	// Module gating inside the build order. A factory admits two modules, a lab one.
	MODULES_PER_FACTORY: 2,
	MODULES_PER_RESEARCH_LAB: 1,

	// VTOL infrastructure. Rearming pads are matched to the VTOL count actually fielded.
	SHOULD_BUILD_VTOLS: true,
	REARMING_PADS_PER_VTOL: 1,

	/*
		PRODUCTION: TRUCKS
	*/

	// Truck cap: `clamp(floor(fairShareDerricks * PER_DERRICK) + BASE_BUILDERS, HARD_FLOOR, SOFT_CAP)`.
	// Half a truck per derrick FishBot could reasonably claim, plus a standing base-building crew.
	TRUCKS_PER_FAIR_SHARE_DERRICK: 0.5,
	BASE_BUILDER_TRUCK_COUNT: 2,
	TRUCK_HARD_FLOOR: 1,
	TRUCK_SOFT_CAP: 10,

	// During the opening, FishBot builds trucks from both factory types at once to get onto oil faster.
	INITIAL_TRUCK_RUSH_PERIOD_MS: 60000,

	/*
		PRODUCTION: BRIGADE SIZE & COMPOSITION
		The unit mix of one brigade. `hq_g4_production.js` fills brigades toward this shape, so it sets
		both the army's composition and the order units are produced in.

		Composition is expressed as a size plus a set of shares rather than as absolute counts, so that
		"how big is a brigade" and "what is it made of" can be tuned independently:

			support slots = ADA (scales with size) + sensor + repair
			combat slots  = BRIGADE_SIZE - support slots
			counts        = the four shares, normalised, apportioned over the combat slots

		Apportionment uses the largest-remainder method, so the counts always sum to exactly
		BRIGADE_SIZE regardless of how the shares are set. The defaults reproduce v0.5.3's hand-tuned
		6 / 2 / 5 / 3 combat mix with 2 ADA, 1 sensor and 1 repair.
	*/
	BRIGADE_SIZE: 20,

	// Shares of the combat slots. Only their ratios matter - they are normalised before apportionment, so
	// scaling all four leaves the brigade unchanged. Heavy cavalry is therefore held fixed as the
	// reference and the other three are set relative to it, which is what a tuning run varies. Leaving all
	// four free would give the optimiser a direction along which nothing whatsoever happens.
	// The defaults are sixteenths, which is what v0.5.3's 6 / 2 / 5 / 3 mix works out to at size 20.
	BRIGADE_SHARE_HEAVY_CAVALRY: 0.3750,		// reference; hold fixed
	BRIGADE_SHARE_LIGHT_CAVALRY: 0.1250,
	BRIGADE_SHARE_INDIRECT: 0.3125,				// mortars
	BRIGADE_SHARE_INFANTRY: 0.1875,

	// Air defence scales with brigade size, since a bigger formation is a bigger air target.
	// `round(BRIGADE_SIZE * ADA_PER_BRIGADE_UNIT)` clamped: 2 at the default size of 20, 3 at 30.
	ADA_PER_BRIGADE_UNIT: 0.1,
	BRIGADE_MIN_ADA: 2,
	BRIGADE_MAX_ADA: 3,

	// Support units which do not scale with brigade size.
	BRIGADE_SENSOR_COUNT: 1,
	BRIGADE_REPAIR_COUNT: 1,

	/*
		FORCE STRUCTURE
		How the ground army is sized, and how it is split into brigades. These are separate on purpose:
		`FORCE_BUDGET_BRIGADES` sets how many brigades' worth of units the division builds (BCTs in the
		field plus the reserve), while `MAX_BRIGADES` sets how many BCTs those units may be split into.
		Changing the split therefore does not change the army's size, or - through the leftover under the
		engine unit limit - the VTOL budget.

		BCTs are formed on demand rather than existing from the start: a new one requires every existing
		BCT and the reserve to be at full establishment, so the division settles at whichever is smaller of
		`FORCE_BUDGET_BRIGADES - 1` and `MAX_BRIGADES`. That makes BRIGADE_SIZE doubly powerful - larger
		brigades are slower to man, so they also mean fewer BCTs in the field.
	*/
	MAX_BRIGADES: 3,
	FORCE_BUDGET_BRIGADES: 4,

	// Conditions for releasing a new BCT.
	BCT_RELEASE_DWELL_TICKS: 15,		// consecutive resupply ticks the conditions must hold (~30s)
	BCT_MAX_THREAT_RATIO: 0.4,			// nearby ground threats per combat unit, above which a BCT counts as expecting heavy combat
	BCT_MAX_UNREPLACED_LOSSES: 2,		// direct-fire units a BCT may be down on its recent peak before it counts as bleeding

	/*
		PRODUCTION: PRIORITY WEIGHTS
		Brigade weights are order-of-magnitude priorities: the first brigade is reinforced before the
		second, and so on.

		Unit weights decide the *order* a brigade fills in, where the composition above decides what it
		fills up to. `prioritiseLandVehicleCategory()` scores each category as
		`(deficit / composition count) * unit weight` and repeatedly produces the highest, so a category
		with a larger weight is reached sooner. The two interact: brigade size sets how long a brigade
		spends part-filled, which is exactly the window in which order matters.

		Three properties of these weights, all worth knowing before tuning them:
		  - Only ratios matter. Scaling all six leaves the production order completely unchanged, so heavy
		    cavalry is held fixed as the reference and the rest are set relative to it.
		  - They must stay strictly positive. At zero or below, a category is never produced at all, no
		    matter how large its deficit.
		  - Infantry has no entry. It is built from cyborg factories on a separate path, so its share of a
		    brigade is tunable but its build order is not.

		`python_helper_scripts/production_scheduling.py` prints the resulting order for a given set.
	*/
	BRIGADE_WEIGHT_FIRST_BCT: 1000,
	BRIGADE_WEIGHT_SECOND_BCT: 100,
	BRIGADE_WEIGHT_THIRD_BCT: 10,
	BRIGADE_WEIGHT_FOURTH_BCT: 0,
	BRIGADE_WEIGHT_FIFTH_BCT: 0,
	BRIGADE_WEIGHT_BCT_RESERVE: 1,

	UNIT_WEIGHT_HEAVY_CAV: 0.55,				// reference; hold fixed
	UNIT_WEIGHT_LIGHT_CAV: 0.95,
	UNIT_WEIGHT_SHORT_RANGE_FIRE_SUPPORT: 0.6,	// mortars
	UNIT_WEIGHT_AIR_DEFENCE: 0.35,
	UNIT_WEIGHT_SENSOR: 0.2,
	UNIT_WEIGHT_MAINTENANCE: 0.1,

	/*
		RESUPPLY & REPAIR
	*/

	// Health percentage below which a unit is pulled out of the line for repair.
	VEHICLE_REPAIR_THRESHOLD: 30,
	CYBORG_REPAIR_THRESHOLD: 45,

	// Ceiling on how fast a brigade's estimated strength may decay, in direct-fire units per update.
	// Smoothing stops a brigade from being written off the moment its units scatter.
	STRENGTH_DECAY_RATE: 1,

	/*
		GROUND COMBAT
		Direct-fire cost weights multiply the *squared* distance to a target: below 1.0 promotes a target,
		above 1.0 demotes it. Squared, so weight w lets a promoted target sit 1/sqrt(w) times further away
		than a rival and still win — 0.2 => ~2.2x, 0.25 => 2x, 0.56 => ~1.3x.
	*/
	TARGET_SEARCH_RADIUS: 25,
	IMMEDIATE_DIRECT_FIRE_RADIUS: 10,
	DIRECT_FIRE_COMMITMENT_RADIUS: 20,
	TARGET_ADJACENCY_RADIUS: 8,

	COMMITMENT_WEIGHT: 0.2,
	ADJACENCY_WEIGHT: 0.25,
	KNOCKOUT_WEIGHT: 0.56,
	LOW_HEALTH_THRESHOLD: 50,
	BLOCKED_APPROACH_WEIGHT: 2.0,

	EFFECTIVE_FIRE_SUPPORT_RADIUS: 12,
	EFFECTIVE_ADA_RADIUS: 12,

	/*
		AVIATION
		Threat thresholds define no-fly regions and must match the spatial filter in
		`hq_toc.js / updateSpatialFields()`:
			0    => avoids all anti-air defences
			0.69 => allows targeting one cell over from a single air defence  (> 0.33 * 2)
			2    => allows two air defences in one isolated cell, or adjacent cells with one each
	*/
	AIR_DOMINANCE_UNIT_COUNT: 10,
	CAS_URGENT_MISSION_TRIGGER: 1,
	CAS_TARGET_CLUSTER_TRIGGER: 4,

	STANDARD_THREAT_THRESHOLD_WHEN_OIL_DOMINANT: 0.69,
	STANDARD_THREAT_THRESHOLD_OTHERWISE: 0,
	URGENT_THREAT_THRESHOLD: 2,
	SATURATION_THREAT_THRESHOLD: 2,

	CAS_SUPPORT_RADIUS: 25,
	UNITS_FOR_ADA_STRIKE: 3,

	/*
		RESEARCH
	*/

	// At or below this many living enemies, FishBot switches to the focused combat research path.
	FOCUSED_RESEARCH_ENEMY_COUNT: 1,
};
/* FB_WEIGHTS_END */
