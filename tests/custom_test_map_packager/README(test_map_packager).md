## FishBot Custom Map Packager (for Bot vs Bot testing)

Intent: I want to run representative bot vs bot matches to test FishBot under a wide range of conditions.
Ideally, this involves simulating thousands of games with no human player involved.

### Game Engine Limitations
Warzone2100 (up to v4.7.0) currently cannot:
1. Run autogames while the player is a *spectatorhost* (as far as I am aware). It is also not possible to increase the gamespeed when spectating as a *spectatorhost*, as DEBUG mode is disabled in multiplayer.
2. Create a bot-only skirmish game (i.e. 'challenge' mode) without a forced human player slot. 
   * In 'challenge' mode, Player 0 is force-added as a human player.
   * This means that any automatic tests are likely to be imbalanced as the Player 0 position is otherwise empty.

### Proposed Solution 
* Replace `Player 0` with `Player {currMaxPlayers + 1}` by force-spawning the new player directly on top of `Player 0`.
* As long as FishBot forces `Player 0` to be a spectator, this will allow Approach 2 to be used generally for all maps supplied with the base game, as an AI can be freely assigned to start position `{currMaxPlayers + 1}`.
 
## Supported Map Formats
Warzone2100 ships two flavours of multiplayer map inside `mp.wz`, and the re-packager handles both.
The format is detected from the contents of each map folder.

### 1. Static maps (`game.map` + `*.json`)
e.g. [`multiplay/maps/2c-highground`](https://github.com/Warzone2100/warzone2100/tree/master/data/mp/multiplay/maps/2c-highground).

The map is a folder of pre-baked data files (`game.map`, `ttypes.ttp`, `struct.json`, `droid.json`,
`feature.json`). The re-packager edits `struct.json` / `droid.json` directly: every `startpos: 0`
entry is handed to Player `N+1`, and a copy of Player 0's command centre is left behind so that
start position 0 still exists.

### 2. Script-generated ("js-defined") maps (`game.js`)
e.g. [`multiplay/maps/2c-DustyMaze`](https://github.com/Warzone2100/warzone2100/tree/master/data/mp/multiplay/maps/2c-DustyMaze).

The map folder is only `game.js` + `ttypes.ttp`. There is no map data on disk at all: the engine
runs `game.js` through its embedded QuickJS interpreter at load time, and the script hands the whole
map back in a single `setMapData(mapWidth, mapHeight, texture, height, structures, droids, features)`
call (see `lib/wzmaplib/src/map_script.cpp` in the Warzone2100 source).

Because the map content only exists once the script has run, there is nothing to edit on disk.
Re-implementing the script in Python would also mean re-implementing `gameRand()` in lockstep with
the engine's Mersenne Twister, which would be both fragile and pointless.

Instead, `__map_script_parser.py` rewrites the *script*, so that the exact same transformation runs
inside the engine on the data the script has just generated:
* a prologue defining `__fishbot_setMapData()` is prepended to `game.js`, and
* the script's single `setMapData(...)` call is redirected to it.

`__fishbot_setMapData()` re-labels the `structures` / `droids` arrays and then forwards everything to
the real `setMapData()`, so the terrain, heightmap, features and scavengers are left exactly as the
map author intended. The result is identical in shape to the static-map path above.

## Script Usage
The following pipeline implements the proposed solution.

### Step 1: Extract the map data from game files
To get the raw map data required for this script:
1. Find the `mp.wz` file in your Warzone2100 install location e.g. `Documents\wz2100_config_dir\Warzone 2100\data\mp.wz`.
2. Make a copy of `mp.wz` in your Downloads folder.
3. Open up the `Downloads\mp.wz` archive in 7-Zip and navigate to `multiplay\maps`.
4. Extract all of the internal folders in `multiplay\maps`, leaving out:
   * `10c-` maps (not compatible), and
   * `.gam` files (not required).
   
   Note: both static and script-generated map folders can be extracted as-is - the re-packager tells
   them apart on its own.
5. Place all of extracted folders in a new folder e.g. `fishbot\tests\custom_test_map_packager\v4.7.0_base_maps`. If done correctly, there should be a new folder `v4.7.0_base_maps` inside `custom_test_map_packager` filled with around 40 subfolders.

### Step 2: Create custom maps & test files (with Player 0 overwritten with Player N+1)
1. Go to `fishbot\tests`.
2. Update the FishBot version number in `CONSTANTS.py` (this is required to get the correct name of FishBot).
3. Open up `run_test_generator.py`.
4. Scroll down to `__main__` and change the `BASE_MAPS_PATH` variable to point to the new directory above, e.g. `fishbot\tests\custom_test_map_packager\v4.7.0_base_maps`.
5. Then, set the output Configuration Directory for both Production & Development folders (e.g. change the `BASE_PRODUCTION_DIRECTORY` & `BASE_DEV_DIRECTORY` variables).
6. Run `run_test_generator.py`. 
   * This will write the custom map files (in `.wz` format) to the specified output folders.
7. Check the status report in the console to see if the write was successful.  

### Step 3: Force Player 0 to be a spectator
1. Go to `fishbot\multiplay\skirmish` and open up `FishBot_vx_y_z.js`.
2. Change `DEBUG_MODE_ON` to `true`. 
   * `DEBUG_MODE` causes FishBot to call `transformPlayerToSpectator()`.
