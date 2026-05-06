/* 
  Warzone 2100 JS API: Function/global definitions
  All descriptions are copy-pasted from: https://github.com/Warzone2100/warzone2100/tree/master/doc -> js-xxxx.md
  This file is here to support "jsconfig.json" - it declares all WZ2100 engine API functions called within FishBot.
*/

//////////////////////////////////////////// GLOBAL VARIABLES ////////////////////////////////////////////

/**
 * ```derrickPositions``` A set of derrick starting positions on the current map. Each item in the set is an
 * object containing the x and y variables for a derrick.
 */
declare const derrickPositions: BaseObject[];

/**
 * ```startPositions``` An array of player start positions on the current map. Each item in the array is an
 * object containing the x and y variables for a player start position.
 */
declare const startPositions: BaseObject[];

/**
* ```me``` The player the script is currently running as.
*/
declare const me: number;

/**
* ```mapWidth``` Width of map in tiles (x). 
*/
declare const mapWidth: number;

/**
* ```mapHeight``` Height of map in tiles (y).
*/
declare const mapHeight: number;

/**
```MapTiles``` A two-dimensional array of static information about the map tiles in a game. Each item in MapTiles[y][x] is an object containing the following variables:
- ```terrainType``` tile type of a given map tile, such as ```TER_WATER``` for water tiles or ```TER_CLIFFFACE``` for cliffs. Tile types regulate which units may pass through this tile. (3.2+ only)
- ```height``` the height at the top left of the tile
- ```hoverContinent``` (For hover type propulsions)
- ```limitedContinent``` (For land or sea limited propulsion types)
 */
declare const MapTiles: any;

/**
 * ```gameTime``` The current game time. Updated before every invokation of a script.
 */
declare const gameTime: number;

/**
* ```maxPlayers``` The number of active players in this game.
 */
declare const maxPlayers: number;

/**
* ```Stats``` A sparse, read-only array containing rules information for game entity types.
(For now only the highest level member attributes are documented here. Use the 'jsdebug' cheat
to see them all.)
These values are defined:
- ```Body``` Droid bodies
- ```Sensor``` Sensor turrets
- ```ECM``` ECM (Electronic Counter-Measure) turrets
- ```Propulsion``` Propulsions
- ```Repair``` Repair turrets (not used, incidentally, for repair centers)
- ```Construct``` Constructor turrets (eg for trucks)
- ```Brain``` Brains
- ```Weapon``` Weapon turrets
- ```WeaponClass``` Defined weapon classes
- ```Building``` Buildings
- ```Research``` Researches
- ```playerData``` An array of information about the players in a game. Each item in the array is an object containing the following variables:
    - ```difficulty``` (see ```difficulty``` global constant)
    - ```colour``` number describing the colour of the player
    - ```position``` number describing the position of the player in the game's setup screen
    - ```isAI``` whether the player is an AI (3.2+ only)
    - ```isHuman``` whether the player is human (3.2+ only)
    - ```name``` the name of the player (3.2+ only)
    - ```team``` the number of the team the player is part of
- ```MapTiles``` A two-dimensional array of static information about the map tiles in a game. Each item in `MapTiles[y][x]` is an object containing the following variables:
    - ```terrainType``` (see ```terrainType(x, y)``` function)
    - ```height``` the height at the top left of the tile
    - ```hoverContinent``` (For hover type propulsions)
    - ```limitedContinent``` (For land or sea limited propulsion types)
 */
declare const Stats: Object;


/* ---------- playerFilter ---------- */

/** Used to specify the target player(s) for various API functions. */
declare const ALL_PLAYERS: PlayerFilterType;

/** Used to specify the target player(s) for various API functions. */
declare const ALLIES: PlayerFilterType;

/** Used to specify the target player(s) for various API functions. */
declare const ENEMIES: PlayerFilterType;

type PlayerFilterType = number;


/* ---------- Base Object: type ---------- */

declare const DROID: ObjectTypeType;
declare const STRUCTURE: ObjectTypeType;
declare const FEATURE: ObjectTypeType;

type ObjectTypeType = number;


/* ---------- Structure Object: status ---------- */

declare const BEING_BUILT: StructureStatusType;
declare const BUILT: StructureStatusType;

type StructureStatusType = number;


/* ---------- Structure Object: stattype ---------- */

declare const HQ: StructureStatType;
declare const FACTORY: StructureStatType;
declare const POWER_GEN: StructureStatType;
declare const RESOURCE_EXTRACTOR: StructureStatType;
declare const LASSAT: StructureStatType;
declare const DEFENSE: StructureStatType;
declare const WALL: StructureStatType;
declare const RESEARCH_LAB: StructureStatType;
declare const REPAIR_FACILITY: StructureStatType;
declare const CYBORG_FACTORY: StructureStatType;
declare const VTOL_FACTORY: StructureStatType;
declare const REARM_PAD: StructureStatType;
declare const SAT_UPLINK: StructureStatType;
declare const GATE: StructureStatType;
declare const STRUCT_GENERIC: StructureStatType;
declare const COMMAND_CONTROL: StructureStatType;

type StructureStatType = number;


/* ---------- Droid Object: droidType ---------- */

/** Trucks and cyborg constructors. */
declare const DROID_CONSTRUCT: DroidTypeType;

/** Droids with weapon turrets, except cyborgs. */
declare const DROID_WEAPON: DroidTypeType;

/** Non-cyborg two-legged units, like scavengers. */
declare const DROID_PERSON: DroidTypeType;

/** Units with repair turret, including repair cyborgs. */
declare const DROID_REPAIR: DroidTypeType;

/** Units with sensor turret. */
declare const DROID_SENSOR: DroidTypeType;

/** Unit with ECM jammer turret. */
declare const DROID_ECM: DroidTypeType;

/** Cyborgs with weapons. */
declare const DROID_CYBORG: DroidTypeType;

/** Cyborg transporter. */
declare const DROID_TRANSPORTER: DroidTypeType;

/** Droid transporter. */
declare const DROID_SUPERTRANSPORTER: DroidTypeType;

/** Commanders. */
declare const DROID_COMMAND: DroidTypeType;

/** Any type of droid (used in filters). */
declare const DROID_ANY: DroidTypeType;

type DroidTypeType = number;


/* ---------- Droid Object: order ---------- */
/** Order a droid to attack something. */
declare const DORDER_ATTACK: DroidOrderType;

/** Order a droid to move somewhere. */
declare const DORDER_MOVE: DroidOrderType;

/** Order a droid to move somewhere and stop to attack anything on the way. */
declare const DORDER_SCOUT: DroidOrderType;

/** Order a droid to build something. */
declare const DORDER_BUILD: DroidOrderType;

/** Order a droid to help build something. */
declare const DORDER_HELPBUILD: DroidOrderType;

/** Order a droid to build something repeatedly in a line. */
declare const DORDER_LINEBUILD: DroidOrderType;

/** Order a droid to repair something. */
declare const DORDER_REPAIR: DroidOrderType;

/** Order a droid to patrol. */
declare const DORDER_PATROL: DroidOrderType;

/** Order a droid to demolish something. */
declare const DORDER_DEMOLISH: DroidOrderType;

/** Order a droid to embark on a transport. */
declare const DORDER_EMBARK: DroidOrderType;

/** Order a transport to disembark its units at the given position. */
declare const DORDER_DISEMBARK: DroidOrderType;

/** Order a droid to fire at whatever the target sensor is targeting. (3.2+ only) */
declare const DORDER_FIRESUPPORT: DroidOrderType;

/** Assign the droid to a commander. (3.2+ only) */
declare const DORDER_COMMANDERSUPPORT: DroidOrderType;

/** Order a droid to stop whatever it is doing. (3.2+ only) */
declare const DORDER_STOP: DroidOrderType;

/** Order a droid to return for repairs. (3.2+ only) */
declare const DORDER_RTR: DroidOrderType;

/** Order a droid to return to base. (3.2+ only) */
declare const DORDER_RTB: DroidOrderType;

/** Order a droid to hold its position. (3.2+ only) */
declare const DORDER_HOLD: DroidOrderType;

/** Order a VTOL droid to rearm. If given a target, will go to specified rearm pad. If not, will go to nearest rearm pad. (3.2+ only) */
declare const DORDER_REARM: DroidOrderType;

/** Order a droid to keep a target in sensor view. (3.2+ only) */
declare const DORDER_OBSERVE: DroidOrderType;

/** Order a droid to pick up something. (3.2+ only) */
declare const DORDER_RECOVER: DroidOrderType;

/** Order a droid to factory for recycling. (3.2+ only) */
declare const DORDER_RECYCLE: DroidOrderType;

type DroidOrderType = number;


/* ---------- Feature Object: stattype ---------- */
declare const OIL_RESOURCE: FeatureObjectStatType;
declare const OIL_DRUM: FeatureObjectStatType;
declare const ARTIFACT: FeatureObjectStatType;

type FeatureObjectStatType = number;


//////////////////////////////////////////// OBJECTS ////////////////////////////////////////////

/**
 * Base Object:
 * Describes a basic object. It will always be a droid, structure or feature, but sometimes the
 * difference does not matter, and you can treat any of them simply as a basic object. These
 * fields are also inherited by the droid, structure and feature objects.
 * The following properties are defined:
 */
interface BaseObject {
  /** It will be one of ```DROID```, ```STRUCTURE``` or ```FEATURE```. */
  type: ObjectTypeType;

  /** The unique ID of this object. */
  id: number;

  /** X position of the object in tiles. */
  x: number;

  /** Y position of the object in tiles. */
  y: number;

  /** Z (height) position of the object in tiles. */
  z: number;

  /** The player owning this object. */
  player: number;

  /** A boolean saying whether 'selectedPlayer' has selected this object. */
  selected: boolean;

  /** A user-friendly name for this object. */
  name: string;

  /** Percentage that this object is damaged (where 100 means not damaged at all). */
  health: number;

  /** Amount of armour points that protect against kinetic weapons. */
  armour: number;

  /** Amount of thermal protection that protect against heat based weapons. */
  thermal: number;

  /** The game time at which this object was produced or came into the world. (3.2+ only) */
  born: number;
}

/**
 * Droid (unit) object:
 * Describes a droid. It inherits all the properties of the Base Object.
 * In addition, the following properties are defined:
 */
interface DroidObject extends BaseObject {
  /** It will always be ```DROID```. */
  type: typeof DROID;

  /** The current order of the droid. This is its plan. The following orders are defined: */
  order: DroidOrderType;

  /** The current action of the droid. This is how it intends to carry out its plan. The C++ code 
   * may change the action frequently as it tries to carry out its order. You never want to set
   * the action directly, but it may be interesting to look at what it currently is. */
  action: number;

  /** The droid's type. The following types are defined: */
  droidType: DroidTypeType;

  /** The group this droid is member of. This is a numerical ID. If not a member of any group, will be set to \emph{null}. */
  group: number;

  /** The percentage of weapon capability that is fully armed. Will be ```null``` for droids other than VTOLs. */
  armed: number | null;

  /** Amount of experience this droid has, based on damage it has dealt to enemies. */
  experience: number;

  /** What it would cost to build the droid. (3.2+ only) */
  cost: number;

  /** True if the droid is VTOL. (3.2+ only) */
  isVTOL: boolean;

  /** True if the droid is currently flying. (4.6.0+ only) */
  isFlying: boolean;

  /** True if the droid has anti-air capabilities. (3.2+ only) */
  canHitAir: boolean;

  /** True if the droid has anti-ground capabilities. (3.2+ only) */
  canHitGround: boolean;

  /** True if the droid has sensor ability. (3.2+ only) */
  isSensor: boolean;

  /** True if the droid has counter-battery ability. (3.2+ only) */
  isCB: boolean;

  /** True if the droid has radar detector ability. (3.2+ only) */
  isRadarDetector: boolean;

  /** One or more of the droid's weapons are indirect. (3.2+ only) */
  hasIndirect: boolean;

  /** Maximum range of its weapons. (3.2+ only) */
  range: number;

  /** The body component of the droid. (3.2+ only) */
  body: string;

  /** The propulsion component of the droid. (3.2+ only) */
  propulsion: string;

  /** The weapon components of the droid, as an array. Contains 'name', 'id', 'armed' percentage and 'lastFired' properties. (3.2+ only) */
  weapons: object;    

  /** Defined for transporters only: Total cargo capacity (number of items that will fit may depend on their size). (3.2+ only) */
  cargoCapacity: number;

  /** Defined for transporters only: Cargo capacity left. (3.2+ only) */
  cargoSpace: number;

  /** Defined for transporters only: Number of individual items in the cargo hold. (3.2+ only) */
  cargoCount: number;

  /** The amount of cargo space the droid will take inside a transport. (3.2+ only) */
  cargoSize: number;
}

/**
 * Structure (building) object.
 * Describes a structure (building). It inherits all the properties of the Base Object.
 * In addition, the following properties are defined:
 */
interface StructureObject extends BaseObject {
  /** The completeness status of the structure. It will be one of ```BEING_BUILT``` and ```BUILT```. */
  status: StructureStatusType;

  /** The type will always be ```STRUCTURE```. */
  type: typeof STRUCTURE;

  /** What it would cost to build this structure. (3.2+ only) */
  cost: number;

  /** The direction the structure is facing. (4.5+ only) */
  direction: number;

  /** The stattype defines the type of structure. It will be one of ```HQ```, ```FACTORY```, ```POWER_GEN```, 
   * ```RESOURCE_EXTRACTOR```, ```LASSAT```, ```DEFENSE```, ```WALL```, ```RESEARCH_LAB```, ```REPAIR_FACILITY```,
   * ```CYBORG_FACTORY```, ```VTOL_FACTORY```, ```REARM_PAD```, ```SAT_UPLINK```, ```GATE```, ```STRUCT_GENERIC```, 
   * and ```COMMAND_CONTROL```.*/
  stattype: number;

  /** If the stattype is set to ```FACTORY```, ```VTOL_FACTORY```, ```POWER_GEN``` or ```RESEARCH_LAB```, 
   * then this property is set to the number of module upgrades it has.*/
  modules: number;

  /** True if the structure has anti-air capabilities. (3.2+ only) */
  canHitAir: boolean;

  /** True if the structure has anti-ground capabilities. (3.2+ only) */
  canHitGround: boolean;

  /** True if the structure has sensor ability. (3.2+ only) */
  isSensor: boolean;

  /** True if the structure has counter-battery ability. (3.2+ only) */
  isCB: boolean;

  /** True if the structure has radar detector ability. (3.2+ only) */
  isRadarDetector: boolean;

  /** Maximum range of its weapons -> FishBot note: this parameter needs to be scaled to be correct for game-tiles (divide by 128). (3.2+ only) */
  range: number;

  /** One or more of the structure's weapons are indirect. (3.2+ only) */
  hasIndirect: boolean;
}


/**
 * Feature Object:
 * Describes a feature (a **game object** not owned by any player). It inherits all the properties of the Base Object.
 * In addition, the following properties are defined:
 */
interface FeatureObject extends BaseObject {
  /** It will always be ```FEATURE```. */
  type: typeof FEATURE;

  /** The type of feature. Defined types are ```OIL_RESOURCE```, ```OIL_DRUM``` and ```ARTIFACT```. */
  stattype: FeatureObjectStatType;

  /** Can this feature be damaged? */
  damageable: boolean;
}


//////////////////////////////////////////// FUNCTIONS ////////////////////////////////////////////

/**
  ## include(filePath)
  Includes another source code file at this point. You should generally only specify the filename,
  not try to specify its path, here.
  However, *if* you specify sub-paths / sub-folders, the path separator should **always** be forward-slash ("/").
*/
declare function include(path: string): void;

/**
  ## debug(...string)

  Output text to the command line.
*/
declare function debug(...string: string[]): void;

/**
## profile(functionName[, arguments])

Calls a function with given arguments, measures time it took to evaluate the function,
and adds this time to performance monitor statistics. Transparently returns the
function's return value. The function to run is the first parameter, and it
_must be quoted_. (3.2+ only)
*/
declare function profile(functionName: string, arguments?: any): any;

/**
## enumRange(x, y, range[, playerFilter[, seen]])

Returns an array of game objects seen within range of given position that passes the optional playerFilter
which can be one of a player index, ```ALL_PLAYERS```, ```ALLIES``` or ```ENEMIES```. By default, playerFilter is
```ALL_PLAYERS```. Finally an optional parameter can specify whether only visible objects should be
returned; by default only visible objects are returned. Calling this function is much faster than
iterating over all game objects using other enum functions. (3.2+ only)
*/
declare function enumRange(x: number, y: number, range: number, playerFilter?: number, seen?: boolean): (DroidObject | StructureObject)[];

/**
  ## enumStruct([player[, structureType[, playerFilter]]])

  Returns an array of structure objects. If no parameters given, it will
  return all of the structures for the current player. The second parameter
  can be either a string with the name of the structure type as defined in
  "structures.json", or a stattype as defined in ```Structure```. The
  third parameter can be used to filter by visibility, the default is not
  to filter.
*/
declare function enumStruct(player?: number, structureType?: number, playerFilter?: boolean): StructureObject[];

/**
  ## enumDroid([player[, droidType[, playerFilter]]])

  Returns an array of droid objects. If no parameters given, it will
  return all of the droids for the current player. The second, optional parameter
  is the name of the droid type. The third parameter can be used to filter by
  visibility - the default is not to filter.
*/
declare function enumDroid(player?: number, droidType?: number, playerFilter?: boolean): DroidObject[];

/**
## countStruct(structureName[, playerFilter])

Count the number of structures of a given type.
The playerFilter parameter can be a specific player, ```ALL_PLAYERS```, ```ALLIES``` or ```ENEMIES```.
 */
declare function countStruct(structureName: StructureStatType, playerFilter?: PlayerFilterType): number;

/**
## countDroid([droidType[, playerFilter]])

Count the number of droids that a given player has. Droid type must be either
```DROID_ANY```, ```DROID_COMMAND``` or ```DROID_CONSTRUCT```.
The playerFilter parameter can be a specific player, ```ALL_PLAYERS```, ```ALLIES``` or ```ENEMIES```. 
 */
declare function countDroid(droidType: DroidTypeType, playerFilter?: PlayerFilterType): number;

/**
## tileIsBurning(x, y)

Returns whether the given map tile is burning. (3.5+ only)
 */
declare function tileIsBurning(x: number, y: number): boolean;

/**
## isStructureAvailable(structureName[, player])

Returns true if given structure can be built. It checks both research and unit limits.
*/
declare function isStructureAvailable(structureName: string, player?: number): boolean;

/**
## structureIdle(structure)

Is given structure idle?
 */
declare function structureIdle(structure: StructureObject): boolean;

/**
## pickStructLocation(droid, structureName, x, y[, maxBlockingTiles])

Pick a location for constructing a certain type of building near some given position.
Returns an object containing "type" ```POSITION```, and "x" and "y" values, if successful.
 */
declare function pickStructLocation(droid: DroidObject, structureName: string, x: number, y: number, maxBlockingTiles?: number): BaseObject;

/**
## structureCanFit(structureName, x, y[, direction])

Returns true if given building can be built at the position. (4.6+ only).
FishBot note: not sure how to use ```direction```.
 */
declare function structureCanFit(structureName: string, x: number, y: number, direction?: number): boolean;

/**
## propulsionCanReach(propulsionName, x1, y1, x2, y2)

Return true if a droid with a given propulsion is able to travel from (x1, y1) to (x2, y2).
Does not take player built blockades into account. (3.2+ only)
*/
declare function propulsionCanReach(propulsionName: string, x1: number, y1: number, x2: number, y2: number): boolean;

/**
## orderDroidBuild(droid, order, structureName, x, y[, direction])

Give a droid an order to build something at the given position. Returns true if allowed.
*/
declare function orderDroidBuild(droid: DroidObject, order: DroidOrderType, structureName: string, x: number, y: number, direction?: number): boolean;

/**
## orderDroidObj(droid, order, object)

Give a droid an order to do something to something.
*/
declare function orderDroidObj(droid: DroidObject, order: DroidOrderType, object: BaseObject): void;

/**
## orderDroidLoc(droid, order, x, y)

Give a droid an order to do something at the given location.
 */
declare function orderDroidLoc(droid: DroidObject, order: DroidOrderType, x: number, y: number): void;

/**
## orderDroid(droid, order)

Give a droid an order to do something. (3.2+ only)
 */
declare function orderDroid(droid: DroidObject, order: DroidOrderType): void;


/**
## getObject(label | x, y | type, player, id)

Fetch something denoted by its object ID (FishBot only uses getObject in this way). 
You need to pass its type, owner and unique object ID. This is an operation of O(n) algorithmic complexity. (3.2+ only)

The function returns an object that has a type variable defining what it is. 
This type will be one of DROID, STRUCTURE, FEATURE, AREA, GROUP or POSITION.

If no object is found, ```null``` is returned.
 */
declare function getObject(type: ObjectTypeType, player: number, id: string): (DroidObject | StructureObject | FeatureObject | null);

/**
## setTimer(functionName, milliseconds[, object])

Set a function to run repeated at some given time interval. The function to run
is the first parameter, and it _must be quoted_, otherwise the function will
be inlined. The second parameter is the interval, in milliseconds. A third, optional
parameter can be a **game object** to pass to the timer function. If the **game object**
dies, the timer stops running. The minimum number of milliseconds is 100, but such
fast timers are strongly discouraged as they may deteriorate the game performance.

```js
function conDroids()
{
  ... do stuff ...
}
// call conDroids every 4 seconds
setTimer("conDroids", 4000);
```
 */
declare function setTimer(functionName: string, milliseconds: number, object?: BaseObject): void;

/**
## changePlayerColour(player, colour)

Change a player's colour slot. The current player colour can be read from the ```playerData``` array. Available colours
are green, orange, gray, black, red, blue, pink, cyan, yellow, purple, white, bright blue, neon green, infrared,
ultraviolet, and brown, represented by the integers 0 - 15 respectively.
 */
declare function changePlayerColour(player: number, colour: number): void;

/**
## transformPlayerToSpectator(player)

Transform a player to a spectator (4.2+ only).
This is a one-time transformation, destroys the player's HQ and all of their remaining units, and must occur deterministically on all clients.
 */
declare function transformPlayerToSpectator(player: number): void;

/**
## queue(functionName[, milliseconds[, object]])

Queues up a function to run at a later game frame. This is useful to prevent
stuttering during the game, which can happen if too much script processing is
done at once.  The function to run is the first parameter, and it
_must be quoted_, otherwise the function will be inlined.
The second parameter is the delay in milliseconds, if it is omitted or 0,
the function will be run at a later frame.  A third optional
parameter can be a **game object** to pass to the queued function. If the **game object**
dies before the queued call runs, nothing happens.
 */
declare function queue(functionName: string, milliseconds?: number, object?: BaseObject): void;

/**
## isVTOL(droid)

Returns true if given droid is a VTOL (not including transports).
 */
declare function isVTOL(droid: DroidObject): bool;

/**
## componentAvailable([componentType, ]componentName)

Checks whether a given component is available to the current player. 
The first argument is optional and deprecated (omitted in FishBot's function declarations).
 */
declare function componentAvailable(componentName: string): boolean;

/**
## getDroidLimit([player[, droidType]])

Return maximum number of droids that this player can produce. This limit is usually
fixed throughout a game and the same for all players. If no arguments are passed,
returns general droid limit for the current player. If a second, droid type argument
is passed, the limit for this droid type is returned, which may be different from
the general droid limit (eg for commanders and construction droids). (3.2+ only)
 */
declare function getDroidLimit(player?: number, droidType?: droidTypeType): number;

/**
 * ## getStructureLimit(structureName[, player])
 * 
 * Returns build limits for a structure.
 */
declare function getStructureLimit(structureName: string, player?: number): number;

/**
## buildDroid(factory, templateName, body, propulsion, reserved, reserved, turrets...)

Start factory production of new droid with the given name, body, propulsion and turrets.
The reserved parameter should be passed **null** for now. The components can be
passed as ordinary strings, or as a list of strings. If passed as a list, the first available
component in the list will be used. The second reserved parameter used to be a droid type.
It is now unused and in 3.2+ should be passed "", while in 3.1 it should be the
droid type to be built. Returns a boolean that is true if production was started.
 */
declare function buildDroid(factory: StructureObject, templateName: string, body: string, propulsion: string, reserved: null, reserved: string, turrets: string): boolean;

/**
## pursueResearch(labStructure, research)

Start researching the first available technology on the way to the given technology.
First parameter is the structure to research in, which must be a research lab. The
second parameter is the technology to pursue, as a text string as defined in "research.json".
The second parameter may also be an array of such strings. The first technology that has
not yet been researched in that list will be pursued.
 */
declare function pursueResearch(labStructure: StructureObject, research: string): boolean;

/**
## enumResearch()

Returns an array of all research objects that are currently and immediately available for research.
 */
declare function enumResearch(): BaseObject[];

/**
## chat(playerFilter, message)

Send a message to playerFilter. playerFilter may also be ```ALL_PLAYERS``` or ```ALLIES```.
Returns a boolean that is true on success. (3.2+ only)
 */
declare function chat(playerFilter: PlayerFilterType, message: string): boolean;

/**
## allianceExistsBetween(player1, player2)

Returns true if an alliance exists between the two players, or they are the same player.
 */
declare function allianceExistsBetween(player1: number, player2: number): boolean;

/**
## playerPower(player)

Return amount of power held by the given player.
 */
declare function playerPower(player: number): number;

/**
## queuedPower(player)

Return amount of power queued up for production by the given player. (3.2+ only)
 */
declare function queuedPower(player: number): number;

/**
## hackMarkTiles([label | x, y[, x2, y2]])

Mark the given tile(s) on the map. Either give a ```POSITION``` or ```AREA``` label,
or a tile x, y position, or four positions for a square area. If no parameter
is given, all marked tiles are cleared. (3.2+ only)
 */
declare function hackMarkTiles(x?: int, y?: int, x2?: int, y2?: int): void;

/**
## addBeacon(x, y, playerFilter[, message])

Send a beacon message to target player. Target may also be ```ALLIES```.
Message is currently unused. Returns a boolean that is true on success. (3.2+ only)
 */
declare function addBeacon(x: int, y: int, playerFilter: PlayerFilterType, message?: string): boolean;
