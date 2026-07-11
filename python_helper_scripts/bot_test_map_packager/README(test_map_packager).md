## Test Map Packager (for Bot vs Bot games)

Intent: I would like to run representative bot vs bot matches to test FishBot under a wide range of conditions.
This includes games with no empty player slots.

### Game Engine Limitations
Warzone2100 (up to v4.7.0) currently cannot:
1. Increase gamespeed while the player is a 'spectatorhost' (it counts as multiplayer game).
2. Create a bot-only (bot vs bot) skirmish (challenge) game where the player is an entity-less spectator. 
   - In challenge mode, Player 0 is force-added as a human player slot.

### Proposed Solution 
* Replace 'Player 0' with 'player {currMaxPlayers + 1}' by spawning the new player directly on top of Player 0.
* This will allow Approach 2 to be used generally for all maps supplied with the base game if FishBot forces Player 0
to be a spectator (as it currently does when `DEBUG_MODE_ON` is enabled).
 
------------
## Script Usage

### Step 1: Extract Map Data from Base Game
To get the raw map data required for this script:
1. Find the `mp.wz` file in your Warzone2100 install location & make a copy into your Downloads folder.
2. Open up the recently-copied `Downloads\mp.wz` archive in 7-Zip and navigate to `multiplay\maps`.
3. Extract all of the internal folders (leave the `.gam` files, they are not needed).
4. Place all of the extracted folders in `fishbot\python_helper_scripts\bot_test_map_packager\v4.7.0_base_maps`

### Step 2: Create Custom Maps with Player 0 duplicated with Player N+1

