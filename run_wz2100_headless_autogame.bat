for /L %%i in (1,1,25) do (
	echo iteration %%i
	"Warzone 2100\bin\warzone2100.exe" --configdir="C:\Users\%USERNAME%\OneDrive\Documents\wz2100_config_dir" --skirmish="GAMMA_MEDIUM_COBRA_T2.json" --enableconsole --headless --autogame
)

:: json template:
:: https://github.com/Warzone2100/warzone2100/blob/ebeaaa7958f35879eea7b57474eff0c89aa4fb03/data/mp/tests/highground.json

:: command line parameters:
:: https://github.com/Warzone2100/warzone2100/blob/ebeaaa7958f35879eea7b57474eff0c89aa4fb03/src/clparse.cpp#L21

pause

