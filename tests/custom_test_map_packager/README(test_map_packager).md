## FishBot Custom Map Packager (for Bot vs Bot testing)

Intent: I want to run representative bot vs bot matches to test FishBot under a wide range of conditions.
This includes games with no human player slots.

### Game Engine Limitations
Warzone2100 (up to v4.7.0) currently cannot:
1. Increase gamespeed while the player is a 'spectatorhost' (it counts as multiplayer game).
2. Create a bot-only skirmish (i.e. challenge) game without a forced human player.
   - In 'challenge' mode, Player 0 is force-added as a human player slot.

### Proposed Solution 
* Replace `Player 0` with `Player {currMaxPlayers + 1}`. This can be achieved by force-spawning the new player directly on top of `Player 0`.
* If possible, this will allow Approach 2 to be used generally for all maps supplied with the base game, as long as FishBot forces `Player 0` to be a spectator (it currently does this when the `DEBUG_MODE_ON` flag is enabled).
 
------------
## Script Usage

### Step 1: Manually extract map data from game files (done once)
To get the raw map data required for this script:
1. Find the `mp.wz` file in your Warzone2100 install location.
2. Make a copy of `mp.wz` in your Downloads folder.
3. Open up the `Downloads\mp.wz` archive in 7-Zip and navigate to `multiplay\maps`.
4. Extract all of the internal folders in `multiplay\maps` (leave the `.gam` files, they are not needed).
5. Place all of the extracted folders in `fishbot\tests\custom_test_map_packager\v4.7.0_base_maps`.

### Step 2: Create custom maps with Player 0 overwritten with Player N+1
1. In `tests\run_test_generator.py`, set the input file directory to the directory above e.g. `fishbot\tests\custom_test_map_packager\v4.7.0_base_maps`.
2. Then, set the output file directory. e.g. `%Warzone 2100 Configuration Directory%\maps`.
3. Finally, run `run_test_generator.py`. 
   * This will write the resulting custom `.wz` map files to the specified output file directory.  

### Step 3: Set FishBot to `DEBUG_MODE_ON`, which forces Player 0 to be a spectator.
