# FishBot Development

## System Requirements
* Python 3.11 
* VSCode (or any other development environment for Javascript)
* PyCharm (or any other development environment for Python)

## Setting up a new Development Environment (Windows 11 only)
### Setting up Configuration Directories for Development & Production
1. Install Warzone2100 v4.6.1+ (in this example, I use Warzone 2100 v4.7.0) as a Portable Install. To do this:
   1. Download the Warzone 2100 installer.
   2. Open the installer, select your language, then click the `Advanced` button in the bottom left of the `Welcome to the Warzone 2100 Setup Wizard` page.
   3. Select `Portable Install`.
   4. Click OK, then Next until you reach the `Select Destination Location` page.
   5. Set the output directory to any folder e.g. `Documents/Warzone 2100`.
   6. In `Select Components` screen, remove `Addons` & `Videos` (they are not required for FishBot development).
   7. Click OK and let Warzone 2100 install.
2. Create a new folder in `Documents`, called `wz2100_config_dir`. 
   * This is the development Config Directory (we are separating the Config Directory for development & production).
3. Go to your install directory and run `launch_warzone.bat`. Then, **close** Warzone 2100.
   * This forces the creation of a new "Warzone2100 Configuration Directory" e.g. Warzone 2100 creates a new folder `Documents/Warzone 2100/Warzone 2100`.
4. Rename the new `Warzone 2100` folder to `PRODCONFIG`, e.g. `Documents/Warzone 2100/PRODCONFIG`.
5. **Copy** & paste the contents of `Warzone 2100/PRODCONFIG` (e.g. folders like `maps`, `mods`, `multiplay`, etc.) inside `wz2100_config_dir` (from Step 2).
5. Go to: `Documents/wz2100_config_dir/mods/4.x.x/autoload/` and clone FishBot into a *new directory* e.g. `autoload/fishbot`. 
   * If done correctly, the new directory should look like `Documents/wz2100_config_dir/mods/4.7.0/autoload/fishbot/multiplay/skirmish/FishBot.js`. 
   * This is the **development** copy of FishBot.
6. Move `Warzone 2100` inside `fishbot`. If done correctly, the folder path should look like:
   `Documents/wz2100_config_dir/mods/4.x.x/autoload/fishbot/Warzone 2100`.
7. Go to the Production mods folder: `Documents/wz2100_config_dir/mods/4.x.x/autoload/fishbot/Warzone 2100/PRODCONFIG/mods/4.x.x/autoload` and clone FishBot into a *new directory* e.g. `autoload/fishbot`.
   * If done correctly, the new folder path should look like: `fishbot/Warzone 2100/PRODCONFIG/mods/4.x.x/autoload/fishbot/multiplay/skirmish/FishBot.js`. 
   * This is the **production** copy of FishBot.

### Setting up Supporting Files for Bot-only Tests
1. Get the raw map files you want to test (required for 'bot-only' autogames). To do this:
   1. Go to `fishbot/tests/custom_test_map_packager`.
   2. Follow the steps in `README(test_map_packager).md` to install the custom maps into both the Production & Development folders.
2. Create a new 'Spectator' bot. To do this:
   1. Create this folder `wz2100_config_dir/mods/4.7.0/autoload/spectator/multiplay/skirmish`.
   2. Copy paste the following into a text editor (e.g. Notepad):
   ```javascript
      function eventStartLevel() {
          transformPlayerToSpectator(me);	
      }
   ```
   3. Save the file as `Spectator.js` inside `skirmish` (select "Save as type" as `All files`).
      * If done correctly, you should be able to see `spectator/multiplay/skirmish/Spectator.js`.
   4. Open a new text editor window. Copy-paste the following inside the new window:
   ```json
   {
	    "AI": {
		    "js": "Spectator.js",
		    "name": "Spectator",
		    "tip": "Sets itself to a spectator as soon as the game starts."
      }
   }
   ```
   5. Save the file as `Spectator.json` inside the `skirmish` folder (select "Save as type" as `All files`).
      * If done correctly, you should be able to see `Spectator.json` as well as `Spectator.js` inside `spectator/multiplay/skirmish/`.
   6. Duplicate the `spectator` folder inside `PRODCONFIG/mods/4.7.0/autoload`. 
      * If done correctly, you should be able to see: `PRODCONFIG/mods/4.7.0/autoload/spectator/multiplay/skirmish`.
3. Open Command Prompt and run `pip install pandas`.

## Running Automated Tests
1. Pull the latest commits for FishBot into both the development (for the test runner) and production folders (for the source code under test).
2. Open up `fishbot/tests` in your Python IDE.
3. Telemetry (oil capture and brigade strength/position) is collected automatically whenever `DEBUG_MODE_ON` is `true` (which it is throughout a development cycle). See *Telemetry* below.
4. Run `run_pipeline.py`. This runs the whole pipeline in sequence (may take up to ~1 day to complete, depending on the number of tests requested):
   1. `run_test_generator.py` (~5 seconds) — only when `REGENERATE_TESTS` is set. Re-run this if the map or test information has changed (e.g. a new set of maps, or modified skirmish settings), or if the output folder location has changed. Please double check the output folder path before enabling it.
   2. `run_tests.py` — runs the autogames.
   3. `run_result_parser.py` (~5 seconds) — reports win / loss.
   4. `run_telemetry_parser.py` (~5 seconds) — reports oil capture.

   All the settings which used to be edited across those scripts (commit SHA, games per test, worker count, whether to regenerate the tests, and the map paths) are gathered into the single `USER CONFIG` block at the bottom of `run_pipeline.py`. The commit SHA now defaults to `git rev-parse HEAD`, so it no longer has to be pasted in by hand.

   The individual scripts still work standalone if you would rather run one stage at a time — in that case remember to set `COMMIT_SHA` in both `run_tests.py` and `run_result_parser.py`.

   Note: The implementation of the game-summary-table parser is platform-dependent (works on Windows only). Please implement your own terminal-scraper function for Linux / Mac.

For any test that warrants further investigation, you can use `spectate_map.exe` to select and run the test in spectator mode.

### Telemetry
FishBot can emit machine-readable `TEL|...` lines describing how well it is playing. These are picked up by the same console scrape which already recovers the Game State summary table, and are reported by `run_telemetry_parser.py` as part of the pipeline above.

To use it:
1. Check that `DEBUG_MODE_ON` is `true` in the **production** copy of `FishBot_vX_Y_Z.js` (i.e. the copy under test — the same copy whose behaviour the results describe). `TELEMETRY_ON` follows it, so there is nothing separate to enable, and telemetry is automatically off in a release. To use debug mode *without* the TEL output, set `TELEMETRY_ON = false` explicitly.
2. Make sure the console is **wide enough that lines do not wrap**. This already matters for the Game State summary table; telemetry lines have the same requirement.
3. Run `run_pipeline.py` as above.

The report gives, per map and per test type:
* **fair share** — FishBot's derricks divided by an even split between the living players. `1.00` means it held exactly its fair share; above `1.00` means it out-captured its opponents. This is measured over the *contested* part of the game only (i.e. while more than one player was alive), because once the opponent is knocked out the even-split denominator collapses to the whole map.
* **oil share** — FishBot's derricks divided by all derricks on the map, as a plain `0.00`–`1.00` fraction.
* **free oil** — the fraction of derricks nobody had claimed. A high value means there was oil available which FishBot did not go and take.
* **peak**, **@5min** and **@10min** oil share, which show how quickly it expanded.
* **conversion rate** — how often a decision to capture a derrick actually produced one. This is the intent half of the picture: without it, a derrick left unclaimed is ambiguous, because trucks may have been sent and failed, or nothing may have been sent at all.
* **strength** — the summed strength of FishBot's brigades, with its **peak** and the raw **units** count beside it. Brigade `strength` is smoothed and counts direct-fire units only, so it is what FishBot believes it can fight with; the units count is every unit in the brigades, so the two together separate "understrength" from "still decaying after a fight".
* **brigades** — how many brigades actually held units, and the **spread**: the mean distance in tiles between their force centres. Low spread means the brigades fought as one mass, high means they were split across the map. Losses at high spread suggest FishBot was defeated in detail.
* **army** — every direct-fire unit FishBot owned, with how much of it was **uncommitted** (owned but not in one of the four commanded brigades — e.g. sitting in the reserve). A large gap means it built a force and never committed it, which looks the same as never building one if only the brigades are measured.
* **vs enemy** — the mean ratio of FishBot's army strength to its opponents', with the two strengths and the distance between the sides' force centres beside it. `1.00` means evenly matched; below it FishBot was fighting outnumbered. Both sides count armed direct-fire units only, so trucks and sensors do not inflate either number. A good ratio at a large distance means it massed an army it never brought to bear. Only reported when `TEL_INSTRUMENT_OPPONENTS` is `true` in `_telemetry.js` (the default) — set it to `false` to sample FishBot alone. Opponent sampling reads their units directly, which is sound only because telemetry never feeds a decision; nothing it collects may be routed into the bot's own reasoning.

The oil-share and force figures above are time-weighted, so an uneven sampling cadence does not bias them.

The manual log parser (below) additionally reports the **failure reasons** behind unconverted commitments (trucks lost / beaten to the derrick / called off as too dangerous), the **mean distance** of converted versus lost commitments, and **derrick losses** with how long a derrick survived before being destroyed.

Raw telemetry is stored next to the results, as `results/<short sha>/<test_id>.tel.jsonl`. If the report says no telemetry was captured, `DEBUG_MODE_ON` was most likely `false` in the production copy.

#### Parsing a saved log by hand
To score a single game you ran yourself (rather than a whole batch test), save the game console output to a `.txt` file, set `target` at the top of `main()` in `tests/run_telemetry_log_parser.py`, and run it. `target` may also be a folder, in which case each log is treated as one game and an average is reported at the end.

Anything that is not a `TEL|...` line is ignored, so the console output can be pasted in as-is; Warzone's own `info |...` lines, FishBot's `deb()` output and the Game State table are all skipped.

Telemetry events are emitted from FishBot's decision sites, so they record what the bot actually believed and decided. To add a new event (e.g. map control, or unit group locations), add a method to `multiplay/skirmish/fb_includes_vX_Y_Z/_telemetry.js`, call it from the point where the relevant values exist (`hq_command.js` for strategy, `hq_toc.js` for missions, `_events.js` for destruction), then add a matching entry to `EVENT_EXTRACTORS` in `tests/run_telemetry_parser.py`. The wire format, the harvesting step and the storage format do not need to change.

### Build the Map-Selector GUI to observe FishBot in Spectator Mode
To spectate FishBot in real time, there is a handy map-selector GUI `spectate_map.exe` to configure a game in single-player spectator mode. This allows you to:
* observe how FishBot is performing in real time (with the statistics panel and free movement of the camera), and
* speed up or slow down the game using the in-game DEBUG controls.

To build `spectate_map.exe`, follow these steps:
   1. Open Command Prompt and run `pip install pyinstaller`.
   2. Go to this folder: `wz2100_config_dir\mods\4.7.0\autoload\fishbot\python_helper_scripts\spectate_map`.
   3. Run `build_spectate_map.bat`.
   4. In `Documents\wz2100_config_dir\mods\4.7.0\autoload\fishbot\`, check for:
      * New folder: `fishbot\_internal` and 
      * New .exe file: `fishbot\spectate_map.exe`.

On opening `spectate_map.exe`, make sure to Browse for the **Tests Folder** on your machine. 

The tests folder should point to the **Development** Configuration Directory (e.g. `Documents\wz2100_config_dir\tests`) so you can make local changes and immediately test the effect of those changes in spectator mode.

## Release Checklist
At the start of a new development cycle for a new version, run `python_helper_scripts/bump_version.py`. It renames the version-suffixed files/folders, updates the version constants, and sets `DEBUG_MODE_ON = true`.

When ready to release:
1. Run `tests/run_tests.py` and check the perf logs with `python_helper_scripts/process_performance_data.py`. Also manually test all maps marked "tested manually" in `README.md`, against Cobra @ Medium (pass if it can win a single game in 3 tries or less). Pass if no regression.
2. Update & commit `README.md` and `CHANGELOG.md` (test results & summary of changes).
3. Run `python_helper_scripts/release.py` → **Toggle DEBUG_MODE_ON** (off). This also disables telemetry, since `TELEMETRY_ON` follows it.
4. Run `python_helper_scripts/release.py` → **Update LOC stats**.
6. Run `python_helper_scripts/release.py` → **Build release zip**.
7. Push `development` to origin and open a PR on GitHub titled "FishBot vX.Y.Z Release".
8. Merge the PR into `main`.
9. On GitHub, create a new Release: tag it `fishbot-vX.Y.Z` targeting `main`, paste the `CHANGELOG.md` entry into the release notes, and attach the zip built in Step 6.

## Software Documentation Methods
The intent of the following documentation methods is to make changing the software easier:
* `jsdocs` style function/type declarations are used throughout the code to allow for IDE error checking.
* Additionally, `wz2100-js-api.d.ts` declares the typing of commonly used JS API functions and global variables from the Warzone 2100 game engine.
* The addition of `jsconfig.json` allows VSCode to understand the various symbols within the project, allowing for some type checking and code navigation.
