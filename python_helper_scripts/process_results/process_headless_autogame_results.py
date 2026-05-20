"""
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
"""


def get_stats(file_path: str):
    import re

    # assumes Fishbot is in player "1" position and the enemy AI is in the player "2" position

    with open(file_path, "r", encoding="utf-8") as f:
        data = f.read()

    # Split by "Game ended" to count per game
    games = re.split(r"Game ended", data)
    games = games[1:len(games)]     # Truncate off the first entry
    cleaned_games = [g.split("[displayGameOver:388]")[0] for g in games]
    cleaned_games = [g.split("\n--------------------------------------------------------------------------------------\ninfo    |")[0] for g in cleaned_games]

    game_times_mins = [int(g.split("[gameTime: ")[1].split("]\n")[0]) / 1000 / 60 for g in cleaned_games]

    cleaned_stats = [g.split("Yellow-Fish |")[1] for g in cleaned_games]
    cleaned_stats = [g.split("\n--------------------------------------------------------------------------------------\n")[0] for g in cleaned_stats]

    del file_path, f, data, games, re

    # Separate fishbot vs other bot stats
    fishbot_stats = []
    opp_stats = []

    stat_column_definitions = [
        "Extracted Power",
        "Units Killed",
        "Structs (F/R)",
        "Units Alive",
        "Power",
        "Loss"
    ]

    for stat in cleaned_stats:
        split_stats = stat.split("\n")[0:2]     # Want 1st entry = Fishbot & second entry = opponent

        fishbot_raw_nums = [n.strip() for n in split_stats[0].split("|")]
        fishbot_raw_nums[-1] = False if fishbot_raw_nums[-1] == "" else True
        fishbot_formatted_nums = dict(zip(stat_column_definitions, fishbot_raw_nums))
        fishbot_stats.append(fishbot_formatted_nums)

        opp_raw_nums = [n.strip() for n in split_stats[1][19:].split("|")]  # Truncates off the first 18 characters = opponent bot name
        opp_raw_nums[-1] = False if opp_raw_nums[-1] == "" else True
        opp_formatted_nums = dict(zip(stat_column_definitions, opp_raw_nums))
        opp_stats.append(opp_formatted_nums)

    del cleaned_stats, stat_column_definitions, stat, split_stats, fishbot_raw_nums, fishbot_formatted_nums, opp_raw_nums, opp_formatted_nums

    """
    WIN / LOSS STATISTICS
    """
    fishbot_losses = []
    loss_counter = 0
    for s in fishbot_stats:
        fishbot_losses.append(s["Loss"])
        if s["Loss"]:
            loss_counter += 1

    print(f"FishBot won {len(fishbot_stats) - loss_counter} of {len(fishbot_stats)} games.")

    return [game_times_mins, fishbot_stats, opp_stats]

def show_stats(game_times_mins, fishbot_stats, opp_stats, title="", legend="", figNum=1):
    import matplotlib.pyplot as plt
    from math import floor

    """
    K/D STATISTICS
    """
    kd_stat = []

    # Get raw K/D data
    for i, stat in enumerate(fishbot_stats):
        d = opp_stats[i]["Units Killed"]
        k = stat["Units Killed"]
        if d == 0:
            d = 1       # prevent undef
        kd_stat.append(int(k) / int(d))

    del i, stat, k, d

    # Display raw K/D data
    plt.figure(1) # You can assign a figure number
    plt.hist(kd_stat, bins=floor(max(kd_stat))*2, alpha=0.7, align='left')
    plt.xlabel("K/D")
    plt.ylabel("Frequency")
    plt.title("Histogram of K/D")
    plt.legend(legend)
    plt.pause(0.1)

    """
    POWER STATISTICS
    """
    power_stat = []

    # Get raw K/D data
    for i, stat in enumerate(fishbot_stats):
        opp_power = opp_stats[i]["Extracted Power"]
        my_power = stat["Extracted Power"]
        if opp_power == 0:
            opp_power = 1       # prevent undef
        power_stat.append(int(my_power) / int(opp_power))

    del i, stat, opp_power, my_power

    # Display power extracted data
    plt.figure(4) # You can assign a figure number
    plt.hist(power_stat, bins=4, alpha=0.7, align='left')
    plt.xlabel("Power Extracted Ratio (FishBot / opponent)")
    plt.ylabel("Frequency")
    plt.title("Histogram of Ratio of Extracted Power")
    plt.legend(legend)
    plt.pause(0.1)

    """
    TIME TO WIN / LOSE STATISTICS
    """

    time_to_win = []
    time_to_lose = []
    for i, game_time in enumerate(game_times_mins):
        if not(fishbot_stats[i]["Loss"]):
            time_to_win.append(game_time)
        else:
            time_to_lose.append(game_time)

    plt.figure(figNum) # You can assign a figure number
    plt.hist(time_to_lose, bins=10, color='red', alpha=0.7, align='left')
    plt.hist(time_to_win, bins=10, color='green', alpha=0.7, align='left')
    plt.xlabel("Game times (mins) - wins (green) & losses (red)")
    plt.ylabel("Frequency")
    plt.ylim(bottom=0, top=40)
    plt.title(f"{title} - Histogram of Game times (mins)")
    # plt.show()
    plt.pause(0.1)

# TEST CODE
from os import getcwd

V3_RESULTS_DIR = rf"{getcwd()}\python_helper_scripts\process_results\v3/"
V4_RESULTS_DIR = rf"{getcwd()}\python_helper_scripts\process_results\v4/"

extract_commit = lambda text: text.split(rf"v4/")[1].split(",")[0]      # uses specific characters in Vx_RESULTS_DIR

TFE = ".txt"

def show_medium_cobra_results():
    # test_1 = V3_RESULTS_DIR + "29ceeb0,med,463" + TFE               # v3 dev: [143 / 150 wins]
    # test_1 = V4_RESULTS_DIR + "a2e13b4,med,cobra_v3_release" + TFE    # v3 release: retesting [98 / 100 wins]
    # test_1 = V4_RESULTS_DIR + "021d39e,med,cobra,100g" + TFE                # 97 / 100 won (v0.3.1 release)
    # test_1 = V4_RESULTS_DIR + "4d60e4f,med,cobra,100g" + TFE                # 100 / 100 won (v0.3.2 release)
    test_1 = V4_RESULTS_DIR + "b6c85a5,med,cobra,50g" + TFE                # 50 / 50 won (v0.3.3 release)
    test_2 = V4_RESULTS_DIR + "4e03988,med,cobra,50g" + TFE                # 49 / 50 won (v0.4.0 release; wins a lot slower)
    
    commit1 = extract_commit(test_1)
    commit2 = extract_commit(test_2)

    show_stats(*get_stats(test_1), title=f"{commit1} (before)", figNum=2)                             
    show_stats(*get_stats(test_2), title=f"{commit2} (after)", legend=[commit1, commit2], figNum=3)   

def show_hard_cobra_results():
    # test_1 = V4_RESULTS_DIR + "021d39e,hard,cobra,100g" + TFE             #  79 / 100 -> v0.3.1 release candidate (reverted removal of median location)
    # test_1 = V4_RESULTS_DIR + "4d60e4f,hard,cobra,100g" + TFE               # v0.3.2 release -- 94 / 100 won (refined production & research after migration)
    # test_1 = V4_RESULTS_DIR + "b6c85a5,hard,cobra,50g" + TFE                # v0.3.3 release -- 48 / 50 won (research collision patch)
    # test_1 = V4_RESULTS_DIR + "83bf457,hard,cobra,100g" + TFE                # v0.3.4 dev -- 92 / 100 won (brigade system dev)
    # test_1 = V4_RESULTS_DIR + "727b189,hard,cobra,99g" + TFE                # v0.3.4 dev -- 88 / 99 won (after brigade system merge)
    # test_1 = V4_RESULTS_DIR + "4f7f8e8,hard,cobra,100g" + TFE                # v0.4.0 dev -- 94 / 100 won (just before repair facility merge)
    # test_2 = V4_RESULTS_DIR + "d114112,hard,cobra,100g" + TFE                # v0.4.0 dev -- 97 / 100 won (after repair facility optimisations)
    # test_1 = V4_RESULTS_DIR + "4e03988,hard,cobra,100g" + TFE                # v0.4.0 dev -- 94 / 100 won (after further optimisations)
    test_1 = V4_RESULTS_DIR + "5d83634,hard,cobra,50g" + TFE                # v0.4.0 dev -- 45 / 50 won (after performance optim)
    test_2 = V4_RESULTS_DIR + "02d990f,hard,cobra,50g" + TFE                # v0.4.0 dev -- 46 / 50 won (after enumRangeLazy)

    commit1 = extract_commit(test_1)
    commit2 = extract_commit(test_2)

    show_stats(*get_stats(test_1), title=f"{commit1} (before)", figNum=2)                             
    show_stats(*get_stats(test_2), title=f"{commit2} (after)", legend=[commit1, commit2], figNum=3)     

def show_insane_diff_results():
    # test_1 = V4_RESULTS_DIR + "5c757ab,ins,2v1" + TFE               # v4 dev: v3 skrush against 2x nexus @insane
    # test_1 = V4_RESULTS_DIR + "5c757ab,hardins,1v2" + TFE           # v4 dev: v3 skrush 1x hard, 1x insane nexus        [39 / 50 wins]
    # test_1 = V4_RESULTS_DIR + "1df2117,hardins,1v2" + TFE           # v4 dev: v3 skrush 1x hard, 1x insane nexus, after perf optimisations [42 / 50 wins]
    # test_1 = V4_RESULTS_DIR + "c7d8eb7,hardins,1v2,targoptim" + TFE           # v4 dev: v3 skrush 1x hard, 1x ins nexus, targeting optimisations - cancelVtol [33 / 50 wins]
    # test_1 = V4_RESULTS_DIR + "4aee90e,hardins,1v2,vtolfix" + TFE           # v4 dev: v3 skrush 1x hard, 1x ins nexus, fixed vtol usage [38 / 50 wins]
    # test_1 = V4_RESULTS_DIR + "e8c65ad,hardins,1v2" + TFE           # v4 dev: mid-grid system migration [55% wr]
    # test_1 = V4_RESULTS_DIR + "4d60e4f,ins,cobra,100g" + TFE           #  (v0.3.2 release) [8% wr; 1v1 vs Cobra Insane]
    # test_1 = V4_RESULTS_DIR + "4f7f8e8,insane,cobra,50g" + TFE           #  (v0.4.0-dev) 27/50 = 54% wr (just before repair facility merge)
    # test_2 = V4_RESULTS_DIR + "4f7f8e8,1v3,nexushard" + TFE           #  (v0.4.0-dev) 26/50 = 52% wr (just before repair facility merge)
    # test_2 = V4_RESULTS_DIR + "d114112,ins,cobra,50g" + TFE           #  (v0.4.0-dev) 24/50 = 48% wr (after performance optimisations)
    # test_1 = V4_RESULTS_DIR + "4e03988,insane,cobra,50g" + TFE           #  (v0.4.0 release) 26/50 = 48% wr 
    test_1 = V4_RESULTS_DIR + "ed7f401,insane,cobra,50g,incend" + TFE           #  (v0.4.1-dev) 30/50 = 48% wr (incend mortar, light body only)
    test_2 = V4_RESULTS_DIR + "4bfcf83,insane,cobra,50g,ppt" + TFE           #  (v0.4.1-dev) 29/50 = 48% wr (pepperpot, light body only)
    
    commit1 = extract_commit(test_1)
    commit2 = extract_commit(test_2)

    show_stats(*get_stats(test_1), title=f"{commit1} (earlier)", legend=[commit1, commit2], figNum=2)            
    show_stats(*get_stats(test_2), title=f"{commit2} (newer)", legend=[commit1, commit2], figNum=3)    


# show_medium_cobra_results()
show_hard_cobra_results()
# show_insane_diff_results()

import matplotlib.pyplot as plt
plt.show()
