# FishBot Software Architecture
These diagrams are recent as of `FishBot v0.4.0+`.
They show how FishBot interacts with its partner systems.

## System Context Diagram
![FishBot System Context Diagram: This diagram shows how the user would interact with FishBot.](images/c4_syscontext_20260316.png)
Figure 1: This diagram shows how the user would interact with FishBot.

## Container Diagram
![FishBot Container Diagram: This diagram shows how the Warzone 2100 Game Engine interacts with FishBot.](images/c4_container_20260316.png)
Figure 2: This diagram shows how the Warzone 2100 Game Engine interacts with FishBot.

## Program Entry Flowchart
![FishBot Program Entry Diagram: This diagram shows the entry path for the bot code to begin executing.](images/c4_programentry_20260316.png)
Figure 3: This diagram shows the normal entry path for the bot code to begin executing.

## Automatic Testing Pipeline
FishBot is automatically tested 1v1 vs Cobra @ Hard / Medium difficulty on T2-NoBase maps.
As part of v0.4.1, a new testing pipeline is added was added to standardise and automate these tests.
1. `set_autogame_config.py` contains functions to generate Python-native config files according to the type of automatic test desired.
2. Optionally, `create_1v1_challenge_json.py` converts these Python-native config files into physical `.json` files which are then saved into the `wz2100_config_directory/tests` folder.
3. `run_and_save_autogames.py` automatically runs all tests in the `wz2100_config_directory/tests` folder and saves the results to an intermediate `jsonl` file.
    - `jsonl` is picked for its pure-append capability (data robustness to runtime failures) and its native data storage format (which makes extraction of data into Python a one-liner). 
    - Increased storage memory  requirements and write speed are not critical for this application.
4. `process_autogame_results.py` reads the `jsonl` formatted results and displays match statistics and summary plots.
