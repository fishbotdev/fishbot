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

# Disclaimer: this entire file is AI-generated.
import json
import os
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox
import subprocess
import ctypes
import sys

# =============================================================================
# Constants
# =============================================================================

if getattr(sys, "frozen", False):
    APP_DIR = Path(sys.executable).parent
else:
    APP_DIR = Path(__file__).parent

SETTINGS_FILE = APP_DIR / "__spectate_map_settings.json"
BATCH_FILE = APP_DIR / "__spectate_map.bat"


DEFAULT_TESTS_DIR = os.path.join(
    os.path.expanduser("~"),
    "OneDrive",
    "Documents",
    "wz2100_config_dir",
    "tests",
)

WARZONE_EXE = os.path.join(
    "Warzone 2100",
    "bin",
    "warzone2100.exe",
)

MAX_RECENT = 8
MAX_ITERATIONS = 300


# =============================================================================
# Application State
# =============================================================================

state = {
    "settings": {},
    "all_tests": [],
    "filtered_tests": [],
    "selected": None,
}


# =============================================================================
# Tkinter Widgets
# =============================================================================

root = None

search_var = None

search_entry = None

tests_listbox = None
recent_listbox = None

folder_label = None
status_label = None

run_button = None


# =============================================================================
# Settings
# =============================================================================

def load_settings():
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                state["settings"] = json.load(f)
        except Exception:
            state["settings"] = {}

    if "tests_dir" not in state["settings"]:
        state["settings"]["tests_dir"] = DEFAULT_TESTS_DIR

    if "recent" not in state["settings"]:
        state["settings"]["recent"] = []


def save_settings():
    with open(SETTINGS_FILE, "w") as f:
        json.dump(state["settings"], f, indent=4)


# =============================================================================
# Status
# =============================================================================

def set_status(text):
    if status_label is not None:
        status_label.config(text=text)


# =============================================================================
# Tests
# =============================================================================

def load_tests():

    tests_dir = state["settings"]["tests_dir"]

    state["all_tests"].clear()

    if not os.path.isdir(tests_dir):
        return False

    for filename in sorted(os.listdir(tests_dir)):
        if filename.lower().endswith(".json"):
            state["all_tests"].append(filename)

    state["filtered_tests"] = list(state["all_tests"])

    return True


# =============================================================================
# Recent Files
# =============================================================================

def add_recent(filename):

    recent = state["settings"]["recent"]

    if filename in recent:
        recent.remove(filename)

    recent.insert(0, filename)

    del recent[MAX_RECENT:]

    save_settings()


# =============================================================================
# Selection Helpers
# =============================================================================

def get_selected_filename():

    if state["selected"] is not None:
        return state["selected"]

    selection = tests_listbox.curselection()

    if selection:
        index = selection[0]
        return state["filtered_tests"][index]

    return None


def select_filename(filename):

    state["selected"] = filename


# =============================================================================
# Folder Helpers
# =============================================================================

def get_tests_dir():

    return state["settings"]["tests_dir"]


def get_config_dir():

    return str(Path(get_tests_dir()).parent)


def get_selected_full_path():

    filename = get_selected_filename()

    if filename is None:
        return None

    return os.path.join(
        get_tests_dir(),
        filename,
    )


# =============================================================================
# Utility
# =============================================================================

def refresh_recent_list():

    if recent_listbox is None:
        return

    recent_listbox.delete(0, tk.END)

    for filename in state["settings"]["recent"]:
        recent_listbox.insert(tk.END, filename)


def refresh_tests_list():

    if tests_listbox is None:
        return

    tests_listbox.delete(0, tk.END)

    for filename in state["filtered_tests"]:
        tests_listbox.insert(tk.END, filename)


# =============================================================================
# Filtering
# =============================================================================

def update_filter(*args):

    search = search_var.get().strip().lower()

    if search == "":
        state["filtered_tests"] = list(state["all_tests"])
    else:
        state["filtered_tests"] = [
            filename
            for filename in state["all_tests"]
            if search in filename.lower()
        ]

    refresh_tests_list()
    set_status(f"{len(state['filtered_tests'])} matching tests")


# =============================================================================
# Browse
# =============================================================================

def browse_tests_folder():

    folder = filedialog.askdirectory(
        title="Select Warzone Tests Folder",
        initialdir=get_tests_dir(),
    )

    if not folder:
        return

    state["settings"]["tests_dir"] = folder
    save_settings()

    folder_label.config(text=folder)

    if not load_tests():
        messagebox.showerror(
            "Error",
            "Selected folder does not contain any tests.",
        )
        return

    update_filter()
    refresh_recent_list()

    set_status("Loaded tests from new folder")


# =============================================================================
# Selection Events
# =============================================================================

def on_test_selected(event=None):

    selection = tests_listbox.curselection()

    if not selection:
        return

    filename = state["filtered_tests"][selection[0]]

    select_filename(filename)


def on_recent_selected(event=None):

    selection = recent_listbox.curselection()

    if not selection:
        return

    filename = state["settings"]["recent"][selection[0]]

    if filename in state["all_tests"]:

        select_filename(filename)

        search_var.set("")

        try:
            index = state["filtered_tests"].index(filename)
            tests_listbox.selection_clear(0, tk.END)
            tests_listbox.selection_set(index)
            tests_listbox.see(index)
        except ValueError:
            pass


# =============================================================================
# Keyboard
# =============================================================================

def on_escape(event=None):

    search_var.set("")
    return "break"


# =============================================================================
# GUI
# =============================================================================

def create_gui():

    global root
    global search_var

    global search_entry
    global tests_listbox
    global recent_listbox

    global folder_label
    global status_label

    global run_button

    # Fix the blurry text by enabling DPI awareness
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass  # Fallback for non-Windows systems

    root = tk.Tk()
    root.title("Warzone Test Runner")
    root.geometry("900x850")
    root.minsize(800, 700)

    #
    # Search
    #

    tk.Label(
        root,
        text="Search (ID or map name)",
        font=("Segoe UI", 10, "bold"),
    ).pack(anchor="w", padx=10, pady=(10, 0))

    search_var = tk.StringVar()
    search_var.trace_add("write", update_filter)

    search_entry = tk.Entry(
        root,
        textvariable=search_var,
    )

    search_entry.pack(
        fill="x",
        padx=10,
    )

    search_entry.bind("<Escape>", on_escape)

    #
    # Available Tests
    #

    tk.Label(
        root,
        text="Available Tests - Double-click to run",
        font=("Segoe UI", 10, "bold"),
    ).pack(anchor="w", padx=10, pady=(10, 0))

    tests_frame = tk.Frame(root)
    tests_frame.pack(fill="both", expand=True, padx=10)

    scrollbar = tk.Scrollbar(tests_frame)

    tests_listbox = tk.Listbox(
        tests_frame,
        yscrollcommand=scrollbar.set,
    )

    scrollbar.config(command=tests_listbox.yview)

    scrollbar.pack(side="right", fill="y")
    tests_listbox.pack(side="left", fill="both", expand=True)

    #
    # Recent
    #

    tk.Label(
        root,
        text="Recent - Double-click to run",
        font=("Segoe UI", 10, "bold"),
    ).pack(anchor="w", padx=10, pady=(10, 0))

    recent_listbox = tk.Listbox(
        root,
        height=8,
    )

    recent_listbox.pack(
        fill="x",
        padx=10,
    )

    recent_listbox.bind(
        "<<ListboxSelect>>",
        on_recent_selected,
    )

    #
    # Folder
    #

    tk.Label(
        root,
        text="Tests Folder",
        font=("Segoe UI", 10, "bold"),
    ).pack(anchor="w", padx=10, pady=(10, 0))

    folder_label = tk.Label(
        root,
        text=get_tests_dir(),
        anchor="w",
        justify="left",
    )

    folder_label.pack(
        fill="x",
        padx=10,
    )

    #
    # Buttons
    #

    button_frame = tk.Frame(root)
    button_frame.pack(
        fill="x",
        padx=10,
        pady=10,
    )

    tk.Button(
        button_frame,
        text="Browse...",
        command=browse_tests_folder,
    ).pack(
        side="left",
    )

    run_button = tk.Button(
        button_frame,
        text="Run Selected",
        width=16,
    )

    run_button.pack(
        side="right",
    )

    #
    # Status
    #

    status_label = tk.Label(
        root,
        text="Ready",
        anchor="w",
        relief="sunken",
    )

    status_label.pack(
        fill="x",
        side="bottom",
    )

    refresh_tests_list()
    refresh_recent_list()

    search_entry.focus_set()

# =============================================================================
# Run
# =============================================================================

def run_selected(event=None):

    filename = get_selected_filename()

    if filename is None:
        messagebox.showwarning(
            "No Selection",
            "Please select a test first.",
        )
        return

    add_recent(filename)
    refresh_recent_list()

    set_status(f"Running {filename}...")

    config_dir = get_config_dir()

    batch_contents = f"""@echo off

    cd /d "%~dp0"

    for /L %%i in (1,1,300) do (
        "%~dp0{WARZONE_EXE}" ^
            --configdir="{config_dir}" ^
            --skirmish="{filename}" ^
            --enableconsole
    )

    pause
    """

    with open(BATCH_FILE, "w", newline="\r\n") as f:
        f.write(batch_contents)

    root.destroy()

    subprocess.Popen(
        ["cmd.exe", "/c", BATCH_FILE],
        creationflags=subprocess.CREATE_NEW_CONSOLE,
    )


# =============================================================================
# Startup
# =============================================================================

def ensure_tests_folder():

    while not os.path.isdir(get_tests_dir()):

        messagebox.showinfo(
            "Select Tests Folder",
            "Please select your Warzone tests folder.",
        )

        folder = filedialog.askdirectory(
            title="Select Warzone Tests Folder",
        )

        if not folder:
            root.destroy()
            return False

        state["settings"]["tests_dir"] = folder
        save_settings()

    return True


# =============================================================================
# Main
# =============================================================================

def main():

    load_settings()

    create_gui()

    if not ensure_tests_folder():
        return

    folder_label.config(
        text=get_tests_dir()
    )

    load_tests()
    refresh_tests_list()
    refresh_recent_list()

    run_button.config(
        command=run_selected
    )

    #
    # Double-click immediately runs
    #

    tests_listbox.bind(
        "<Double-Button-1>",
        run_selected,
    )

    recent_listbox.bind(
        "<Double-Button-1>",
        run_selected,
    )

    set_status(
        f"{len(state['all_tests'])} tests loaded"
    )

    root.mainloop()


# =============================================================================

if __name__ == "__main__":
    raise NotImplementedError("\n\n"
                              "Please build the application using: `build_spectate_map.bat`. \n"
                              "Then, open `spectate_map.exe` from the root `fishbot` directory.\n"
                              "This application assumes the local Warzone 2100 installation is in: \n\t"
                              "`fishbot/Warzone2100/bin/warzone2100.exe`.")
