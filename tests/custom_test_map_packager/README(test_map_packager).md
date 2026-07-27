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
5. Place all of extracted folders in a new folder e.g. `fishbot\tests\custom_test_map_packager\v4.7.0_base_maps`. If done correctly, there should be a new folder `v4.7.0_base_maps` inside `custom_test_map_packager` filled with around 40 subfolders.

### Step 2: Create custom maps & test files (with Player 0 overwritten with Player N+1)
1. Open up `fishbot\tests\run_test_generator.py`.
2. Scroll down to `__main__` and change the `BASE_MAPS_PATH` variable to point to the new directory above, e.g. `fishbot\tests\custom_test_map_packager\v4.7.0_base_maps`.
2. Then, set the output Configuration Directory for both Production & Development folders (e.g. change the `BASE_PRODUCTION_DIRECTORY` & `BASE_DEV_DIRECTORY` variables).
3. Finally, run `run_test_generator.py`. 
   * This will write the custom map files (in `.wz` format) to the specified output folders.
4. Check the status report in the console to see if the write was successful.  

### Step 3: Force Player 0 to be a spectator
1. Go to `fishbot\multiplay\skirmish` and open up `FishBot.js`.
2. Change `DEBUG_MODE_ON` to `true`. 
   * `DEBUG_MODE` causes FishBot to call `transformPlayerToSpectator()`.
