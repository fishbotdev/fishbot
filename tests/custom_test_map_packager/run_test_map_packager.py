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

"""
This runs the custom-map packager pipeline which enables automatic bot-vs-bot testing.
For docs: please see `README(test_map_packager).md`.
"""
try:
    import _map_packager as packager
except ImportError:
    try:
        from . import _map_packager as packager
    except ImportError:
        raise ImportError("Failed to import `_map_packager.py`")


from pathlib import Path


def print_report_pretty(report) -> None:
    """
    Pretty-print a batch processing report.
    """

    total = len(report)
    passed = sum(item["success"] for item in report)
    failed = total - passed

    print("=" * 60)
    print("Map Conversion Report")
    print("=" * 60)
    print(f"Total maps : {total}")
    print(f"Succeeded : {passed}")
    print(f"Failed    : {failed}")

    if failed == 0:
        print("\nAll maps converted successfully.")
        return

    print("\nFailures:")
    print("-" * 60)

    for item in report:
        if item["success"]:
            continue

        print(f"{item['map']}")
        print(f"    {item['error']}")

    print("=" * 60)


def run_batch_map_packaging(source_dir: Path, output_dir: Path) -> list:
    results = []

    folder_names = sorted(
        p for p in source_dir.iterdir()
        if p.is_dir()
    )

    for folder_name in folder_names:
        try:
            output = packager.repackage_map(folder_name, output_dir)
            results.append({
                "map": folder_name.name,
                "success": True,
                "error": None,
                "output": output,
            })
        except ValueError as e:
            results.append({
                "map": folder_name.name,
                "success": False,
                "error": str(e),
                "output": None,
            })

    return results


if __name__ == "__main__":

    SOURCE_DIRECTORY_NAME = 'v4.7.0_base_maps'
    source_directory = Path.cwd() / SOURCE_DIRECTORY_NAME

    # Example: Write directly to the dev/maps library
    output_directory = Path("~/OneDrive/Documents/wz2100_config_dir/maps").expanduser()

    batch_report = run_batch_map_packaging(source_directory, output_directory)

    print_report_pretty(batch_report)
