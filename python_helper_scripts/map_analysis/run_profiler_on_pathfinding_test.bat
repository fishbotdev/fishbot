call ..\..\.venv\Scripts\activate.bat

python -m kernprof -l pathfinding_test.py

python -m line_profiler pathfinding_test.py.lprof

pause
