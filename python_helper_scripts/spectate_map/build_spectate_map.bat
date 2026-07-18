pyinstaller ^
--onedir ^
--windowed ^
--name spectate_map ^
--distpath .\dist ^
--contents-directory _internal ^
--clean spectate_map.py && ^
move dist\spectate_map\* ..\..\ && ^
move dist\spectate_map\_internal ..\..\ && ^
rmdir /s /q build dist && del spectate_map.spec

pause