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
3. Run these Python scripts in this order:
   1. [*Optional*] `run_test_generator.py` (~5 seconds)
      * Please double check the output folder path before running the script.
      * Re-run this script if the map or test information has changed (e.g. a new set of maps, or modified skirmish settings). Also re-run the script if the output folder location has changed.
   2. `run_tests.py` (may take up to ~1 day to complete, depending on the number of tests requested).
      * Don't forget to change `COMMIT_SHA` for a new test.
      * Note: The implementation of the game-summary-table parser is platform-dependent (works on Windows only). Please implement your own terminal-scraper function for Linux / Mac.
   3. `run_result_parser.py` (~5 seconds)
      * Don't forget to change `COMMIT_SHA` for a new test.

For any test that warrants further investigation, you can use `spectate_map.exe` to select and run the test in spectator mode.

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

## Software Documentation Methods
The intent of the following documentation methods is to make changing the software easier:
* `jsdocs` style function/type declarations are used throughout the code to allow for IDE error checking.
* Additionally, `wz2100-js-api.d.ts` declares the typing of commonly used JS API functions and global variables from the Warzone 2100 game engine.
* The addition of `jsconfig.json` allows VSCode to understand the various symbols within the project, allowing for some type checking and code navigation.
