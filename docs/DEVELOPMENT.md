# FishBot Development

## System Requirements
* Python 3.11 
* VSCode (or any other development environment for Javascript)
* PyCharm (or any other development environment for Python)

## Setting up a new Development Environment (Windows 11 only)
1. Install Warzone2100 (in this example, I use Warzone 2100 v4.7.0).
2. Create a new Warzone2100 Configuration Directory e.g. `Documents/wz2100_config_dir`.
3. Clone FishBot into the mods folder e.g. `Documents/wz2100_config_dir/mods/4.7.0/autoload/fishbot`.
4. Create a 'Production' (clean) install of Warzone2100. This is what the GUI test runner targets. To do this:
   1. Install a portable version of Warzone 2100 v4.7.0+ in the `fishbot` root directory, i.e. `fishbot/Warzone2100/bin/warzone2100.exe`.
5. Set up the map files you want to test (required for 'bot-only' autogames). 
   1. Go to `fishbot/tests/custom_test_map_packager`.
   2. Follow `README(test_map_packager).md` in this folder to load the maps you want to test into a subfolder: `custom_test_map_packager/v4.7.0_base_maps`. This is used by the 'test_generator' to generate a new map.
6. Create a new 'Spectator' bot. To do this:
   1. Create this folder `wz2100_config_dir/mods/4.7.0/autoload/spectator/multiplay/skirmish`.
   2. In the `skirmish` folder, create an empty file using Notepad named `Spectator.js`.
   3. Open `Spectator.js` and copy-paste this:
   ```javascript
      function eventStartLevel() {
          transformPlayerToSpectator(me);	
      }
   ```
   4. Then, in the same `skirmish` folder, create another empty file named `Spectator.json`.
   5. Open `Spectator.json` and copy-paste this:
   ```json
   {
	    "AI": {
		    "js": "Spectator.js",
		    "name": "Spectator",
		    "tip": "Sets itself to a spectator as soon as the game starts."
      }
   }
   ```
7. Build the test runner GUI. To do this:
   1. If you don't have `pyinstaller`, open Command Prompt and run `pip install pyinstaller`.
   2. Go to `fishbot\python_helper_scripts\spectate_map`.
   3. Run `build_spectate_map.bat`.
   4. Check for this new folder: `fishbot\_internal` and this new .exe file: `fishbot\spectate_map.exe`.

## Running Automated Tests
Go to `fishbot/tests`, then run the files in this order (modifying the output file paths to the ones in your Configuration Directory):
1. `run_test_generator.py`
2. `run_tests.py` (wait a number of hours until these are complete). 
   * Note: The implementation of the result parser, which scrapes the output console, is platform-dependent (works on Windows only). Please implement your own for Linux / Mac.
3. `run_result_parser.py`

For any test that warrants further investigation, you can use `fishbot\spectate_map.exe` to run that test in spectator mode.

## Software Documentation Methods
The intent of the following documentation methods is to make changing the software easier:
* `jsdocs` style function/type declarations are used throughout the code to allow for IDE error checking.
* Additionally, `wz2100-js-api.d.ts` declares the typing of commonly used JS API functions and global variables from the Warzone 2100 game engine.
* The addition of `jsconfig.json` allows VSCode to understand the various symbols within the project, allowing for some type checking and code navigation.
