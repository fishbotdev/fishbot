for /L %%i in (1,1,300) do (
	"Warzone 2100\bin\warzone2100.exe" --configdir="C:\Users\%USERNAME%\OneDrive\Documents\wz2100_config_dir" --skirmish="MELTING.json" --enableconsole

)

pause