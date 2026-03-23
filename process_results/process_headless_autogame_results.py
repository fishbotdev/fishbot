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


def show_medium_cobra_results():
    # test_1 = getcwd() + rf"\process_results/v3/" + "29ceeb0,med,463" + ".txt"               # v3 dev: [143 / 150 wins]
    test_1 = getcwd() + rf"\process_results/v4/" + "a2e13b4,med,cobra_v3_release" + ".txt"    # v3 release: retesting [98 / 100 wins]
    # test_1 = getcwd() + rf"\process_results/v4/" + "1e3edc5,med,cobra" + ".txt"               # v4 dev: before perf optimisations [96 / 100 won]
    # test_1 = getcwd() + rf"\process_results/v4/" + "0c6d165,med,cobra,100g" + ".txt"               # perf: removed getAllBaseTargets [95 / 100 won]
    # test_1 = getcwd() + rf"\process_results/v4/" + "2167472,med,cobra,50g" + ".txt"               # perf: before merging performance-improvements [49 / 49 won]
    # test_1 = getcwd() + rf"\process_results/v4/" + "f9d0fd4,med,cobra,50g" + ".txt"               # perf: after merging perf-optim2 [49 / 50 won], higher K/D
    # test_1 = getcwd() + rf"\process_results/v4/" + "45635e6,med,cobra,100g" + ".txt"               # perf: after migrating into fixed time hashing [96 / 100 won]
    # test_1 = getcwd() + rf"\process_results/v4/" + "7ee8c56,med,cobra,100g" + ".txt"               # perf: migrating to new grid system [91 / 100 won (regression)]
    # test_1 = getcwd() + rf"\process_results/v4/" + "df4a549,med,cobra,100g" + ".txt"               # perf: migrating to new grid system [97 / 100 won; regression fixed]
    # test_1 = getcwd() + rf"\process_results/v4/" + "a686079,med,cobra,100g" + ".txt"               # 99 / 100 won, after vtol optimisations
    # test_2 = getcwd() + rf"\process_results/v4/" + "db393ea,med,cobra,150g" + ".txt"               # 149 / 150 won
    test_2 = getcwd() + rf"\process_results/v4/" + "868e56f,med,cobra,150g" + ".txt"               # 149 / 150 won [v0.3.1 release]
    
    commit1 = test_1.split(rf"v4/")[1].split(",")[0]
    commit2 = test_2.split(rf"v4/")[1].split(",")[0]

    show_stats(*get_stats(test_1), title=f"{commit1} (before)", figNum=2)                             
    show_stats(*get_stats(test_2), title=f"{commit2} (after)", legend=[commit1, commit2], figNum=3)   

def show_hard_cobra_results():
    test_1 = getcwd() + rf"\process_results/v3/" + "29ceeb0,hard,463" + ".txt"              # v3 dev: 4.6.3, [63/86 wins] long term test
    # test_1 = getcwd() + rf"\process_results/v4/" + "6966b26,hard,cobra,50g" + ".txt"              # v4 dev: 4.6.3 [60 % wr; baseline for cannon test]
    # test_1 = getcwd() + rf"\process_results/v4/" + "f50adb5,hard,cobra,50g" + ".txt"              # v4 dev: 4.6.3 [78 % wr; cannon test]
    # test_1 = getcwd() + rf"\process_results/v4/" + "db393ea,hard,cobra,50g" + ".txt"              # v4 dev: 4.6.3 [74 % wr; cannon test + cas changes]
    # test_1 = getcwd() + rf"\process_results/v4/" + "db7403d,hard,cobra,100g" + ".txt"              # v4 dev: 4.6.3 [57 % wr; migrated sector defence to grid system]
    test_2 = getcwd() + rf"\process_results/v4/" + "cf7b597,hard,cobra,100g" + ".txt"              # close to v0.3.1 release [61 % wr] 

    commit1 = test_1.split(rf"v3/")[1].split(",")[0]
    commit2 = test_2.split(rf"v4/")[1].split(",")[0]

    show_stats(*get_stats(test_1), title=f"{commit1} (before)", figNum=2)                             
    show_stats(*get_stats(test_2), title=f"{commit2} (after)", legend=[commit1, commit2], figNum=3)     

def show_insane_diff_results():

    # test_1 = getcwd() + rf"\process_results/v4/" + "5c757ab,ins,2v1" + ".txt"               # v4 dev: v3 skrush against 2x nexus @insane
    # test_1 = getcwd() + rf"\process_results/v4/" + "5c757ab,hardins,1v2" + ".txt"           # v4 dev: v3 skrush 1x hard, 1x insane nexus        [39 / 50 wins]
    # test_1 = getcwd() + rf"\process_results/v4/" + "1df2117,hardins,1v2" + ".txt"           # v4 dev: v3 skrush 1x hard, 1x insane nexus, after perf optimisations [42 / 50 wins]
    # test_1 = getcwd() + rf"\process_results/v4/" + "c7d8eb7,hardins,1v2,targoptim" + ".txt"           # v4 dev: v3 skrush 1x hard, 1x ins nexus, targeting optimisations - cancelVtol [33 / 50 wins]
    test_1 = getcwd() + rf"\process_results/v4/" + "4aee90e,hardins,1v2,vtolfix" + ".txt"           # v4 dev: v3 skrush 1x hard, 1x ins nexus, fixed vtol usage [38 / 50 wins]
    test_2 = getcwd() + rf"\process_results/v4/" + "e8c65ad,hardins,1v2" + ".txt"           # v4 dev: mid-grid system migration [66% wr]
    
    commit1 = test_1.split(rf"v4/")[1].split(",")[0]
    commit2 = test_2.split(rf"v4/")[1].split(",")[0]

    show_stats(*get_stats(test_1), title=f"{commit1} (earlier)", legend=[commit1, commit2], figNum=2)            
    show_stats(*get_stats(test_2), title=f"{commit2} (newer)", legend=[commit1, commit2], figNum=3)    


# show_medium_cobra_results()
show_hard_cobra_results()
# show_insane_diff_results()

import matplotlib.pyplot as plt
plt.show()
