:: I cloned fishbot into a new configuration directory ('PRODCONFIG') & am running autogames from this 'production' folder.
:: This means I can run autogames & perform development simultaneously using the same WZ2100 .exe, e.g. 
:: different config directories for dev / prod = different mods directories = different fishbot instances

:: PRODCONFIG is a clone of the devconfig folder.
:: This means that changes to the development config directory (e.g. new items in the 'tests' folder) can be pulled from VC

for /L %%i in (1,1,100) do (
	echo iteration %%i
	"Warzone 2100\bin\warzone2100.exe" --configdir="Warzone 2100\PRODCONFIG" --skirmish="GAMMA_HARD_COBRA_T2.json" --enableconsole --headless --autogame
)

:: json template:
:: https://github.com/Warzone2100/warzone2100/blob/ebeaaa7958f35879eea7b57474eff0c89aa4fb03/data/mp/tests/highground.json

:: command line parameters:
:: https://github.com/Warzone2100/warzone2100/blob/ebeaaa7958f35879eea7b57474eff0c89aa4fb03/src/clparse.cpp#L21

pause

